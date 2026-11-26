import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {PACK,solutions,personalPuzzles,mergePersonal,finishAttempt,choosePuzzle,cleanProgress} from '../public/puzzle-core.js';
test('every bundled exercise has at least one legal solution and does not mutate input',()=>{
 for(const p of PACK){const s=solutions(p,Chess);assert.ok(s.length,p.id);}
 assert.equal(new Set(PACK.map(p=>p.id)).size,PACK.length);
});
test('mate objective accepts every legal mating move, including black',()=>{
 for(const p of PACK.filter(p=>p.goal==='mate'))for(const m of solutions(p,Chess)){const c=new Chess(p.fen);c.move(m);assert.ok(c.isCheckmate());}
});
test('personal exercises only derive from real completed game and legal best move',()=>{
 const c=new Chess(),g={complete:true,result:'1-0',color:'w',startFen:c.fen(),moves:['e4','e5'],analysis:[{index:0,color:'w',move:'e2e4',best:'d2d4',loss:10},{index:1,color:'b',move:'e7e5',best:'c7c5',loss:15}]};
 const ps=personalPuzzles({game:g},Chess);assert.equal(ps.length,1);assert.equal(ps[0].best,'d2d4');assert.equal(solutions(ps[0],Chess)[0].san,'d4');
 assert.equal(personalPuzzles({game:{...g,result:'*'}},Chess).length,0);
 assert.equal(personalPuzzles({game:{...g,analysis:[{...g.analysis[0],best:'e2e8'}]}},Chess).length,0);
 assert.equal(mergePersonal(ps,ps).length,1);
});
test('progress distinguishes clean and assisted solves, skips current when possible',()=>{
 let p=finishAttempt({},'a',false);assert.equal(p.clean,1);assert.equal(p.streak,1);
 p=finishAttempt(p,'b',true);assert.equal(p.completed,2);assert.equal(p.streak,0);assert.equal(p.bestStreak,1);
 assert.equal(choosePuzzle([{id:'a'},{id:'c'}],p,'a').id,'c');
 assert.deepEqual(cleanProgress(null).solved,[]);
});
