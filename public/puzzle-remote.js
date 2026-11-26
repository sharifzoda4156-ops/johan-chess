import {cacheGet,cachePut,cacheKeys} from './puzzle-cache.js';
const CATALOG='catalog-v1',TTL=6*60*60*1000;
let current=null,loadedAt=0;
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
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),35000);
 try{const r=await fetch(path,{signal:ctrl.signal,cache:'no-store'});if(!r.ok)throw Error('Данные GitHub недоступны');return await r.text();}finally{clearTimeout(timer);}
}
async function catalog(){
 if(current&&Date.now()-loadedAt<TTL)return current;
 let saved=null;
 try{saved=JSON.parse(await cacheGet(CATALOG)||'null');if(saved){const c=parseCatalog(saved.text);current=c;loadedAt=saved.at;if(Date.now()-loadedAt<TTL)return c;}}catch{}
 try{const text=await fetchText('/api/puzzle-data/catalog');current=parseCatalog(text);loadedAt=Date.now();await cachePut(CATALOG,JSON.stringify({at:loadedAt,text}));return current;}
 catch(e){if(current)return current;throw e;}
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
 const q=new URLSearchParams({tag:c.tag,asset:p.asset,offset:String(p.offset),length:String(p.length)});
 const text=await fetchText('/api/puzzle-data/pack?'+q),rows=await decodePack(text,p);
 return {key,rows,persisted:await cachePut(key,text)};
}
export async function loadMorePuzzles({theme,band,target,excluded,seen}){
 const c=await catalog(),matches=matchingPacks(c,theme,band,target),keys=new Set(await cacheKeys());
 const eligible=matches.filter(p=>!excluded.has(packKey(c.tag,p)));
 // Cached packs can be used offline; try new remote packs when local ones are exhausted.
 const cached=eligible.filter(p=>keys.has(packKey(c.tag,p))),fresh=eligible.filter(p=>!keys.has(packKey(c.tag,p))&&!seen.has(packKey(c.tag,p))),rest=eligible.filter(p=>!keys.has(packKey(c.tag,p))&&seen.has(packKey(c.tag,p)));
 const ordered=[...cached,...fresh,...rest];if(!ordered.length)return null;
 let last;
 for(const p of ordered.slice(0,3)){try{return await getPack(c,p);}catch(e){last=e;if(!keys.has(packKey(c.tag,p)))break;}}
 if(last)throw last;return null;
}
