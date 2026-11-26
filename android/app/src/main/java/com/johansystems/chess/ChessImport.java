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
                games.add(new JSONObject().put("pgn",g.getString("pgn")).put("white",g.getJSONObject("white").optString("username")).put("black",g.getJSONObject("black").optString("username")).put("ended",g.optLong("end_time")).put("timeClass",g.optString("time_class")));
            }
            if(games.size()>=30)break;
        }
        games.sort((a,b)->Long.compare(b.optLong("ended"),a.optLong("ended")));
        JSONArray result=new JSONArray();for(int i=0;i<Math.min(30,games.size());i++)result.put(games.get(i));
        return new JSONObject().put("games",result);
    }
}
