import {cacheGet,cachePut,cacheKeys} from './puzzle-cache.js';
const CATALOG='catalog-v1',TTL=6*60*60*1000;
let current=null,loadedAt=0,retryAfter=0;
export const packKey=(tag,p)=>tag+':'+p.asset+':'+p.offset+':'+p.sha256;
export function parseCatalog(text){
 const c=JSON.parse(text);
 if(c.schema!==1||c.license!=='CC0-1.0'||!/^lichess-data-\d{1,20}-\d{1,5}$/.test(c.tag)||!Array.isArray(c.packs)||!c.packs.length||c.packs.length>30000)throw Error('Некорректный каталог');
 const seen=new Set();let count=0;
 for(const p of c.packs){
  if(!/^band-\d{1,2}-\d{1,5}\.bin$/.test(p.asset)||!Number.isSafeInteger(p.offset)||p.offset<0||!Number.isSafeInteger(p.length)||p.length<1||p.length>1048576||p.offset+p.length>134217728||!Number.isInteger(p.count)||p.count<1||p.count>1000||!Number.isInteger(p.min)||!Number.isInteger(p.max)||p.min<0||p.max>9999||p.min>p.max||!Array.isArray(p.themes)||!p.themes.every(t=>typeof t==='string')||!/^[a-f0-9]{64}$/.test(p.sha256))throw Error('Некорректный пакет');
  const key=p.asset+':'+p.offset;if(seen.has(key))throw Error('Повтор пакета');seen.add(key);count+=p.count;
 }
 if(count!==c.total)throw Error('Неполный каталог');
 return c;
}
export function matchingPacks(c,theme,band,target){
 const [min,max]=(band==='adaptive'?'400-2999':band).split('-').map(Number);
 const distance=p=>Math.max(p.min-target,target-p.max,0);
 return c.packs.filter(p=>p.min<=max&&p.max>=min&&(theme==='all'||p.themes.includes(theme))).sort((a,b)=>distance(a)-distance(b)||a.asset.localeCompare(b.asset)||a.offset-b.offset);
}
async function fetchText(path){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),15000);
 try{const r=await fetch(path,{signal:ctrl.signal,cache:'no-store'});if(!r.ok)throw Error('Данные GitHub недоступны');return await r.text();}finally{clearTimeout(timer);}
}
async function catalog(){
 if(current&&Date.now()-loadedAt<TTL)return current;
 let saved=null;
 try{saved=JSON.parse(await cacheGet(CATALOG)||'null');if(saved){const c=parseCatalog(saved.text);current=c;loadedAt=saved.at;if(Date.now()-loadedAt<TTL)return c;}}catch{}
 if(Date.now()<retryAfter){if(current)return current;throw Error('GitHub temporarily unavailable');}
 try{const text=await fetchText('/api/puzzle-data/catalog');current=parseCatalog(text);loadedAt=Date.now();await cachePut(CATALOG,JSON.stringify({at:loadedAt,text}));return current;}
 catch(e){retryAfter=Date.now()+60000;if(current)return current;throw e;}
}
export async function decodePack(text,p){
 const bytes=new TextEncoder().encode(text);
 if(bytes.length!==p.length)throw Error('Неполный пакет');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==p.sha256)throw Error('Контрольная сумма пакета не совпала');
 const d=JSON.parse(text);
 if(d.license!=='CC0-1.0'||!Array.isArray(d.puzzles)||d.puzzles.length!==p.count)throw Error('Некорректные данные');
 const seen=new Set();
 for(const row of d.puzzles){if(!/^[A-Za-z0-9]{5}$/.test(row?.id||'')||seen.has(row.id)||!Number.isInteger(row.rating)||row.rating<p.min||row.rating>p.max||!Array.isArray(row.themes)||!Array.isArray(row.moves)||typeof row.fen!=='string')throw Error('Некорректная задача');seen.add(row.id);}
 return d.puzzles;
}
async function getPack(c,p){
 const key=packKey(c.tag,p);
 const saved=await cacheGet(key);
 if(saved)try{return {key,rows:await decodePack(saved,p),persisted:true};}catch{}
 if(Date.now()<retryAfter)throw Error('GitHub temporarily unavailable');
 const q=new URLSearchParams({tag:c.tag,asset:p.asset,offset:String(p.offset),length:String(p.length)});
 try{const text=await fetchText('/api/puzzle-data/pack?'+q),rows=await decodePack(text,p);retryAfter=0;return {key,rows,persisted:await cachePut(key,text)};}catch(e){retryAfter=Date.now()+60000;throw e;}
}
export function packCandidates(c,theme,band,target,excluded,seen,keys){
 const matches=matchingPacks(c,theme,band,target).filter(p=>!excluded.has(packKey(c.tag,p)));
 const isCached=p=>keys.has(packKey(c.tag,p)),isFresh=p=>!seen.has(packKey(c.tag,p));
 return {fresh:matches.filter(isFresh),cached:matches.filter(isCached),rest:matches.filter(p=>!isFresh(p)&&!isCached(p))};
}
export async function loadMorePuzzles({theme,band,target,excluded,seen}){
 const c=await catalog(),keys=new Set(await cacheKeys()),groups=packCandidates(c,theme,band,target,excluded,seen,keys);
 // Prefer unseen packs in rating order; cached packs remain available after eviction from RAM.
 // After a network failure, try cached packs without starting more downloads.
 const ordered=[...groups.fresh.slice(0,2),...groups.cached.slice(0,4),...groups.rest.slice(0,1)];
 const tried=new Set();let last;
 for(const p of ordered){
  const key=packKey(c.tag,p);if(tried.has(key))continue;tried.add(key);
  if(Date.now()<retryAfter&&!keys.has(key))continue;
  try{return await getPack(c,p);}catch(e){last=e;}
 }
 if(last)throw last;return null;
}
