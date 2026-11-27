import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {createSearchCollector,verifiedSearchLine} from '../lib/coach-stockfish-line.mjs';
const fen=new Chess().fen();
test('collect last exact principal variation without changing existing score semantics',()=>{
  const c=createSearchCollector();
  assert.equal(c.push('info depth 8 score cp 17 multipv 1 pv e2e4 e7e5'),undefined);
  c.push('info depth 10 score cp 23 multipv 1 pv d2d4 d7d5 c2c4');
  c.push('info depth 11 score cp 25 lowerbound pv e2e4');
  c.push('info depth 11 multipv 2 score cp 22 pv e2e4');
  c.push('info nodes 123 nps 500');
  const result=c.push('bestmove d2d4 ponder d7d5');
  assert.equal(result.score,22);
  assert.deepEqual(verifiedSearchLine(fen,result,Chess),{bestUci:'d2d4',bestSan:'d4',pvUci:['d2d4','d7d5','c2c4'],pvSan:['d4','d5','c4'],depth:10,source:'pv'});
});
test('stale, malformed and illegal continuations degrade to the verified best move only',()=>{
  for(const moves of [['d2d4','d7d5'],['e2e4','e7e9'],['e2e4','e2e5'],['e2e4','e7e5','e4e6']]){
    const line=verifiedSearchLine(fen,{bestUci:'e2e4',variation:{depth:12,moves}},Chess);
    assert.deepEqual(line,{bestUci:'e2e4',bestSan:'e4',pvUci:['e2e4'],pvSan:['e4'],depth:null,source:'bestmove'});
  }
  for(const bestUci of ['(none)','0000','e2e5','e7e5','invalid'])assert.equal(verifiedSearchLine(fen,{bestUci},Chess),null);
  assert.equal(verifiedSearchLine(fen,null,Chess),null);
});
test('legal promotion and castling are translated to SAN from the exact FEN',()=>{
  const promotion='7k/P7/8/8/8/8/8/7K w - - 0 1';
  assert.equal(verifiedSearchLine(promotion,{bestUci:'a7a8q'},Chess).bestSan,'a8=Q+');
  const castle='r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
  assert.deepEqual(verifiedSearchLine(castle,{bestUci:'e1g1',variation:{depth:12,moves:['e1g1','e8c8']}},Chess).pvSan,['O-O','O-O-O']);
});
test('principal variation is capped at eight half-moves',()=>{
  const moves=['e2e4','e7e5','g1f3','b8c6','f1b5','a7a6','b5a4','g8f6','e1g1'];
  const c=createSearchCollector();c.push('info depth 12 score cp 12 pv '+moves.join(' '));
  const line=verifiedSearchLine(fen,c.push('bestmove e2e4'),Chess);
  assert.equal(line.pvSan.length,8);assert.equal(line.pvUci.length,8);
});
