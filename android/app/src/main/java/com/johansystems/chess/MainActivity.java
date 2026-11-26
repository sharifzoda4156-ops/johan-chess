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

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private WebView web;
    private Coach coach;
    private GameShare gameShare;
    private final ExecutorService shareExecutor=Executors.newSingleThreadExecutor();
    private boolean resumed=false,confirmingExit=false;
    private volatile boolean protectedOnline=false;
    private Lichess lichess;
    private final ExecutorService lichessExecutor=Executors.newSingleThreadExecutor();
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        protectedOnline=getSharedPreferences("lichess",0).getBoolean("onlineLock",false);
        if(protectedOnline)getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        gameShare=new GameShare(this);
        receiveShare(getIntent());
        web = new WebView(this);
        setContentView(web);
        getWindow().setStatusBarColor(0xff131d29);
        getWindow().setNavigationBarColor(0xff131d29);
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
        web.setDownloadListener((url,agent,disposition,mime,length)->{});
        try { coach=new Coach(this); } catch(Exception ignored) {}
        try { lichess=new Lichess(this);onlineSecure(lichess.locked()); } catch(Exception ignored) {}
        if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
            WebViewCompat.addWebMessageListener(web,"JohanNative",Collections.singleton(ORIGIN),(view,msg,origin,main,reply)->{
                if(!main||!ORIGIN.equals(origin.toString()))return;
                String raw=msg.getData();
                if(raw==null||raw.length()>350000)return;
                executor.execute(()->{
                    JSONObject out=new JSONObject();
                    try {
                        JSONObject req=new JSONObject(raw);
                        out.put("id",req.getString("id"));
                        if(coach==null)throw new IOException("Защищённое хранилище недоступно");
                        if((protectedOnline||lichess!=null&&lichess.locked())&&Arrays.asList("ask","continueCoach").contains(req.optString("op")))throw new IOException("ИИ недоступен во время онлайн-партии");
                        JSONObject data=coach.handle(req);
                        if((protectedOnline||lichess!=null&&lichess.locked())&&Arrays.asList("ask","continueCoach").contains(req.optString("op")))throw new IOException("ИИ недоступен во время онлайн-партии");
                        out.put("data",data);
                    } catch(Exception e) {
                        try { out.put("error", e.getMessage()==null?"Ошибка подключения":e.getMessage()); } catch(Exception ignored){}
                    }
                    runOnUiThread(()->{if(!isDestroyed())try{reply.postMessage(out.toString());}catch(Exception ignored){}});
                });
            });
            WebViewCompat.addWebMessageListener(web,"JohanShare",Collections.singleton(ORIGIN),(view,msg,origin,main,reply)->{
                if(!main||!ORIGIN.equals(origin.toString()))return;
                String raw=msg.getData();if(raw==null||raw.length()>GameShare.LIMIT*2)return;
                shareExecutor.execute(()->{
                    JSONObject out=new JSONObject();
                    try{
                        JSONObject req=new JSONObject(raw);out.put("id",req.getString("id"));
                        if(protectedOnline||lichess!=null&&lichess.locked())throw new IOException("Передача партий недоступна во время онлайн-игры");
                        JSONObject data;
                        switch(req.getString("op")){
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
                String raw=msg.getData();if(raw==null||raw.length()>30000)return;
                try{JSONObject req=new JSONObject(raw);if("snapshot".equals(req.optString("op"))&&lichess!=null){reply.postMessage(new JSONObject().put("id",req.getString("id")).put("data",lichess.snapshot()).toString());return;}}catch(Exception ignored){}
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
    void openBrowser(String url) {
        runOnUiThread(()->{
            try { if(protectedOnline)return;startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url))); }
            catch(Exception e) { if(coach!=null)coach.cancelLogin(); }
        });
    }
    void shareLichess(String url){runOnUiThread(()->{if(protectedOnline)return;Intent intent=new Intent(Intent.ACTION_SEND);intent.setType("text/plain");intent.putExtra(Intent.EXTRA_TEXT,url);startActivity(Intent.createChooser(intent,"Поделиться профилем Lichess"));});}
    void onlineSecure(boolean locked){
        boolean changed=protectedOnline!=locked;protectedOnline=locked;if(!changed)return;
        runOnUiThread(()->{if(isDestroyed())return;
            if(protectedOnline){getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);if(web!=null)web.evaluateJavascript("document.dispatchEvent(new Event('jc-native-online-lock'))",null);}
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        });
    }
    void runLichessMaintenance(Runnable task){if(!lichessExecutor.isShutdown())lichessExecutor.execute(task);}
    private void syncForeground(){if(lichess!=null)lichess.foreground(resumed&&(hasWindowFocus()||confirmingExit));}
    @Override protected void onResume(){super.onResume();resumed=true;syncForeground();}
    @Override protected void onPause(){resumed=false;if(lichess!=null)lichess.background();super.onPause();}
    @Override public void onWindowFocusChanged(boolean focused){super.onWindowFocusChanged(focused);syncForeground();}
    @Override public void onBackPressed(){
        if(lichess!=null&&lichess.liveGame()){
            if(confirmingExit)return;
            confirmingExit=true;
            AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Покинуть онлайн-партию?")
                .setMessage("Выход считается сдачей. Остаться можно без штрафа.")
                .setNegativeButton("Продолжить игру",null)
                .setPositiveButton("Сдаться",(d,which)->lichess.resignConfirmed()).create();
            dialog.setOnDismissListener(d->{confirmingExit=false;syncForeground();});dialog.show();
            return;
        }
        if(protectedOnline||lichess!=null&&lichess.locked())return;
        super.onBackPressed();
    }
    @Override protected void onDestroy() {
        if(lichess!=null)lichess.close();lichessExecutor.shutdownNow();
        if(coach!=null)coach.cancelLogin();
        executor.shutdownNow();shareExecutor.shutdownNow();
        if(web!=null)web.destroy();
        super.onDestroy();
    }
}
