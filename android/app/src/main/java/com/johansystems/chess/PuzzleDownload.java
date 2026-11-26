package com.johansystems.chess;

import android.net.Uri;
import java.net.*;
import java.io.*;
import java.util.*;
import java.util.regex.*;
import java.nio.charset.StandardCharsets;

final class PuzzleDownload {
    private static final String ROOT="https://github.com/sharifzoda4156-ops/johan-chess/releases/download/";
    private static final String CATALOG="https://raw.githubusercontent.com/sharifzoda4156-ops/johan-chess/puzzle-catalog/catalog.json";
    private static final int MAX_ASSET=128*1024*1024;
    static String get(Uri u)throws Exception {
        String url=CATALOG,range=null;int limit=8*1024*1024,offset=0;
        if("/api/puzzle-data/pack".equals(u.getPath())){
            String tag=u.getQueryParameter("tag"),asset=u.getQueryParameter("asset"),o=u.getQueryParameter("offset"),l=u.getQueryParameter("length");
            if(tag==null||!tag.matches("lichess-data-\\d{1,20}-\\d{1,5}")||asset==null||!asset.matches("band-\\d{1,2}-\\d{1,5}\\.bin")||o==null||!o.matches("\\d{1,9}")||l==null||!l.matches("\\d{1,7}"))throw new IOException("Invalid pack");
            offset=Integer.parseInt(o);limit=Integer.parseInt(l);
            if(limit<1||limit>1024*1024||(long)offset+limit>MAX_ASSET)throw new IOException("Invalid range");
            range="bytes="+offset+"-"+(offset+limit-1);url=ROOT+tag+"/"+asset;
        }else if(!"/api/puzzle-data/catalog".equals(u.getPath()))throw new IOException("Invalid path");
        for(int i=0;i<5;i++){
            URL target=new URL(url);
            if(!"https".equals(target.getProtocol())||target.getPort()!=-1||target.getUserInfo()!=null||!Arrays.asList("github.com","raw.githubusercontent.com","release-assets.githubusercontent.com","objects.githubusercontent.com").contains(target.getHost()))throw new IOException("Invalid redirect");
            HttpURLConnection c=(HttpURLConnection)target.openConnection();
            c.setInstanceFollowRedirects(false);c.setConnectTimeout(12000);c.setReadTimeout(15000);c.setRequestProperty("Accept-Encoding","identity");
            if(range!=null)c.setRequestProperty("Range",range);
            try {
                int code=c.getResponseCode();
                if(Arrays.asList(301,302,303,307,308).contains(code)){String next=c.getHeaderField("Location");if(next==null)throw new IOException("Missing redirect");url=new URL(target,next).toExternalForm();continue;}
                if(range==null?code!=200:code!=206)throw new IOException("Puzzle data unavailable");
                if(range!=null){
                    String value=c.getHeaderField("Content-Range");
                    Matcher m=Pattern.compile("^bytes (\\d+)-(\\d+)/(\\d+)$").matcher(value==null?"":value);
                    if(!m.matches()||Long.parseLong(m.group(1))!=offset||Long.parseLong(m.group(2))!=(long)offset+limit-1||Long.parseLong(m.group(3))<(long)offset+limit||Long.parseLong(m.group(3))>MAX_ASSET)throw new IOException("Invalid partial response");
                }
                try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                    byte[] b=new byte[8192];int n;
                    while((n=in.read(b))!=-1){if(out.size()+n>limit)throw new IOException("Puzzle data too large");out.write(b,0,n);}
                    if(range!=null&&out.size()!=limit)throw new IOException("Incomplete pack");
                    return new String(out.toByteArray(),StandardCharsets.UTF_8);
                }
            }finally{c.disconnect();}
        }
        throw new IOException("Too many redirects");
    }
}
