const LIMIT=50*1024*1024;
let opening;
function db(){
 if(!opening)opening=new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB){reject(Error('No IndexedDB'));return;}
  const req=indexedDB.open('jc-lichess-packs-v1',1);
  req.onupgradeneeded=()=>{req.result.createObjectStore('data');req.result.createObjectStore('meta',{keyPath:'key'});};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('Cache blocked'));
 });
 return opening;
}
const result=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
const completed=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('Cache write failed'));});
export function evictions(entries,key,size,limit=LIMIT){
 const others=entries.filter(e=>e.key!==key).sort((a,b)=>a.used-b.used);
 let total=others.reduce((n,e)=>n+e.size,0)+size;const remove=[];
 for(const e of others){if(total<=limit)break;remove.push(e.key);total-=e.size;}
 return remove;
}
export async function cacheGet(key){
 try{const d=await db(),tx=d.transaction(['data','meta'],'readwrite'),data=tx.objectStore('data'),meta=tx.objectStore('meta');
  const [value,entry]=await Promise.all([result(data.get(key)),result(meta.get(key))]);
  if(entry)meta.put({...entry,used:Date.now()});return typeof value==='string'?value:null;
 }catch{return null;}
}
export async function cachePut(key,value){
 const size=new TextEncoder().encode(value).byteLength;if(size>LIMIT)return false;
 try{const d=await db(),tx=d.transaction(['data','meta'],'readwrite'),done=completed(tx),data=tx.objectStore('data'),meta=tx.objectStore('meta');
  done.catch(()=>{});const entries=await result(meta.getAll());for(const k of evictions(entries,key,size)){data.delete(k);meta.delete(k);}
  data.put(value,key);meta.put({key,size,used:Date.now()});await done;return true;
 }catch{return false;}
}
export async function cacheKeys(){
 try{return (await result((await db()).transaction('meta').objectStore('meta').getAllKeys())).filter(k=>typeof k==='string');}catch{return [];}
}
