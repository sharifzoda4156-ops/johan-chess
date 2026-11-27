package com.johansystems.chess;

import android.app.Activity;
import android.app.AlertDialog;
import android.view.WindowManager;
import android.os.Bundle;
import android.net.Uri;
import android.webkit.*;
import android.content.Intent;
import androidx.webkit.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.*;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final int REQ_FILE_CHOOSER = 1001;
    private static final int REQ_SAVE_FILE = 1002;
    private static final Pattern MSG_ID = Pattern.compile("\"id\"\\s*:\\s*\"([^\"]{1,64})\"");
    private WebView web;
    private GameShare gameShare;
    private final ExecutorService shareExecutor=Executors.newSingleThreadExecutor();
    private boolean resumed=false,confirmingExit=false;
    private volatile boolean protectedOnline=false;
    private Lichess lichess;
    private final ExecutorService lichessExecutor=Executors.newSingleThreadExecutor();
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private ValueCallback<Uri[]> fileChooserCallback;
    private byte[] pendingSaveBytes;
    private String pendingSaveId;
    private JavaScriptReplyProxy pendingSaveReply;
    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        protectedOnline=getSharedPreferences("lichess",0).getBoolean("onlineLock",false);
        if(protectedOnline)getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        gameShare=new GameShare(this);
        receiveShare(getIntent());
        web = new WebView(this);
        setContentView(web);
        getWindow().setStatusBarColor(0xff0b0e14);
        getWindow().setNavigationBarColor(0xff0b0e14);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u=r.getUrl();
                if (!"https".equals(u.getScheme()) || !"appassets.androidplatform.net".equals(u.getHost()) || u.getPort()!=-1)
                    return response(403, "{\"error\":\"Blocked\"}");
                if(protectedOnline&&(u.getPath().startsWith("/assets/engine/")||u.getPath().startsWith("/api/")))return response(403,"{\"error\":\"Online fair play\"}");
                if (("/api/puzzle-data/catalog".equals(u.getPath()) || "/api/puzzle-data/pack".equals(u.getPath())) && "GET".equals(r.getMethod())) {
                    try { return response(200, PuzzleDownload.get(u)); }
                    catch(Exception e) { return response(502, "{\"error\":\"Puzzle data unavailable\"}"); }
                }
                if ("/api/player-stats".equals(u.getPath()) && "GET".equals(r.getMethod())) {
                    try { return response(200, ChessImport.stats(u.getQueryParameter("user")).toString()); }
                    catch(Exception e) { return response(502, "{\"error\":\"Chess.com stats unavailable\"}"); }
                }
                if ("/api/games".equals(u.getPath()) && "GET".equals(r.getMethod())) {
                    try { return response(200, ChessImport.games(u.getQueryParameter("user")).toString()); }
                    catch(Exception e) { return response(502, "{\"error\":\"Не удалось импортировать партии. Вставь PGN вручную.\"}"); }
                }
                WebResourceResponse a=loader.shouldInterceptRequest(u);
                return a!=null?a:response(404,"{}");
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u=r.getUrl();
                return !r.isForMainFrame() || !(ORIGIN+"/assets/index.html").equals(u.toString());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if(protectedOnline||(lichess!=null&&lichess.locked())){
                    callback.onReceiveValue(null);
                    return false;
                }
                if(fileChooserCallback!=null){
                    fileChooserCallback.onReceiveValue(null);
                    fileChooserCallback=null;
                }
                fileChooserCallback=callback;
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/x-chess-pgn","application/vnd.chess-pgn","text/plain","application/octet-stream"});
                try{
                    startActivityForResult(intent,REQ_FILE_CHOOSER);
                    return true;
                }catch(Exception e){
                    fileChooserCallback=null;
                    callback.onReceiveValue(null);
                    return false;
                }
            }
        });
        web.setDownloadListener((url,agent,disposition,mime,length)->{});
        try { lichess=new Lichess(this);onlineSecure(lichess.locked()); } catch(Exception ignored) {}
        if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
            // JohanNative is kept only as the "running inside the Android app" marker used by the web code.
            // The AI coach now runs through GitHub Actions from the web layer (see public/coach-client.js).
            WebViewCompat.addWebMessageListener(web,"JohanNative",Collections.singleton(ORIGIN),(view,msg,origin,main,reply)->{});
            WebViewCompat.addWebMessageListener(web,"JohanShare",Collections.singleton(ORIGIN),(view,msg,origin,main,reply)->{
                if(!main||!ORIGIN.equals(origin.toString()))return;
                String raw=msg.getData();
                if(raw==null||raw.length()>GameShare.LIMIT*2){rejectOversized(reply,raw,"Файл слишком большой для сохранения");return;}
                shareExecutor.execute(()->{
                    JSONObject out=new JSONObject();
                    try{
                        JSONObject req=new JSONObject(raw);
                        String reqId=req.getString("id");
                        out.put("id",reqId);
                        if(protectedOnline||lichess!=null&&lichess.locked())throw new IOException("Передача партий недоступна во время онлайн-игры");
                        String op=req.getString("op");
                        if("saveFile".equals(op)){
                            String content=req.getString("content");
                            byte[] bytes=content.getBytes(StandardCharsets.UTF_8);
                            if(bytes.length==0||bytes.length>GameShare.LIMIT*2)throw new IOException("Неверный размер файла");
                            String rawName=req.optString("filename","johan-chess.pgn").replaceAll("[^A-Za-z0-9._-]","_");
                            String safeName=rawName.isEmpty()?"johan-chess.pgn":rawName;
                            String mime=req.optString("mime","application/x-chess-pgn");
                            if(!Arrays.asList("application/x-chess-pgn","application/json","text/plain").contains(mime))mime="text/plain";
                            launchSaveDocument(reqId,reply,safeName,mime,bytes);
                            return;
                        }
                        JSONObject data;
                        switch(op){
                            case "peek":data=gameShare.peek();break;
                            case "ack":data=gameShare.ack(req.getString("itemId"));break;
                            case "lichess":data=new JSONObject().put("pgn",GameShare.lichess(req.getString("gameId")));break;
                            case "chesscom":data=new JSONObject().put("pgn",ChessImport.sharedGame(req.getString("user"),req.getString("kind"),req.getString("gameId")));break;
                            case "share":gameShare.share(req.getString("pgn"),req.optBoolean("file"));data=new JSONObject().put("ok",true);break;
                            default:throw new IOException("Неизвестное действие");
                        }
                        if(protectedOnline||lichess!=null&&lichess.locked())throw new IOException("Передача партий недоступна во время онлайн-игры");
                        out.put("data",data);
                    }catch(Exception e){try{out.put("error",e.getMessage()==null?"Ошибка передачи":e.getMessage());}catch(Exception ignored){}}
                    runOnUiThread(()->{if(!isDestroyed())try{reply.postMessage(out.toString());}catch(Exception ignored){}});
                });
            });
            WebViewCompat.addWebMessageListener(web,"JohanLichess",Collections.singleton(ORIGIN),(view,msg,origin,isMain,reply)->{
                if(!isMain||!ORIGIN.equals(origin.toString()))return;
                String raw=msg.getData();
                if(raw==null||raw.length()>30000){rejectOversized(reply,raw,"Сообщение Lichess слишком большое");return;}
                try{
                    JSONObject req=new JSONObject(raw);
                    String op=req.optString("op");
                    if("snapshot".equals(op)&&lichess!=null){reply.postMessage(new JSONObject().put("id",req.getString("id")).put("data",lichess.snapshot()).toString());return;}
                    if("cancelLogin".equals(op)&&lichess!=null){lichess.cancelLogin();reply.postMessage(new JSONObject().put("id",req.getString("id")).put("data",lichess.snapshot()).toString());return;}
                }catch(Exception ignored){}
                lichessExecutor.execute(()->{
                    JSONObject out=new JSONObject();
                    try{JSONObject req=new JSONObject(raw);out.put("id",req.getString("id"));if(lichess==null)throw new IOException("Защищённое хранилище Lichess недоступно");out.put("data",lichess.handle(req));}
                    catch(Exception e){try{out.put("error",e.getMessage()==null?"Ошибка Lichess":e.getMessage());}catch(Exception ignored){}}
                    runOnUiThread(()->{if(!isDestroyed())try{reply.postMessage(out.toString());}catch(Exception ignored){}});
                });
            });
        }
        web.loadUrl(ORIGIN+"/assets/index.html");
    }
    private static void rejectOversized(JavaScriptReplyProxy reply,String raw,String message){
        if(raw==null)return;
        Matcher m=MSG_ID.matcher(raw.substring(0,Math.min(raw.length(),512)));
        if(!m.find())return;
        try{reply.postMessage(new JSONObject().put("id",m.group(1)).put("error",message).toString());}catch(Exception ignored){}
    }
    private void launchSaveDocument(String reqId,JavaScriptReplyProxy reply,String filename,String mime,byte[] bytes){
        runOnUiThread(()->{
            if(isDestroyed()||protectedOnline||(lichess!=null&&lichess.locked())){
                postReply(reply,reqId,null,"Сохранение недоступно");
                return;
            }
            if(pendingSaveReply!=null){
                postReply(pendingSaveReply,pendingSaveId,null,"Запущено новое сохранение");
                pendingSaveReply=null;pendingSaveId=null;pendingSaveBytes=null;
            }
            pendingSaveId=reqId;pendingSaveReply=reply;pendingSaveBytes=bytes;
            Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(mime);
            intent.putExtra(Intent.EXTRA_TITLE,filename);
            try{
                startActivityForResult(intent,REQ_SAVE_FILE);
            }catch(Exception e){
                pendingSaveReply=null;pendingSaveId=null;pendingSaveBytes=null;
                postReply(reply,reqId,null,"Не удалось открыть диалог сохранения");
            }
        });
    }
    private void postReply(JavaScriptReplyProxy reply,String id,JSONObject data,String error){
        if(reply==null||id==null||isDestroyed())return;
        runOnUiThread(()->{
            if(isDestroyed())return;
            try{
                JSONObject out=new JSONObject().put("id",id);
                if(error!=null)out.put("error",error);else out.put("data",data==null?new JSONObject().put("ok",true):data);
                reply.postMessage(out.toString());
            }catch(Exception ignored){}
        });
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==REQ_FILE_CHOOSER){
            ValueCallback<Uri[]> cb=fileChooserCallback;
            fileChooserCallback=null;
            if(cb!=null){
                Uri uri=resultCode==RESULT_OK&&data!=null?data.getData():null;
                cb.onReceiveValue(uri!=null?new Uri[]{uri}:null);
            }
            return;
        }
        if(requestCode==REQ_SAVE_FILE){
            JavaScriptReplyProxy reply=pendingSaveReply;
            String id=pendingSaveId;
            byte[] bytes=pendingSaveBytes;
            pendingSaveReply=null;pendingSaveId=null;pendingSaveBytes=null;
            if(reply==null||id==null||bytes==null)return;
            Uri uri=resultCode==RESULT_OK&&data!=null?data.getData():null;
            if(uri==null){
                try{postReply(reply,id,new JSONObject().put("ok",true).put("canceled",true),null);}catch(Exception ignored){}
                return;
            }
            shareExecutor.execute(()->{
                try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){
                    if(out==null)throw new IOException("Не удалось записать файл");
                    out.write(bytes);out.flush();
                    postReply(reply,id,new JSONObject().put("ok",true).put("saved",true),null);
                }catch(Exception e){
                    postReply(reply,id,null,e.getMessage()==null?"Ошибка записи файла":e.getMessage());
                }
            });
        }
    }
    private static WebResourceResponse response(int code,String body) {
        return new WebResourceResponse("application/json","UTF-8",code,code==200?"OK":code==403?"Forbidden":code==404?"Not Found":"Bad Gateway",Collections.singletonMap("Cache-Control","no-store"),new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
    }
    private void receiveShare(Intent intent){
        if(intent==null||gameShare==null)return;
        String action=intent.getAction();
        if(!Intent.ACTION_SEND.equals(action)&&!Intent.ACTION_VIEW.equals(action))return;
        shareExecutor.execute(()->gameShare.receive(intent));
    }
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);receiveShare(intent);}
    void showGameShare(Intent intent){runOnUiThread(()->{if(!isDestroyed()&&!protectedOnline)startActivity(Intent.createChooser(intent,"Поделиться партией"));});}
    // Called on a worker. Report browser launch failure immediately instead of waiting five minutes.
    void openOAuthBrowser(String url)throws Exception{
        FutureTask<Void> task=new FutureTask<>(()->{
            if(isDestroyed()||protectedOnline||lichess!=null&&lichess.locked())throw new IOException("Вход недоступен во время онлайн-партии");
            try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}
            catch(android.content.ActivityNotFoundException e){throw new IOException("Не найден браузер. Установи или включи браузер.");}
            return null;
        });
        runOnUiThread(task);
        try{task.get(10,TimeUnit.SECONDS);}catch(ExecutionException e){Throwable cause=e.getCause();if(cause instanceof Exception)throw (Exception)cause;throw new IOException("Не удалось открыть браузер");}
        catch(TimeoutException e){task.cancel(false);throw new IOException("Не удалось открыть браузер");}
    }
    void openBrowser(String url) {
        runOnUiThread(()->{
            try { if(protectedOnline)return;startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url))); }
            catch(Exception ignored) {}
        });
    }
    void shareLichess(String url){runOnUiThread(()->{if(protectedOnline)return;Intent intent=new Intent(Intent.ACTION_SEND);intent.setType("text/plain");intent.putExtra(Intent.EXTRA_TEXT,url);startActivity(Intent.createChooser(intent,"Поделиться профилем Lichess"));});}
    void notifyLichessUpdate(){
        runOnUiThread(()->{if(!isDestroyed()&&web!=null)web.evaluateJavascript("document.dispatchEvent(new Event('jc-lichess-update'))",null);});
    }
    void onlineSecure(boolean locked){
        boolean changed=protectedOnline!=locked;protectedOnline=locked;if(!changed)return;
        runOnUiThread(()->{if(isDestroyed())return;
            if(protectedOnline){getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);if(web!=null)web.evaluateJavascript("document.dispatchEvent(new Event('jc-native-online-lock'))",null);}
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        });
    }
    void runLichessMaintenance(Runnable task){if(!lichessExecutor.isShutdown())lichessExecutor.execute(task);}
    @Override protected void onStart(){super.onStart();resumed=true;if(lichess!=null)lichess.foreground(true);}
    @Override protected void onResume(){super.onResume();resumed=true;if(lichess!=null)lichess.foreground(true);}
    @Override protected void onStop(){resumed=false;if(lichess!=null)lichess.background();super.onStop();}
    @Override public void onBackPressed(){
        if(lichess!=null&&lichess.liveGame()){
            if(confirmingExit)return;
            confirmingExit=true;
            AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Покинуть онлайн-партию?")
                .setMessage("Выход считается сдачей. Остаться можно без штрафа.")
                .setNegativeButton("Продолжить игру",null)
                .setPositiveButton("Сдаться",(d,which)->lichess.resignConfirmed()).create();
            dialog.setOnDismissListener(d->{confirmingExit=false;if(lichess!=null&&resumed)lichess.foreground(true);});dialog.show();
            return;
        }
        if(protectedOnline||lichess!=null&&lichess.locked())return;
        if(web==null){super.onBackPressed();return;}
        web.evaluateJavascript("typeof window.JohanHandleBack==='function' && window.JohanHandleBack()",value->{if(!isDestroyed()&&!protectedOnline&&(lichess==null||!lichess.locked())&&!"true".equals(value))super.onBackPressed();});
    }
    @Override protected void onDestroy() {
        if(fileChooserCallback!=null){fileChooserCallback.onReceiveValue(null);fileChooserCallback=null;}
        pendingSaveReply=null;pendingSaveId=null;pendingSaveBytes=null;
        if(lichess!=null)lichess.close();lichessExecutor.shutdownNow();
        executor.shutdownNow();shareExecutor.shutdownNow();
        if(web!=null)web.destroy();
        super.onDestroy();
    }
}
