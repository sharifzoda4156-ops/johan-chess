package com.johansystems.chess;

import org.json.*;
import java.net.*;
import java.io.*;
import java.util.*;
import java.nio.charset.StandardCharsets;

final class ChessImport {
    private static JSONObject get(String path) throws Exception {
        HttpURLConnection c=(HttpURLConnection)new URL("https://api.chess.com/pub/player/"+path).openConnection();
        c.setInstanceFollowRedirects(false);
        c.setConnectTimeout(15000);c.setReadTimeout(15000);
        c.setRequestProperty("User-Agent","JohanChess/0.2 personal game analysis");
        try {
            if(c.getResponseCode()!=200)throw new IOException("Chess.com HTTP "+c.getResponseCode());
            try(InputStream in=c.getInputStream(); ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1){out.write(buf,0,n);if(out.size()>12000000)throw new IOException("Archive too large");}
                return new JSONObject(out.toString("UTF-8"));
            }
        } finally { c.disconnect(); }
    }
    static JSONObject stats(String name)throws Exception {
        String user=name==null?"":name.toLowerCase(Locale.ROOT);
        if(!user.matches("[a-z0-9_-]{1,40}"))throw new IOException("Некорректный ник");
        return get(user+"/stats");
    }
    // Chess.com only documents player archives, not a public single-game lookup.
    static String sharedGame(String name,String kind,String id)throws Exception{
        String user=name==null?"":name.toLowerCase(Locale.ROOT);
        if(!user.matches("[a-z0-9_-]{1,40}")||!Arrays.asList("live","daily").contains(kind)||!id.matches("[0-9]{1,20}"))throw new IOException("Нужен корректный ник и ссылка Chess.com");
        JSONArray archives=get(user+"/games/archives").getJSONArray("archives");
        for(int i=archives.length()-1;i>=Math.max(0,archives.length()-3);i--){
            java.util.regex.Matcher m=java.util.regex.Pattern.compile("/(\\d{4})/(\\d{2})$").matcher(archives.getString(i));
            if(!m.find())continue;
            JSONArray rows=get(user+"/games/"+m.group(1)+"/"+m.group(2)).getJSONArray("games");
            for(int j=0;j<rows.length();j++){
                JSONObject g=rows.getJSONObject(j);
                String url=g.optString("url");
                if(url.matches("https://(?:www\\.)?chess\\.com/game/"+kind+"/"+id+"/?")&&"chess".equals(g.optString("rules"))&&!g.optString("pgn").isEmpty())return g.getString("pgn");
            }
        }
        throw new IOException("Партия не найдена в последних трёх архивах этого игрока. Поделись PGN или укажи ник участника.");
    }
    static JSONObject games(String name)throws Exception {
        String user=name==null?"":name.toLowerCase(Locale.ROOT);
        if(!user.matches("[a-z0-9_-]{1,40}"))throw new IOException("Некорректный ник");
        JSONArray archives=get(user+"/games/archives").getJSONArray("archives");
        ArrayList<JSONObject> games=new ArrayList<>();
        for(int i=archives.length()-1;i>=Math.max(0,archives.length()-3);i--){
            String u=archives.getString(i);
            java.util.regex.Matcher m=java.util.regex.Pattern.compile("/(\\d{4})/(\\d{2})$").matcher(u);
            if(!m.find())continue;
            JSONArray list=get(user+"/games/"+m.group(1)+"/"+m.group(2)).getJSONArray("games");
            for(int j=0;j<list.length();j++){
                JSONObject g=list.getJSONObject(j);
                if(!"chess".equals(g.optString("rules"))||g.optString("pgn").isEmpty())continue;
                JSONObject w=g.optJSONObject("white"),b=g.optJSONObject("black");
                String wRes=w==null?"":w.optString("result"),bRes=b==null?"":b.optString("result");
                String res="win".equals(wRes)?"1-0":"win".equals(bRes)?"0-1":(!wRes.isEmpty()||!bRes.isEmpty())?"1/2-1/2":"";
                JSONObject row=new JSONObject()
                    .put("pgn",g.getString("pgn"))
                    .put("white",w==null?"":w.optString("username"))
                    .put("black",b==null?"":b.optString("username"))
                    .put("ended",g.optLong("end_time"))
                    .put("timeClass",g.optString("time_class"))
                    .put("result",res)
                    .put("url",g.optString("url"));
                if(w!=null&&w.has("rating"))row.put("whiteRating",w.optInt("rating"));
                if(b!=null&&b.has("rating"))row.put("blackRating",b.optInt("rating"));
                games.add(row);
            }
            if(games.size()>=30)break;
        }
        games.sort((a,b)->Long.compare(b.optLong("ended"),a.optLong("ended")));
        JSONArray result=new JSONArray();for(int i=0;i<Math.min(30,games.size());i++)result.put(games.get(i));
        return new JSONObject().put("games",result);
    }
}
