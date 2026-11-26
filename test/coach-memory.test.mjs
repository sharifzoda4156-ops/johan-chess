import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {memoryKey,normalizeMemory,loadMemory,saveMemory,recentConversation} from '../public/coach-memory.js';
const account='a'.repeat(64),key=memoryKey(account,' Johan ');
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
const pair=[{role:'user',content:'Разбери ошибку'},{role:'assistant',content:'Проверь угрозы'}];
test('memory is isolated by verified account and player, survives restart',()=>{
 const s=storage();assert.ok(key);assert.equal(memoryKey('','Johan'),null);
 assert.equal(saveMemory(s,key,{history:pair,goal:'1500',minutes:90,shareHistory:false},Chess).saved,true);
 assert.deepEqual(loadMemory(s,memoryKey(account,'johan'),Chess).history,pair);
 assert.equal(loadMemory(s,memoryKey('b'.repeat(64),'johan'),Chess).history.length,0);
 assert.equal(loadMemory(s,memoryKey(account,'other'),Chess).goal,'');
 assert.equal(loadMemory(s,key,Chess).minutes,90);assert.equal(loadMemory(s,key,Chess).shareHistory,false);
});
test('saved board is validated against original position and remains interactive',()=>{
 const g=new Chess(),fen=g.fen(),a=g.move('e4');g.undo();const b=g.move('d4');
 const card={fen,orientation:'w',label:'1. e4',played:{from:a.from,to:a.to,fen:a.after},best:{from:b.from,to:b.to,fen:b.after}};
 const rows=[pair[0],{...pair[1],parts:[{board:card}]}];
 const clean=normalizeMemory({history:rows},Chess);assert.equal(clean.history[1].parts[0].board.best.san,'d4');
 card.best.fen=fen;assert.equal(normalizeMemory({history:rows},Chess).history[1].parts[0].board,undefined);
});
test('history bounds, consent and complete pairs',()=>{
 const rows=Array.from({length:70},()=>pair).flat(),clean=normalizeMemory({history:rows},Chess);
 assert.equal(clean.history.length,100);assert.equal(recentConversation(clean.history,false).length,0);
 assert.equal(recentConversation(clean.history,true).length,12);
 assert.equal(normalizeMemory({history:[...pair,{role:'assistant',content:'orphan'}]},Chess).history.length,0);
 assert.equal(saveMemory({setItem(){throw Error('quota');}},key,{history:pair},Chess).saved,false);
});

import {shouldCompact,coachHistory,createMemoryUpdate} from '../public/coach-memory.js';
test('compact memory is bounded and only sent with history consent',()=>{
 let m=normalizeMemory({summary:'a'.repeat(5000),summaryPending:5},Chess);assert.equal(m.summary.length,2400);assert.ok(shouldCompact(m,[]));
 assert.equal(coachHistory({...m,shareHistory:false},pair).length,0);
 assert.equal(shouldCompact({...m,shareHistory:false},pair),false);
});
test('model owns the replacement; staged write is committed only on successful finish',()=>{
 const m=normalizeMemory({summary:'Old goal and stale detail',summaryPending:5,goal:'1500',plan:'Study endgames'},Chess);
 const tx=createMemoryUpdate(m,()=>true);
 assert.equal(tx.execute({action:'replace',summary:'New verified goal'}).ok,true);
 assert.equal(m.summary,'Old goal and stale detail');
 assert.equal(tx.execute({action:'replace',summary:'Another'}).ok,false);
 const saved=tx.finish(m);assert.equal(saved.summary,'New verified goal');assert.equal(saved.summaryPending,0);assert.equal(saved.goal,'1500');assert.equal(saved.plan,'Study endgames');
 assert.equal(createMemoryUpdate(m,()=>true).finish(m).summaryPending,6);
});
test('keep, clear, invalid input, consent revocation and profile switch',()=>{
 let allowed=true;const m=normalizeMemory({summary:'Old',summaryPending:5},Chess);
 let tx=createMemoryUpdate(m,()=>allowed);
 assert.equal(tx.execute({action:'replace',summary:'x'.repeat(2401)}).ok,false);
 assert.equal(tx.execute({action:'keep',summary:'not empty'}).ok,false);
 assert.equal(tx.execute({action:'replace',summary:'',goal:'injected'}).ok,false);
 assert.equal(tx.execute({action:'keep',summary:''}).ok,true);
 assert.equal(tx.finish(m).summary,'Old');assert.equal(tx.finish(m).summaryPending,0);
 tx=createMemoryUpdate(m,()=>allowed);assert.equal(tx.execute({action:'replace',summary:''}).ok,true);
 assert.equal(tx.finish(m).summary,'');assert.equal(shouldCompact(tx.finish(m),Array(20).fill({})),false);
 allowed=false;assert.equal(tx.finish(m),m);assert.equal(createMemoryUpdate(m,()=>allowed).execute({action:'replace',summary:'new'}).ok,false);
 const off={...m,shareHistory:false};assert.equal(createMemoryUpdate(off,()=>true).execute({action:'replace',summary:'new'}).ok,false);
 assert.equal(createMemoryUpdate(off,()=>true).finish(off),off);
});
