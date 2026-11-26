import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {createCoachTools,readFinishedGame} from '../public/coach-tools.js';
const pgn='[White "User"]\n[Black "Bot"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 1-0';
test('only completed games; disallowed tools never read storage or network',async()=>{
 assert.throws(()=>readFinishedGame(pgn.replaceAll('1-0','*'),Chess));
 const execute=createCoachTools({Chess,allow:false,storage:{getItem(){throw Error('unexpected');}},fetcher(){throw Error('unexpected');},user:'User',stats:()=>({})});
 assert.equal((await execute('game_list',{source:'local'})).ok,false);
});
test('local completed game and Stockfish search are scoped to validated moves; cache reuse',async()=>{
 let searches=0,closed=0;
 class Engine{async init(){} async search(fen,prefix,depth,only){searches++;return {best:only||'d2d4',pv:[only||'d2d4'],depth,score:{kind:'cp',value:only?10:30}};}close(){closed++;}}
 const game=readFinishedGame(pgn,Chess),run=createCoachTools({Chess,Engine,enginePath:'test',storage:{getItem:()=>JSON.stringify([{user:'User',pgn},{user:'Other',pgn}])},user:'User',game,allow:true,stats:()=>({})});
 const list=await run('game_list',{source:'local'});assert.equal(list.data.length,1);
 assert.equal((await run('stockfish_move',{game_id:'missing',ply:0,depth:10})).ok,false);
 assert.equal((await run('stockfish_move',{game_id:'current',ply:-1,depth:10})).ok,false);
 const a=await run('stockfish_move',{game_id:'current',ply:0,depth:10});assert.equal(a.data.bestSan,'d4');assert.equal(a.data.cacheHit,false);assert.equal(searches,2);assert.equal(closed,1);
 const b=await run('stockfish_move',{game_id:'current',ply:0,depth:10});assert.equal(b.data.cacheHit,true);assert.equal(searches,2);
});

test('full saved report is returned without starting a worker, partial ranges are explicit',async()=>{
 const game=readFinishedGame(pgn,Chess),c=new Chess(game.startFen);
 const analysis=game.moves.map((san,index)=>{const m=c.move(san),move=m.from+m.to;return {index,san,color:m.color,move,best:move,bestSan:san,loss:0,accuracy:100,bestScore:{kind:'cp',value:0},playedScore:{kind:'cp',value:0}};});
 const run=createCoachTools({Chess,Engine:class{constructor(){throw Error('unexpected worker');}},enginePath:'report-test',storage:{getItem:()=>null},user:'User',game:{...game,analysis,complete:true,depth:10},allow:true,stats:()=>({})});
 const r=await run('game_report',{game_id:'current',from:0,count:1,depth:10});assert.equal(r.ok,true);assert.equal(r.data.complete,true);assert.equal(r.data.covered,3);assert.equal(r.data.next,null);assert.equal(r.data.white.accuracy,100);
 const bad=await run('game_report',{game_id:'current',from:0,count:100,depth:10});assert.equal(bad.ok,false);
});
test('puzzle search returns source IDs without solutions and respects the filter',async()=>{
 const run=createCoachTools({Chess,storage:{getItem:()=>null},fetcher:async()=>({ok:true,json:async()=>({license:'CC0-1.0',puzzles:[{id:'abc01',rating:1100,themes:['fork'],moves:['a2a3']},{id:'abc02',rating:1800,themes:['fork']}]})}),user:'User',allow:true,stats:()=>({})});
 const r=await run('puzzle_search',{theme:'fork',min:1000,max:1200});assert.equal(r.ok,true);assert.equal(r.data.length,1);assert.equal(r.data[0].id,'abc01');assert.equal('moves' in r.data[0],false);
});
