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
