// Reliable Stockfish Web Worker loader:
// 1. Caches .wasm in CacheStorage ('jc-stockfish-v18') for instant repeat startups on slow mobile networks.
// 2. Streams download progress to the main thread so slow 4G links never hit premature timeouts.
// 3. Compiles WASM via WebAssembly.instantiate(ArrayBuffer) instead of instantiateStreaming(synthetic ReadableStream),
//    fixing silent Promise rejections in Opera Mobile and strict proxy browsers.
// 4. Falls back to stockfish-18-asm.js (when provided on Web Pages) on devices without WASM SIMD.
(function(){
 const CACHE_NAME='jc-stockfish-v18';
 const DEFAULT_WASM_BYTES=7295411;
 const SIMD_TEST=new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]);

 const parts=String(self.location.hash||'').replace(/^#/,'').split(',');
 const wasmUrl=decodeURIComponent(parts[0]||'');
 const jsUrl=decodeURIComponent(parts[1]||'');
 const asmUrl=decodeURIComponent(parts[2]||'');

 const queued=[];
 let booted=false;
 let failed=false;

 function fail(err){
  if(failed)return;
  failed=true;
  const msg=(err&&typeof err==='object'&&err.message)?err.message:String(err||'Ошибка запуска Stockfish');
  try{self.postMessage({__jcError:msg});}catch{}
 }

 self.addEventListener('error',e=>fail(e?.message||'Ошибка Stockfish Worker'));
 self.addEventListener('unhandledrejection',e=>{e?.preventDefault?.();fail(e?.reason||'Ошибка инициализации WASM');});

 function queueListener(e){
  if(booted)return;
  queued.push(e.data);
 }
 self.addEventListener('message',queueListener);

 function supportsWasmSimd(){
  try{return typeof WebAssembly==='object'&&typeof WebAssembly.validate==='function'&&WebAssembly.validate(SIMD_TEST);}
  catch{return false;}
 }

 async function readCache(url){
  if(typeof caches==='undefined'||!url)return null;
  try{
   const cache=await caches.open(CACHE_NAME);
   const hit=await cache.match(url);
   if(!hit||!hit.ok)return null;
   const buf=await hit.arrayBuffer();
   return buf.byteLength>1024?new Uint8Array(buf):null;
  }catch{return null;}
 }

 async function writeCache(url,bytes){
  if(typeof caches==='undefined'||!url||!bytes?.byteLength)return;
  try{
   const cache=await caches.open(CACHE_NAME);
   await cache.put(url,new Response(bytes,{status:200,headers:{'Content-Type':'application/wasm'}}));
  }catch{}
 }

 async function loadWasmBytes(url){
  const cached=await readCache(url);
  if(cached){
   self.postMessage({__jcProgress:{loaded:cached.byteLength,total:cached.byteLength,percent:100,cached:true}});
   return cached;
  }
  const res=await fetch(url,{credentials:'same-origin'});
  if(!res.ok)throw new Error('Не удалось загрузить Stockfish (HTTP '+res.status+')');
  const headerLen=Number(res.headers.get('content-length'))||0;
  const total=headerLen>0?headerLen:DEFAULT_WASM_BYTES;
  let bytes;
  if(res.body&&typeof res.body.getReader==='function'){
   const reader=res.body.getReader();
   const chunks=[];
   let loaded=0,lastEmit=0;
   self.postMessage({__jcProgress:{loaded:0,total,percent:0,cached:false}});
   while(true){
    const {done,value}=await reader.read();
    if(done)break;
    if(value&&value.byteLength){
     chunks.push(value);
     loaded+=value.byteLength;
     const now=Date.now();
     if(now-lastEmit>=120){
      lastEmit=now;
      const denom=Math.max(total,loaded);
      self.postMessage({__jcProgress:{loaded,total:denom,percent:Math.min(99,Math.round((loaded/denom)*100)),cached:false}});
     }
    }
   }
   bytes=new Uint8Array(loaded);
   let offset=0;
   for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  }else{
   bytes=new Uint8Array(await res.arrayBuffer());
  }
  if(!bytes.byteLength)throw new Error('Пустой файл Stockfish WASM');
  self.postMessage({__jcProgress:{loaded:bytes.byteLength,total:bytes.byteLength,percent:100,cached:false}});
  await writeCache(url,bytes);
  return bytes;
 }

 function flushQueued(){
  booted=true;
  self.removeEventListener('message',queueListener);
  const handler=self.onmessage;
  while(queued.length){
   const data=queued.shift();
   if(typeof handler==='function')handler({data});
  }
 }

 async function boot(){
  if(!jsUrl)throw new Error('Не указан путь к движку Stockfish');
  const useWasm=supportsWasmSimd();
  if(!useWasm&&asmUrl){
   self.postMessage({__jcProgress:{fallback:'asm',percent:100}});
   self.removeEventListener('message',queueListener);
   importScripts(asmUrl);
   flushQueued();
   return;
  }
  const wasmBytes=await loadWasmBytes(wasmUrl);
  // Pre-validate WASM bytes before handing to Stockfish bootstrap so SIMD mismatch falls back cleanly to ASM.js.
  if(typeof WebAssembly.validate==='function'&&!WebAssembly.validate(wasmBytes)){
   if(asmUrl){
    self.postMessage({__jcProgress:{fallback:'asm',percent:100}});
    self.removeEventListener('message',queueListener);
    importScripts(asmUrl);
    flushQueued();
    return;
   }
   throw new Error('Браузер не поддерживает WASM-модуль Stockfish');
  }
  const nativeFetch=self.fetch.bind(self);
  self.fetch=function(input,init){
   const u=typeof input==='string'?input:(input&&input.url)||'';
   if(u===wasmUrl||u.endsWith('.wasm')){
    return Promise.resolve(new Response(new Uint8Array(0),{status:200,headers:{'Content-Type':'application/wasm'}}));
   }
   return nativeFetch(input,init);
  };
  // Always compile from the preloaded ArrayBuffer to avoid Opera Mobile instantiateStreaming failures.
  WebAssembly.instantiateStreaming=function(source,importObject){
   return Promise.resolve(source).then(()=>WebAssembly.instantiate(wasmBytes,importObject));
  };
  self.removeEventListener('message',queueListener);
  importScripts(jsUrl);
  flushQueued();
 }

 boot().catch(err=>{
  if(asmUrl&&!booted){
   try{
    self.postMessage({__jcProgress:{fallback:'asm',percent:100}});
    self.removeEventListener('message',queueListener);
    importScripts(asmUrl);
    flushQueued();
    return;
   }catch(fallbackErr){
    fail(fallbackErr);
    return;
   }
  }
  fail(err);
 });
})();
