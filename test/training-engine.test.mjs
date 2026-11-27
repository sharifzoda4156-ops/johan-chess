import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,formatEngineProgress} from '../public/engine.js';
test('training uses UCI skill and a timed legal-position search, independent of review search',async()=>{
 const original=globalThis.Worker,commands=[];
 globalThis.Worker=class {
  constructor(){this.closed=false;}
  postMessage(command){commands.push(command);const reply=command==='uci'?'uciok':command==='isready'?'readyok':command.startsWith('go movetime')?'bestmove e2e4 ponder e7e5':null;if(reply)queueMicrotask(()=>{if(!this.closed)this.onmessage({data:reply});});}
  terminate(){this.closed=true;}
 };
 let e;
 try{
  e=new Engine('mock');await e.init();await e.setSkill(3);
  assert.equal(await e.choose('start-fen',[],1000),'e2e4');
  assert.ok(commands.includes('setoption name Skill Level value 3'));
  assert.ok(commands.includes('position fen start-fen'));
  assert.ok(commands.includes('go movetime 1000'));
  assert.equal(await e.choose('start-fen',['e2e4','e7e5'],200),'e2e4');
  assert.ok(commands.includes('position fen start-fen moves e2e4 e7e5'));
  await assert.rejects(e.setSkill(21));
 }finally{e?.close();globalThis.Worker=original;}
});
test('Engine.searchMulti configures MultiPV and collects ranked principal variations',async()=>{
 const original=globalThis.Worker,commands=[];
 globalThis.Worker=class {
  constructor(){this.closed=false;}
  postMessage(command){
   commands.push(command);
   const send=lines=>queueMicrotask(()=>{if(!this.closed)for(const data of lines)this.onmessage({data});});
   if(command==='uci')send(['uciok']);
   else if(command==='isready')send(['readyok']);
   else if(command.startsWith('go depth ')){
    send([
     'info depth 12 multipv 1 score cp 240 pv f3e5 g4d1',
     'info depth 12 multipv 2 score cp 15 pv h2h3 g4h5',
     'bestmove f3e5'
    ]);
   }
  }
  terminate(){this.closed=true;}
 };
 let e;
 try{
  e=new Engine('mock');await e.init();
  const res=await e.searchMulti('start-fen',[],12,2);
  assert.ok(commands.includes('setoption name MultiPV value 2'));
  assert.equal(res.best,'f3e5');
  assert.equal(res.lines.length,2);
  assert.equal(res.lines[0].move,'f3e5');
  assert.equal(res.lines[0].score.value,240);
  assert.equal(res.lines[1].move,'h2h3');
  assert.equal(res.lines[1].score.value,15);
 }finally{e?.close();globalThis.Worker=original;}
});
test('Engine handles __jcProgress updates and surfaces __jcError instead of hanging',async()=>{
 assert.match(formatEngineProgress({loaded:3670016,total:7340032,percent:50,cached:false}),/50%.*3\.5 \/ 7\.0 МБ/);
 assert.equal(formatEngineProgress({cached:true,percent:100}),'Запускаю Stockfish…');
 assert.match(formatEngineProgress({fallback:'asm'}),/совместимости/);
 const original=globalThis.Worker;
 const seen=[];
 globalThis.Worker=class {
  constructor(){this.closed=false;}
  postMessage(command){
   if(command==='uci'){
    queueMicrotask(()=>{
     if(this.closed)return;
     this.onmessage({data:{__jcProgress:{loaded:1048576,total:5242880,percent:20,cached:false}}});
     this.onmessage({data:{__jcError:'WASM init failed in Opera'}});
    });
   }
  }
  terminate(){this.closed=true;}
 };
 let e;
 try{
  e=new Engine('mock',{onProgress:p=>seen.push(p.percent)});
  await assert.rejects(()=>e.init(),/WASM init failed in Opera/);
  assert.deepEqual(seen,[20]);
 }finally{e?.close();globalThis.Worker=original;}
});


