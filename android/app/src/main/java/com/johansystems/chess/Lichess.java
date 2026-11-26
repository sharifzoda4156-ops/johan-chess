package com.johansystems.chess;

import android.content.SharedPreferences;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import java.util.concurrent.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

// The only network client for online play. Tokens never enter the WebView.
final class Lichess {
    private static final String HOST="https://lichess.org", CLIENT="johan-chess-android", ALIAS="johan-lichess-v1";
    private final MainActivity activity;
    private final SharedPreferences prefs;
    private final SecretKey key;
    private final ExecutorService streams=Executors.newCachedThreadPool();
    private volatile String token="",username="";
    private volatile boolean closed=false,needsSync=false;
    private volatile long rateUntil=0;
    private volatile ServerSocket loginSocket;
    private JSONObject account=new JSONObject(),full=null,state=null;
    private JSONArray ongoing=new JSONArray(),incoming=new JSONArray();
    private String gameId="",notice="";
    private Stream events,game,waiting;
    private boolean terminal=false;
    private long revision=0;
    Lichess(MainActivity a)throws Exception{
        activity=a;prefs=a.getSharedPreferences("lichess",0);
        KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
        if(!ks.containsAlias(ALIAS)){
            KeyGenerator g=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
            g.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());g.generateKey();
        }
        key=(SecretKey)ks.getKey(ALIAS,null);
        String s=prefs.getString("session","");
        if(!s.isEmpty()){
            byte[] b=Base64.decode(s,Base64.NO_WRAP);
            Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key,new GCMParameterSpec(128,Arrays.copyOfRange(b,0,12)));
            JSONObject p=new JSONObject(new String(c.doFinal(Arrays.copyOfRange(b,12,b.length)),StandardCharsets.UTF_8));
            token=p.getString("token");username=p.getString("username");
        }
        needsSync=prefs.getBoolean("onlineLock",false);
    }
    private void save(String t,String u)throws Exception{
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key);
        byte[] iv=c.getIV(),enc=c.doFinal(new JSONObject().put("token",t).put("username",u).toString().getBytes(StandardCharsets.UTF_8));
        byte[] b=Arrays.copyOf(iv,iv.length+enc.length);System.arraycopy(enc,0,b,iv.length,enc.length);
        if(!prefs.edit().putString("session",Base64.encodeToString(b,Base64.NO_WRAP)).commit())throw new IOException("Не удалось сохранить вход");
        token=t;username=u;
    }
    synchronized boolean locked(){return needsSync||waiting!=null||(!gameId.isEmpty()&&!terminal);}
    private synchronized void persistLock(){prefs.edit().putBoolean("onlineLock",locked()).commit();}
    private static String b64(byte[] b){return Base64.encodeToString(b,Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING);}
    private static String random(){byte[] b=new byte[32];new SecureRandom().nextBytes(b);return b64(b);}
    private static String form(String... pairs)throws Exception{StringBuilder s=new StringBuilder();for(int i=0;i<pairs.length;i+=2){if(i>0)s.append('&');s.append(URLEncoder.encode(pairs[i],"UTF-8")).append('=').append(URLEncoder.encode(pairs[i+1],"UTF-8"));}return s.toString();}
    private static String nick(String s)throws IOException{if(s==null||!s.matches("[A-Za-z0-9_-]{1,30}"))throw new IOException("Неверный ник Lichess");return s;}
    private static String id(String s)throws IOException{if(s==null||!s.matches("[A-Za-z0-9]{8}"))throw new IOException("Неверный ID");return s;}
    private void requireLogin()throws IOException{if(token.isEmpty())throw new IOException("Войди в Lichess");}
    private HttpURLConnection connection(String path,String method,String auth,String data,String accept)throws Exception{
        if(closed)throw new IOException("Клиент закрыт");
        if(System.currentTimeMillis()<rateUntil)throw new IOException("Лимит Lichess: повтори через минуту");
        URL u=new URL(HOST+path);if(!"https".equals(u.getProtocol())||!"lichess.org".equals(u.getHost())||u.getPort()!=-1)throw new IOException("Неверный адрес");
        HttpURLConnection c=(HttpURLConnection)u.openConnection();
        c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(30000);c.setRequestMethod(method);
        c.setRequestProperty("Accept",accept);c.setRequestProperty("User-Agent","JohanChess/0.1 (Android)");
        if(auth!=null&&!auth.isEmpty())c.setRequestProperty("Authorization","Bearer "+auth);
        if(data!=null){c.setDoOutput(true);c.setRequestProperty("Content-Type","application/x-www-form-urlencoded");byte[] bytes=data.getBytes(StandardCharsets.UTF_8);c.setFixedLengthStreamingMode(bytes.length);}
        return c;
    }
    private void send(HttpURLConnection c,String data)throws Exception{
        if(data!=null)try(OutputStream out=c.getOutputStream()){out.write(data.getBytes(StandardCharsets.UTF_8));}
        int code=c.getResponseCode();
        if(code==429)rateUntil=System.currentTimeMillis()+60000;
        if(code<200||code>=300)throw new IOException("Lichess HTTP "+code+(code==401?" · войди заново":code==429?" · подожди минуту":""));
    }
    private static String read(InputStream in,int limit)throws Exception{
        ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[4096];int n;
        while((n=in.read(b))!=-1){if(out.size()+n>limit)throw new IOException("Ответ слишком большой");out.write(b,0,n);}return out.toString("UTF-8");
    }
    private String request(String path,String method,String auth,String data,String accept,int limit)throws Exception{
        HttpURLConnection c=connection(path,method,auth,data,accept);try{send(c,data);try(InputStream in=c.getInputStream()){return read(in,limit);}}finally{c.disconnect();}
    }
    private JSONObject json(String path,String method,String data)throws Exception{
        requireLogin();String body=request(path,method,token,data,"application/json",1000000);return body.trim().isEmpty()?new JSONObject():new JSONObject(body);
    }
    private JSONArray ndjson(String path,int max)throws Exception{
        requireLogin();HttpURLConnection c=connection(path,"GET",token,null,"application/x-ndjson");
        JSONArray out=new JSONArray();
        try{send(c,null);try(BufferedReader in=new BufferedReader(new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8))){String line;while(out.length()<max&&(line=in.readLine())!=null){if(line.length()>500000)throw new IOException("Строка слишком большая");if(!line.trim().isEmpty())out.put(new JSONObject(line));}}return out;}finally{c.disconnect();}
    }
    private JSONObject login()throws Exception{
        if(locked())throw new IOException("Сначала заверши или синхронизируй онлайн-партию");
        String verifier=random(),stateToken=random(),code=null;String redirect;
        try(ServerSocket server=new ServerSocket()){
            server.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"),0));loginSocket=server;
            redirect="http://127.0.0.1:"+server.getLocalPort()+"/lichess";
            String url=HOST+"/oauth?"+form("response_type","code","client_id",CLIENT,"redirect_uri",redirect,"scope","board:play challenge:read challenge:write follow:read follow:write","state",stateToken,"code_challenge_method","S256","code_challenge",b64(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII))));
            activity.openBrowser(url);long end=System.currentTimeMillis()+300000;
            while(System.currentTimeMillis()<end){
                server.setSoTimeout((int)Math.max(1,end-System.currentTimeMillis()));
                try(Socket socket=server.accept()){
                    socket.setSoTimeout(2500);InputStream in=socket.getInputStream();ByteArrayOutputStream line=new ByteArrayOutputStream();int ch;
                    while((ch=in.read())!=-1&&ch!='\n'){if(line.size()>8192)throw new IOException("Неверный callback");if(ch!='\r')line.write(ch);}
                    String[] parts=line.toString("UTF-8").split(" ");
                    Uri callback=parts.length==3&&"GET".equals(parts[0])&&parts[1].startsWith("/lichess?")?Uri.parse("http://127.0.0.1"+parts[1]):null;
                    boolean ok=callback!=null&&stateToken.equals(callback.getQueryParameter("state"));
                    byte[] body=(ok?"Return to Johan Chess.":"Invalid callback.").getBytes(StandardCharsets.UTF_8);
                    OutputStream out=socket.getOutputStream();out.write(("HTTP/1.1 "+(ok?"200 OK":"400 Bad Request")+"\r\nContent-Type: text/plain\r\nCache-Control: no-store\r\nContent-Length: "+body.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));out.write(body);out.flush();
                    if(ok){code=callback.getQueryParameter("code");break;}
                }catch(SocketTimeoutException ignored){}
            }
        }finally{loginSocket=null;}
        if(code==null||code.isEmpty())throw new IOException("Вход отменён или истёк");
        JSONObject t=new JSONObject(request("/api/token","POST",null,form("grant_type","authorization_code","client_id",CLIENT,"redirect_uri",redirect,"code",code,"code_verifier",verifier),"application/json",20000));
        String access=t.getString("access_token");if(access.isEmpty()||!"Bearer".equalsIgnoreCase(t.getString("token_type")))throw new IOException("Неверный OAuth ответ");
        JSONObject profile=new JSONObject(request("/api/account","GET",access,null,"application/json",500000));String name=nick(profile.getString("username"));
        synchronized(this){stopStreams();save(access,name);account=profile;full=null;state=null;gameId="";terminal=false;needsSync=true;persistLock();}
        return refresh();
    }
    private final class Stream {
        final String kind,path,method,body,auth;
        volatile HttpURLConnection connection;volatile boolean canceled=false,ready=false;
        Stream(String k,String p,String m,String b){kind=k;path=p;method=m;body=b;auth=token;}
        void cancel(){canceled=true;HttpURLConnection c=connection;if(c!=null)c.disconnect();}
        void start(){streams.execute(()->{
            String error="";
            try{
                HttpURLConnection c=Lichess.this.connection(path,method,auth,body,"application/x-ndjson");connection=c;if(canceled)return;
                c.setReadTimeout(45000);send(c,body);ready=true;
                try(BufferedReader in=new BufferedReader(new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8))){
                    String l;while(!canceled&&(l=in.readLine())!=null){if(l.length()>1000000)throw new IOException("Строка слишком большая");if(!l.trim().isEmpty()&&!"wait".equals(kind))receive(this,new JSONObject(l));}
                }
            }catch(Exception e){if(!canceled)error=e.getMessage()==null?"Связь потеряна":e.getMessage();}
            finally{if(connection!=null)connection.disconnect();ended(this,error);}
        });}
    }
    private synchronized void stopStreams(){if(events!=null)events.cancel();if(game!=null)game.cancel();if(waiting!=null)waiting.cancel();events=game=waiting=null;}
    private static boolean finished(String s){return Arrays.asList("aborted","mate","resign","stalemate","timeout","draw","outoftime","cheat","noStart","unknownFinish","variantEnd").contains(s);}
    private synchronized void startGame(String raw)throws Exception{
        String next=id(raw);
        if(next.equals(gameId)&&game!=null)return;
        if(game!=null)game.cancel();if(waiting!=null){waiting.cancel();waiting=null;}
        revision++;gameId=next;terminal=false;needsSync=false;full=null;state=null;notice="Подключаюсь к партии";persistLock();
        game=new Stream("game","/api/board/game/stream/"+next,"GET",null);game.start();
    }
    private synchronized void receive(Stream s,JSONObject msg)throws Exception{
        if(s.canceled||closed)return;
        String type=msg.optString("type");
        if(s==events){
            if("gameStart".equals(type)){JSONObject g=msg.optJSONObject("game");if(g!=null&&!"correspondence".equals(g.optString("speed")))startGame(g.optString("gameId",g.optString("id")));}
            else if("challenge".equals(type)||"challengeCanceled".equals(type)||"challengeDeclined".equals(type)){
                JSONObject challenge=msg.optJSONObject("challenge");
                if(challenge!=null){
                    String cid=challenge.optString("id");JSONArray updated=new JSONArray();
                    for(int i=0;i<incoming.length();i++){JSONObject row=incoming.optJSONObject(i);if(row!=null&&!cid.equals(row.optString("id")))updated.put(row);}
                    JSONObject dest=challenge.optJSONObject("destUser");
                    if("challenge".equals(type)&&dest!=null&&username.equalsIgnoreCase(dest.optString("id")))updated.put(challenge);
                    incoming=updated;
                }
                notice="Есть обновление вызовов";
            }
            else if("gameFinish".equals(type)&&!terminal){JSONObject g=msg.optJSONObject("game");if(g!=null&&gameId.equals(g.optString("gameId",g.optString("id")))){revision++;needsSync=true;persistLock();}}
        }else if(s==game){
            if("gameFull".equals(type)){full=msg;state=msg.getJSONObject("state");}
            else if("gameState".equals(type)&&full!=null)state=msg;
            if(state!=null){boolean wasTerminal=terminal;terminal=finished(state.optString("status"));notice=terminal?"Партия завершена":"";if(terminal&&!wasTerminal){revision++;needsSync=true;}else if(!terminal)needsSync=false;persistLock();}
        }
    }
    private synchronized void ended(Stream s,String error){
        if(closed||s.canceled)return;
        if(s==events){events=null;notice=error.isEmpty()?"Поток событий закрыт":error;if(waiting!=null){waiting.cancel();waiting=null;needsSync=true;revision++;persistLock();}}
        else if(s==waiting){revision++;waiting=null;needsSync=true;notice=error.isEmpty()?"Поиск завершён. Проверяю партии…":error;persistLock();}
        else if(s==game){game=null;if(!terminal){revision++;needsSync=true;notice=error.isEmpty()?"Связь потеряна. Обнови соединение.":error;persistLock();}}
    }
    private JSONObject refresh()throws Exception{
        requireLogin();final long before; synchronized(this){before=revision;}
        JSONObject a=json("/api/account","GET",null);
        JSONArray playing=json("/api/account/playing?nb=50","GET",null).getJSONArray("nowPlaying");
        JSONArray challenges=json("/api/challenge","GET",null).optJSONArray("in");
        synchronized(this){
            account=a;ongoing=playing;incoming=challenges==null?new JSONArray():challenges;
            if(events==null){events=new Stream("events","/api/stream/event","GET",null);events.start();}
            if(before!=revision)return snapshot();
            String next="";
            for(int i=0;i<playing.length();i++){JSONObject p=playing.getJSONObject(i);if(!"correspondence".equals(p.optString("speed"))){next=id(p.getString("gameId"));if(next.equals(gameId))break;}}
            if(!next.isEmpty()){if(game==null||!next.equals(gameId)||needsSync){if(game!=null){game.cancel();game=null;}startGame(next);}}
            else if(waiting==null){if(!gameId.isEmpty()&&!terminal){if(game!=null)game.cancel();game=null;gameId="";full=state=null;}needsSync=false;persistLock();}
            notice="";return snapshot();
        }
    }
    private synchronized JSONObject snapshot()throws Exception{
        JSONObject out=new JSONObject().put("connected",!token.isEmpty()).put("username",username).put("account",account).put("locked",locked()).put("needsSync",needsSync).put("eventReady",events!=null&&events.ready).put("waiting",waiting!=null).put("gameId",gameId).put("terminal",terminal).put("notice",notice).put("incoming",incoming).put("ongoing",ongoing);
        if(full!=null)out.put("full",full);if(state!=null)out.put("state",state);
        return out;
    }
    private synchronized void canMatch()throws Exception{
        requireLogin();if(locked()||events==null||!events.ready)throw new IOException("Сначала синхронизируй подключение Lichess");
    }
    private JSONObject match(JSONObject req,boolean direct)throws Exception{
        int min=req.getInt("minutes"),inc=req.getInt("increment");
        if(!Arrays.asList(3,5,10,15,30).contains(min)||!Arrays.asList(0,2,3,5,10,20).contains(inc)||(!direct&&min*60+40*inc<480)||min*60+40*inc<180)throw new IOException("Недопустимый контроль времени");
        String body=direct?form("clock.limit",String.valueOf(min*60),"clock.increment",String.valueOf(inc),"rated",String.valueOf(req.optBoolean("rated")),"variant","standard","keepAliveStream","true"):form("time",String.valueOf(min),"increment",String.valueOf(inc),"rated",String.valueOf(req.optBoolean("rated")),"variant","standard");
        String p=direct?"/api/challenge/"+nick(req.getString("user")):"/api/board/seek";
        synchronized(this){canMatch();waiting=new Stream("wait",p,"POST",body);notice=direct?"Вызов отправляется":"Поиск соперника";persistLock();waiting.start();return snapshot();}
    }
    private JSONObject cancel()throws Exception{
        synchronized(this){if(waiting!=null){waiting.cancel();waiting=null;needsSync=true;persistLock();}}
        return refresh();
    }
    private JSONObject accept(String raw)throws Exception{
        String c=id(raw);synchronized(this){canMatch();JSONObject found=null;for(int i=0;i<incoming.length();i++){JSONObject x=incoming.getJSONObject(i);if(c.equals(x.optString("id")))found=x;}
            JSONObject variant=found==null?null:found.optJSONObject("variant"),clock=found==null?null:found.optJSONObject("timeControl");
            if(variant==null||!"standard".equals(variant.optString("key"))||clock==null||!"clock".equals(clock.optString("type"))||clock.optInt("limit")+40*clock.optInt("increment")<180)throw new IOException("Этот вызов не поддерживается Board API");
            needsSync=true;persistLock();
        }
        json("/api/challenge/"+c+"/accept","POST","");
        synchronized(this){if(!c.equals(gameId)||game==null)startGame(c);return snapshot();}
    }
    private JSONObject action(JSONObject r)throws Exception{
        String target=id(r.getString("gameId")),action=r.getString("action"),suffix;
        synchronized(this){if(!target.equals(gameId)||terminal||needsSync||full==null||state==null||game==null||!game.ready)throw new IOException("Нет активной подключённой партии");}
        if("move".equals(action)){String m=r.getString("move");if(!m.matches("[a-h][1-8][a-h][1-8][qrbn]?"))throw new IOException("Неверный ход");suffix="move/"+m;}
        else if(Arrays.asList("resign","abort","draw/yes","draw/no").contains(action))suffix=action;
        else throw new IOException("Неизвестное действие");
        return json("/api/board/game/"+target+"/"+suffix,"POST","");
    }
    JSONObject handle(JSONObject r)throws Exception{
        switch(r.getString("op")){
            case "snapshot":return snapshot();
            case "refresh":return token.isEmpty()?snapshot():refresh();
            case "login":return login();
            case "logout":
                if(locked())throw new IOException("Сначала заверши партию");
                requireLogin();request("/api/token","DELETE",token,null,"application/json",10000);
                synchronized(this){stopStreams();save("","");account=new JSONObject();incoming=ongoing=new JSONArray();gameId="";full=state=null;terminal=false;needsSync=false;persistLock();return snapshot();}
            case "seek":return match(r,false);
            case "challenge":return match(r,true);
            case "cancel":return cancel();
            case "accept":return accept(r.getString("challengeId"));
            case "decline":return json("/api/challenge/"+id(r.getString("challengeId"))+"/decline","POST","");
            case "gameAction":return action(r);
            case "friends":if(locked())throw new IOException("Сначала заверши игру");return new JSONObject().put("users",ndjson("/api/rel/following",200));
            case "player":return json("/api/user/"+nick(r.getString("user")),"GET",null);
            case "follow":case "unfollow":if(locked())throw new IOException("Сначала заверши игру");return json("/api/rel/"+r.getString("op")+"/"+nick(r.getString("user")),"POST","");
            case "history":if(locked())throw new IOException("Сначала заверши игру");return new JSONObject().put("games",ndjson("/api/games/user/"+nick(username)+"?max=20&ongoing=false&moves=false&clocks=false&evals=false",20));
            case "pgn":if(locked())throw new IOException("Сначала заверши игру");return new JSONObject().put("pgn",request("/game/export/"+id(r.getString("gameId")),"GET",token,null,"application/x-chess-pgn",300000));
            case "share":requireLogin();activity.shareLichess(HOST+"/@/"+nick(username));return new JSONObject().put("ok",true);
            case "openGame":requireLogin();synchronized(this){if(gameId.isEmpty())throw new IOException("Нет партии");activity.openBrowser(HOST+"/"+id(gameId));}return new JSONObject().put("ok",true);
            case "open":requireLogin();activity.openBrowser(HOST+"/@/"+nick(r.optString("user",username)));return new JSONObject().put("ok",true);
            default:throw new IOException("Неизвестное действие Lichess");
        }
    }
    void close(){closed=true;ServerSocket socket=loginSocket;if(socket!=null)try{socket.close();}catch(Exception ignored){}synchronized(this){persistLock();stopStreams();}streams.shutdownNow();}
}
