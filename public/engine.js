import {parseInfo,parseMultiInfo} from './metrics.js';
const running=new Set();let onlineBlocked=false;
const WASM_CACHE_NAME='jc-stockfish-v18';

export function setEngineOnlineLock(value){onlineBlocked=!!value;if(onlineBlocked)for(const engine of [...running])engine.close();}

export function formatEngineProgress(p){
 if(!p||typeof p!=='object')return 'Запускаю Stockfish…';
 if(p.fallback==='asm')return 'Запускаю Stockfish (режим совместимости)…';
 if(p.cached)return 'Запускаю Stockfish…';
 if(Number(p.percent)>=100)return 'Компилирую Stockfish…';
 const pct=Math.max(0,Math.min(99,Math.round(Number(p.percent)||0)));
 const loadedMb=(Number(p.loaded)||0)/1048576;
 const totalMb=Math.max(loadedMb,(Number(p.total)||0)/1048576);
 return totalMb>0
  ?`Загружаю Stockfish · ${pct}% (${loadedMb.toFixed(1)} / ${totalMb.toFixed(1)} МБ)…`
  :`Загружаю Stockfish · ${pct}%…`;
}

function resolveWorkerUrl(path){
 if(typeof location!=='object'||!location?.href||typeof path!=='string'||!/\.js(?:[?#].*)?$/i.test(path))return path;
 try{
  const jsUrl=new URL(path,location.href).href;
  const wasmUrl=jsUrl.replace(/\.js(?:[?#].*)?$/i,'.wasm');
  const isPages=typeof document==='object'&&document?.documentElement?.dataset?.hosting==='pages';
  const asmUrl=isPages?new URL('./engine/stockfish-18-asm.js',location.href).href:'';
  const loaderUrl=new URL('./engine-worker.js',import.meta.url).href;
  return `${loaderUrl}#${encodeURIComponent(wasmUrl)},${encodeURIComponent(jsUrl)},${encodeURIComponent(asmUrl)}`;
 }catch{return path;}
}

let warmed=false;
export function warmEngineCache(path){
 if(warmed||onlineBlocked||typeof caches==='undefined'||typeof location!=='object'||typeof fetch!=='function')return;
 if(globalThis.JohanNative)return;
 if(globalThis.navigator?.connection?.saveData)return;
 warmed=true;
 try{
  const wasmUrl=new URL(path,location.href).href.replace(/\.js(?:[?#].*)?$/i,'.wasm');
  caches.open(WASM_CACHE_NAME).then(async cache=>{
   if(onlineBlocked||await cache.match(wasmUrl))return;
   const res=await fetch(wasmUrl,{credentials:'same-origin'});
   if(res.ok&&!onlineBlocked)await cache.put(wasmUrl,res);
  }).catch(()=>{});
 }catch{}
}

export class Engine{
 constructor(path,{onProgress}={}){
  if(onlineBlocked)throw Error('Stockfish недоступен во время онлайн-партии');
  this.closed=false;this.multiPv=1;this.bootError=null;this.onProgress=typeof onProgress==='function'?onProgress:null;
  this.worker=new Worker(resolveWorkerUrl(path));
  running.add(this);this.waiter=null;
  this.worker.onmessage=e=>{
   const payload=e?.data;
   if(payload&&typeof payload==='object'){
    if(payload.__jcError){
     const err=Error(String(payload.__jcError));
     this.bootError=err;
     this.waiter?.fail(err);
     return;
    }
    if(payload.__jcProgress){
     this.waiter?.touch?.();
     try{this.onProgress?.(payload.__jcProgress);}catch{}
     return;
    }
    return;
   }
   for(const l of String(payload).split('\n'))this.waiter?.line(l.trim());
  };
  this.worker.onerror=e=>{
   const err=Error(e?.message||'Ошибка запуска Stockfish');
   this.bootError=err;
   this.waiter?.fail(err);
  };
 }
 wait(command,predicate,ms=45000,onInfo=()=>{}){
  if(this.closed||onlineBlocked)throw Error('Stockfish отключён');
  if(this.bootError)return Promise.reject(this.bootError);
  if(this.waiter)throw Error('Stockfish занят');
  return new Promise((resolve,reject)=>{
   let timer;
   const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>end(Error('Stockfish не ответил')),ms);};
   const end=(err,val)=>{clearTimeout(timer);this.waiter=null;err?reject(err):resolve(val);};
   this.waiter={line:l=>{onInfo(l);if(predicate(l))end(null,l);},fail:e=>end(e),touch:arm};
   arm();
   try{this.worker.postMessage(command);}catch(e){end(e);}
  });
 }
 async init(onProgress){
  if(typeof onProgress==='function')this.onProgress=onProgress;
  await this.wait('uci',l=>l==='uciok',60000);
  this.worker.postMessage('setoption name Hash value 32');
  this.worker.postMessage('setoption name MultiPV value 1');
  this.multiPv=1;
  await this.wait('isready',l=>l==='readyok');
 }
 async setSkill(level){if(!Number.isInteger(level)||level<0||level>20)throw Error('Некорректная сложность');this.worker.postMessage('setoption name UCI_LimitStrength value false');this.worker.postMessage('setoption name Skill Level value '+level);await this.wait('isready',l=>l==='readyok');}
 async setMultiPv(count){const n=Math.max(1,Math.min(5,Number(count)||1));if(this.multiPv===n)return;this.worker.postMessage('setoption name MultiPV value '+n);this.multiPv=n;await this.wait('isready',l=>l==='readyok');}
 async choose(fen,moves,milliseconds){await this.setMultiPv(1);this.worker.postMessage('position fen '+fen+(moves.length?' moves '+moves.join(' '):''));const line=await this.wait('go movetime '+Math.max(1,Math.floor(milliseconds)),l=>l.startsWith('bestmove '),30000);return line.split(/\s+/)[1];}
 async search(fen,moves,depth,only){await this.setMultiPv(1);let info=null;this.worker.postMessage('position fen '+fen+(moves.length?' moves '+moves.join(' '):''));const line=await this.wait('go depth '+depth+(only?' searchmoves '+only:''),l=>l.startsWith('bestmove '),120000,l=>{const x=parseInfo(l);if(x&&(!info||x.depth>=info.depth))info=x;});if(!info)throw Error('Нет оценки движка: '+line);return {...info,best:line.split(/\s+/)[1]};}
 async searchMulti(fen,moves,depth,count=2){
  await this.setMultiPv(count);
  const byRank=new Map();
  this.worker.postMessage('position fen '+fen+(moves.length?' moves '+moves.join(' '):''));
  const line=await this.wait('go depth '+depth,l=>l.startsWith('bestmove '),120000,l=>{
   const x=parseMultiInfo(l);
   if(!x)return;
   const prev=byRank.get(x.multipv);
   if(!prev||x.depth>=prev.depth)byRank.set(x.multipv,x);
  });
  const lines=[...byRank.entries()].sort((a,b)=>a[0]-b[0]).map(([,v])=>({move:v.pv[0]||'',score:v.score,depth:v.depth,pv:v.pv}));
  if(!lines.length)throw Error('Нет оценки движка: '+line);
  const top=lines[0];
  return {...top,best:line.split(/\s+/)[1]||top.move,lines};
 }
 stopSearch(){if(this.closed||!this.waiter)return;try{this.worker.postMessage('stop');}catch{}}
 close(){if(this.closed)return;this.closed=true;running.delete(this);this.waiter?.fail(Error('Анализ остановлен'));this.worker.terminate();}
}

