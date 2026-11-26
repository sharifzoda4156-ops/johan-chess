import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../public/engine.js';
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
