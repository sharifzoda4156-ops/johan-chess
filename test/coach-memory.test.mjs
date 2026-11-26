import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {memoryKey,normalizeMemory,loadMemory,saveMemory,recentConversation} from '../public/coach-memory.js';
const account='a'.repeat(64),key=memoryKey(account,' Johan ');
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
const pair=[{role:'user',content:'Разбери ошибку'},{role:'assistant',content:'Проверь угрозы'}];
test('memory is isolated by verified account and player, survives restart',()=>{
 const s=storage();assert.ok(key);assert.equal(memoryKey('','Johan'),null);
 assert.equal(saveMemory(s,key,{history:pair,goal:'1500',minutes:90},Chess).saved,true);
 assert.deepEqual(loadMemory(s,memoryKey(account,'johan'),Chess).history,pair);
 assert.equal(loadMemory(s,memoryKey('b'.repeat(64),'johan'),Chess).history.length,0);
 assert.equal(loadMemory(s,memoryKey(account,'other'),Chess).goal,'');
 assert.equal(loadMemory(s,key,Chess).minutes,90);
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
