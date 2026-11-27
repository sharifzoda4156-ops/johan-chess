import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {positionFeatures} from '../public/position-features.js';

test('initial board has no pins, checkers, hanging candidates or pawn weaknesses; no mutation',()=>{
  const chess=new Chess(),fen=chess.fen(),facts=positionFeatures(chess);
  assert.equal(facts.fen,fen);
  assert.equal(facts.sideToMove,'w');
  for(const key of ['pins','checkers','attackedUndefended','openFiles'])assert.deepEqual(facts[key],[]);
  for(const color of ['w','b'])assert.deepEqual(facts.pawnStructure[color],{isolated:[],doubled:[],passed:[]});
  assert.equal(chess.fen(),fen);assert.deepEqual(chess.history(),[]);
  assert.deepEqual(positionFeatures(chess),facts);
});
test('absolute pins on files and diagonals, for both colors, with blockers',()=>{
  const file=new Chess('k3r3/8/8/8/8/8/4N3/4K3 w - - 0 1');
  assert.deepEqual(positionFeatures(file).pins,[{king:'e1',pinned:'e2',by:'e8'}]);
  const blocked=new Chess('k3r3/8/8/8/4P3/8/4N3/4K3 w - - 0 1');
  assert.deepEqual(positionFeatures(blocked).pins,[]);
  const diagonal=new Chess('4k3/3n4/8/1B6/8/8/8/K7 b - - 0 1');
  assert.deepEqual(positionFeatures(diagonal).pins,[{king:'e8',pinned:'d7',by:'b5'}]);
  const wrongSlider=new Chess('4k3/3n4/8/1R6/8/8/8/K7 b - - 0 1');
  assert.deepEqual(positionFeatures(wrongSlider).pins,[]);
});
test('attacked undefended pieces are geometric, not claims of a winning capture',()=>{
  const chess=new Chess('k7/8/8/8/3q4/8/3R4/7K w - - 0 1');
  const facts=positionFeatures(chess);
  assert.ok(facts.attackedUndefended.some(p=>p.square==='d2'&&p.piece==='wr'&&p.attackers.includes('d4')));
  const defended=new Chess('k7/8/8/8/3q4/8/3R4/3R3K w - - 0 1');
  assert.ok(!positionFeatures(defended).attackedUndefended.some(p=>p.square==='d2'));
});
test('checks are for the side to move and include multiple attackers',()=>{
  const chess=new Chess('k3r3/8/8/8/1b6/8/8/4K3 w - - 0 1');
  assert.deepEqual(positionFeatures(chess).checkers,['b4','e8']);
  const black=new Chess('4k3/8/8/8/8/8/8/K3R3 b - - 0 1');
  assert.deepEqual(positionFeatures(black).checkers,['e1']);
});
test('pawn structure distinguishes blocked passed candidates, adjacent files and doubled pawns',()=>{
  const chess=new Chess('7k/8/1p6/4P3/4P3/8/P6p/K7 w - - 0 1');
  const {pawnStructure,openFiles}=positionFeatures(chess);
  assert.deepEqual(pawnStructure.w,{isolated:['a2','e4','e5'],doubled:['e4','e5'],passed:['e5']});
  assert.deepEqual(pawnStructure.b,{isolated:['b6','h2'],doubled:[],passed:['h2']});
  assert.deepEqual(openFiles,['c','d','f','g']);
});
test('legal game replay preserves history and orientation',()=>{
  const chess=new Chess();for(const m of ['e4','e5','Nf3','Nc6','Bb5'])chess.move(m);
  const history=chess.history(),fen=chess.fen();
  assert.equal(positionFeatures(chess).sideToMove,'b');
  assert.equal(chess.fen(),fen);assert.deepEqual(chess.history(),history);
});
