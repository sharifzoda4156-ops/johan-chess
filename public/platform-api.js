// GitHub Pages has no Node server. Keep Android and local server routes unchanged.
export const isPages=()=>globalThis.document?.documentElement?.dataset.hosting==='pages';
const playerBase='https://api.chess.com/pub/player/';
const catalog='https://raw.githubusercontent.com/sharifzoda4156-ops/johan-chess/puzzle-catalog/catalog.json';
const release='https://github.com/sharifzoda4156-ops/johan-chess/releases/download/';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
export async function platformFetch(path,options={},fetcher=globalThis.fetch,pages=isPages()){
 if(!pages)return fetcher(path,options);
 const url=new URL(path,'https://local.invalid'),route=url.pathname;
 if(route==='/api/puzzle-data/catalog')return fetcher(catalog,options);
 if(route==='/api/puzzle-data/pack'){
  const q=url.searchParams,tag=q.get('tag'),asset=q.get('asset'),o=q.get('offset'),l=q.get('length');
  if(!/^lichess-data-\d{1,20}-\d{1,5}$/.test(tag||'')||!/^band-\d{1,2}-\d{1,5}\.bin$/.test(asset||'')||!/^\d{1,9}$/.test(o||'')||!/^\d{1,7}$/.test(l||''))throw Error('Некорректный пакет');
  const offset=Number(o),length=Number(l),end=offset+length-1;
  if(length<1||length>1048576||end>=134217728)throw Error('Некорректный диапазон');
  const r=await fetcher(release+tag+'/'+asset,{...options,headers:{Range:'bytes='+offset+'-'+end}});
  if(r.status!==206){await r.body?.cancel();throw Error('Сервер не поддерживает загрузку диапазона');}
  const range=r.headers.get('content-range');
  if(range){const m=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);if(!m||Number(m[1])!==offset||Number(m[2])!==end||Number(m[3])<=end||Number(m[3])>134217728){await r.body?.cancel();throw Error('Некорректный диапазон ответа');}}
  // Existing decodePack checks exact byte length and SHA-256 before use.
  const reader=r.body?.getReader();if(!reader)throw Error('Пакет недоступен');
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>length){await reader.cancel();throw Error('Пакет слишком большой');}chunks.push(value);}}finally{reader.releaseLock();}
  if(size!==length)throw Error('Неполный пакет');return new Response(new Blob(chunks),{status:200});
 }
 if(route!=='/api/games'&&route!=='/api/player-stats')return fetcher(path,options);
 const user=(url.searchParams.get('user')||'').toLowerCase();
 if(!/^[a-z0-9_-]{1,40}$/.test(user))return json({error:'Некорректный ник'},400);
 const signal=options.signal||AbortSignal.timeout(15000);
 async function get(suffix){const r=await fetcher(playerBase+user+'/'+suffix,{signal});if(!r.ok)throw Error('Chess.com HTTP '+r.status);return r.json();}
 try{
  if(route==='/api/player-stats')return json(await get('stats'));
  const {archives}=await get('games/archives'),games=[];
  for(const archive of (Array.isArray(archives)?archives:[]).slice(-3).reverse()){
   const m=/\/(\d{4})\/(\d{2})$/.exec(archive);if(!m)continue;
   const result=await get('games/'+m[1]+'/'+m[2]);
   games.push(...(result.games||[]).filter(g=>g.rules==='chess'&&g.pgn).map(g=>({pgn:g.pgn,white:g.white?.username,black:g.black?.username,whiteRating:g.white?.rating,blackRating:g.black?.rating,result:g.white?.result,ended:g.end_time,timeClass:g.time_class,url:g.url})));
   if(games.length>=30)break;
  }
  return json({games:games.sort((a,b)=>b.ended-a.ended).slice(0,30)});
 }catch{return json({error:'Chess.com недоступен из браузера. Можно вставить PGN вручную.'},502);}
}
