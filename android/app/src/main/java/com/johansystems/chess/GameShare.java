package com.johansystems.chess;
import android.content.*;
import android.net.Uri;
import androidx.core.content.FileProvider;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

// Share target and sender. No arbitrary URL fetch, no broad storage permission.
final class GameShare {
    static final int LIMIT=1024*1024;
    private final MainActivity activity;
    private final ArrayDeque<JSONObject> inbox=new ArrayDeque<>();
    GameShare(MainActivity a){activity=a;}
    private static String read(InputStream in)throws IOException{
        try(InputStream input=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){
            if(input==null)throw new IOException("Файл недоступен");
            byte[] buf=new byte[8192];int n;while((n=input.read(buf))!=-1){if(out.size()+n>LIMIT)throw new IOException("PGN больше 1 МБ");out.write(buf,0,n);}
            return out.toString("UTF-8");
        }
    }
    synchronized void add(String text,String error){
        try{
            if(inbox.size()>=3)inbox.removeFirst();
            inbox.add(new JSONObject().put("id",UUID.randomUUID().toString()).put("text",text).put("error",error));
        }catch(JSONException ignored){}
    }
    void receive(Intent intent){
        if(intent==null)return;String action=intent.getAction();
        if(!Intent.ACTION_SEND.equals(action)&&!Intent.ACTION_VIEW.equals(action))return;
        try{
            Uri uri=Intent.ACTION_VIEW.equals(action)?intent.getData():intent.getParcelableExtra(Intent.EXTRA_STREAM);
            String text;
            if(uri!=null){
                if(!"content".equals(uri.getScheme()))throw new IOException("Поддерживаются только файлы из системного меню Android");
                text=read(activity.getContentResolver().openInputStream(uri));
            }else{
                CharSequence raw=intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
                if(raw==null)throw new IOException("Поделись PGN или ссылкой на партию");
                text=raw.toString();
                if(text.length()>LIMIT||text.getBytes(StandardCharsets.UTF_8).length>LIMIT)throw new IOException("PGN больше 1 МБ");
            }
            if(text.trim().isEmpty())throw new IOException("Пустая партия");
            add(text,"");
        }catch(Exception e){add("",e.getMessage()==null?"Не удалось прочитать партию":e.getMessage());}
    }
    synchronized JSONObject peek()throws JSONException{return new JSONObject().put("item",inbox.isEmpty()?JSONObject.NULL:inbox.peek());}
    synchronized JSONObject ack(String id)throws JSONException{
        if(!inbox.isEmpty()&&id.equals(inbox.peek().optString("id")))inbox.removeFirst();
        return new JSONObject().put("ok",true);
    }
    static String lichess(String id)throws Exception{
        if(!id.matches("[A-Za-z0-9]{8}"))throw new IOException("Неверный ID Lichess");
        HttpURLConnection c=(HttpURLConnection)new URL("https://lichess.org/game/export/"+id+"?clocks=false&evals=false").openConnection();
        c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(15000);
        c.setRequestProperty("Accept","application/x-chess-pgn");c.setRequestProperty("User-Agent","JohanChess/0.2 Android");
        try{if(c.getResponseCode()!=200)throw new IOException("Lichess HTTP "+c.getResponseCode());return read(c.getInputStream());}finally{c.disconnect();}
    }
    void share(String pgn,boolean file)throws Exception{
        if(pgn.isEmpty()||pgn.length()>LIMIT||pgn.getBytes(StandardCharsets.UTF_8).length>LIMIT)throw new IOException("Неверный размер PGN");
        if(!file&&pgn.length()>64000)throw new IOException("Для большой партии выбери передачу файлом PGN");
        Intent i=new Intent(Intent.ACTION_SEND);
        if(file){
            File dir=new File(activity.getCacheDir(),"shared-pgn");if(!dir.isDirectory()&&!dir.mkdirs())throw new IOException("Не удалось подготовить файл");
            File[] old=dir.listFiles();if(old!=null){Arrays.sort(old,Comparator.comparingLong(File::lastModified));for(int j=0;j<old.length;j++)if(j<old.length-19||System.currentTimeMillis()-old[j].lastModified()>86400000L)old[j].delete();}
            File target=File.createTempFile("johan-chess-",".pgn",dir);
            try(FileOutputStream out=new FileOutputStream(target)){out.write(pgn.getBytes(StandardCharsets.UTF_8));}
            Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".share",target);
            i.setType("application/x-chess-pgn");i.putExtra(Intent.EXTRA_STREAM,uri);i.setClipData(ClipData.newRawUri("PGN",uri));i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        }else{i.setType("text/plain");i.putExtra(Intent.EXTRA_TEXT,pgn);}
        activity.showGameShare(i);
    }
}
