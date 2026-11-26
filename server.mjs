import http from 'node:http';
import {requestSpec,downloadPuzzleData} from './lib/puzzle-download.mjs';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./public/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.json':'application/json; charset=utf-8','.svg':'image/svg+xml; charset=utf-8','.tsv':'text/tab-separated-values; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.ico':'image/x-icon'};
const cache=new Map();
const respond=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function api(path){
 const old=cache.get(path);if(old&&Date.now()-old.time<60000)return old.data;
 const r=await fetch('https://api.chess.com/pub/player/'+path,{headers:{'User-Agent': 'JohanChess/0.1 (personal game analysis)'},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Chess.com HTTP '+r.status);const data=await r.json();
 if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(path,{time:Date.now(),data});return data;
}
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost');
  if(req.method!=='GET'){res.writeHead(405);return res.end();}
  if(u.pathname.startsWith('/api/puzzle-data/')){
   try{const spec=requestSpec(u.pathname,u.searchParams);if(!spec)return respond(res,404,{error:'Unknown puzzle endpoint'});const bytes=await downloadPuzzleData(spec);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(bytes);}catch{return respond(res,502,{error:'Puzzle data unavailable'});}
  }
  if(u.pathname==='/api/player-stats'){
   const user=(u.searchParams.get('user')||'').toLowerCase();if(!/^[a-z0-9_-]{1,40}$/.test(user))return respond(res,400,{error:'Некорректный ник'});
   try{return respond(res,200,await api(user+'/stats'));}catch{return respond(res,502,{error:'Рейтинги Chess.com недоступны'});}
  }
  if(u.pathname==='/api/chesscom-game'){
   const user=(u.searchParams.get('user')||'').toLowerCase(),kind=u.searchParams.get('kind')||'',id=u.searchParams.get('id')||'';
   if(!/^[a-z0-9_-]{1,40}$/.test(user)||!['live','daily'].includes(kind)||!/^[0-9]{1,20}$/.test(id))return respond(res,400,{error:'Нужен корректный ник и ссылка Chess.com'});
   try{
    const {archives}=await api(user+'/games/archives');
    const urlPattern=new RegExp('^https://(?:www\\.)?chess\\.com/game/'+kind+'/'+id+'/?$');
    for(const url of (archives||[]).slice(-3).reverse()){
      const m=url.match(/\/(\d{4})\/(\d{2})$/);if(!m)continue;
      const result=await api(`${user}/games/${m[1]}/${m[2]}`);
      const match=(result.games||[]).find(g=>g.rules==='chess'&&g.pgn&&urlPattern.test(g.url||''));
      if(match)return respond(res,200,{pgn:match.pgn});
    }
    return respond(res,404,{error:'Партия не найдена в последних трёх архивах этого игрока. Укажи ник участника или вставь PGN.'});
   }catch(e){return respond(res,502,{error:'Импорт Chess.com не удался: '+e.message});}
  }
  if(u.pathname==='/api/games'){
   const user=(u.searchParams.get('user')||'').toLowerCase();if(!/^[a-z0-9_-]{1,40}$/.test(user))return respond(res,400,{error:'Некорректный ник'});
   try{const {archives}=await api(user+'/games/archives');const games=[];
    for(const url of (archives||[]).slice(-3).reverse()){
      const m=url.match(/\/(\d{4})\/(\d{2})$/);if(!m)continue;
      const result=await api(`${user}/games/${m[1]}/${m[2]}`);
      games.push(...(result.games||[]).filter(g=>g.rules==='chess'&&g.pgn).map(g=>({pgn:g.pgn,white:g.white?.username,black:g.black?.username,whiteRating:g.white?.rating,blackRating:g.black?.rating,result:g.white?.result,ended:g.end_time,timeClass:g.time_class,url:g.url})));
      if(games.length>=30)break;
    }
    return respond(res,200,{games:games.sort((a,b)=>b.ended-a.ended).slice(0,30)});
   }catch(e){return respond(res,502,{error:'Импорт не удался: '+e.message+'. Можно вставить PGN вручную.'});}
  }
  const path=resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
  if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403);return res.end();}
  if(!(await stat(path)).isFile())throw Error('Not a file');
  const data=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(Number(process.env.PORT||4173),process.env.HOST||'127.0.0.1',()=>console.log('Johan Chess: http://'+(process.env.HOST||'127.0.0.1')+':'+(process.env.PORT||4173)));
