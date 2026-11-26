import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTraining,recordOutcome,summarizeTraining,selectTrainingPuzzle} from '../public/puzzle-training.js';
const p=(id,rating=1100,themes=['fork'])=>({id,rating,themes});
test('clean advances target and assisted lowers it; skips never change it',()=>{
 const start=normalizeTraining(null);assert.equal(start.target,1100);
 let s=recordOutcome(start,p('abc01'),'clean');assert.equal(s.target,1120);
 const skipped=recordOutcome(s,p('abc02',1800),'skipped');assert.equal(skipped.target,s.target);
 s=recordOutcome(skipped,p('abc03'),'assisted');assert.ok(s.target<skipped.target);
 assert.deepEqual(summarizeTraining(s).topics.fork,{clean:1,attempts:2});
 assert.equal(summarizeTraining(s).accuracy,50);assert.equal(summarizeTraining(s).skipped,1);
});
test('retries, hints after first result, and previously solved tasks do not inflate estimates',()=>{
 const s=recordOutcome(null,p('abc01'),'assisted');
 assert.deepEqual(recordOutcome(s,p('abc01'),'clean'),s);
 assert.deepEqual(recordOutcome(s,p('abc02'),'clean',['abc02']),s);
 assert.deepEqual(normalizeTraining({target:2999,records:[...s.records,...s.records]}),s);
});
test('adaptive selects closest unseen published rating, then repeats only if necessary',()=>{
 const rows=[p('abc01',700),p('abc02',1110),p('abc03',1300)];
 assert.equal(selectTrainingPuzzle(rows,null,[],null).id,'abc02');
 const s=recordOutcome(null,rows[1],'assisted');
 assert.equal(selectTrainingPuzzle(rows,s,[],'abc02').id,'abc03');
 assert.equal(selectTrainingPuzzle(rows,s,['abc01','abc02','abc03'],'abc02').id,'abc03');
 assert.equal(selectTrainingPuzzle([],s,[],null),null);
 assert.equal(selectTrainingPuzzle(rows,null,[],'abc02',false).id,'abc03');
});
test('invalid persisted data cannot invent results; overlapping topics are counted independently',()=>{
 const s=recordOutcome(null,p('abc01',1100,['fork','pin','fork','bad']),'clean');
 const stats=summarizeTraining({records:[...s.records,{id:'abc02',rating:NaN,outcome:'clean'},...s.records]});
 assert.equal(stats.attempts,1);assert.deepEqual(stats.topics.fork,{clean:1,attempts:1});assert.deepEqual(stats.topics.pin,{clean:1,attempts:1});
});
