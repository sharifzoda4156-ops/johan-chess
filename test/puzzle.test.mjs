import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Chess} from 'chess.js';
import {preparePuzzle,advancePuzzle,filterPuzzles,finishAttempt,choosePuzzle} from '../public/puzzle-core.js';
import {parseUci} from '../public/training-core.js';
const pack=JSON.parse(readFileSync(new URL('../public/lichess-puzzles.json',import.meta.url)));
test('all imported rows retain published IDs and legal complete lines',()=>{
 assert.equal(pack.license,'CC0-1.0');assert.equal(pack.puzzles.length,1000);assert.equal(new Set(pack.puzzles.map(p=>p.id)).size,pack.puzzles.length);
 for(const row of pack.puzzles){const p=preparePuzzle(row,Chess);assert.ok(p,row.id);}
});
test('published first move is opponent setup; solution alternates',()=>{
 const row=pack.puzzles.find(p=>p.moves.length>=4),p=preparePuzzle(row,Chess);
 const start=new Chess(row.fen);start.move(parseUci(row.moves[0]));assert.equal(p.startFen,start.fen());
 let g=new Chess(p.startFen),i=0;while(i<p.solution.length){const n=advancePuzzle(p,g,i,parseUci(p.solution[i]),Chess);assert.ok(n);g=n.game;i=n.index;assert.equal(n.done,i===p.solution.length);}
});
test('wrong move preserves position and invalid lines rejected',()=>{
 const row=pack.puzzles.find(p=>p.moves.length>=4),p=preparePuzzle(row,Chess),g=new Chess(p.startFen),fen=g.fen();
 const wrong=g.moves({verbose:true}).find(m=>m.from+m.to+(m.promotion||'')!==p.solution[0]);assert.ok(wrong);assert.equal(advancePuzzle(p,g,0,wrong,Chess),null);assert.equal(g.fen(),fen);
 assert.equal(preparePuzzle({...row,moves:['a1a1','a2a2']},Chess),null);
});
test('filtering and progress use source rating and tags',()=>{
 const rows=filterPuzzles(pack.puzzles,'mateIn1','400-1199');assert.ok(rows.every(p=>p.rating<1200&&p.themes.includes('mateIn1')));
 let s=finishAttempt({},'002Q2',false);s=finishAttempt(s,'002X3',true);assert.equal(s.bestStreak,1);assert.equal(s.streak,0);assert.equal(choosePuzzle([{id:'002Q2'},{id:'other'}],s,'002Q2').id,'other');
});
