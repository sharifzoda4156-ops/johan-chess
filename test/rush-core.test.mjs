import test from 'node:test';
import assert from 'node:assert/strict';
import {createRush,remainingRush,elapsedRush,pauseRush,resumeRush,recordRush,checkRush,endRush,pickRush,difficulty,saveRushHistory,normalizeRushHistory} from '../public/rush-core.js';
const p=(id,rating=800)=>({id,rating});
test('3 and 5 minute deadlines, survival unlimited',()=>{
 for(const [mode,ms] of [['3',180000],['5',300000]]){let r=createRush(mode,100);assert.equal(remainingRush(r,100),ms);r=recordRush(r,p('abc01'),true,100+ms);assert.equal(r.score,0);assert.equal(r.reason,'time');assert.equal(r.end,100+ms);}
 assert.equal(remainingRush(createRush('survival',0),1e9),null);assert.equal(checkRush(createRush('survival',0),1e9).end,null);
});
test('three distinct wrong puzzles terminate every mode; solved puzzles earn one point',()=>{
 for(const mode of ['3','5','survival']){let r=createRush(mode,0);r=recordRush(r,p('abc01'),true,1);r=recordRush(r,p('abc01'),true,2);assert.equal(r.score,1);
 for(let i=2;i<=4;i++)r=recordRush(r,p('abc0'+i),false,i);assert.equal(r.mistakes,3);assert.equal(r.reason,'mistakes');assert.equal(recordRush(r,p('abc05'),true,6),r);}
});
test('difficulty increases and excludes already seen IDs',()=>{
 const pool=[p('abc01',600),p('abc02',700),p('abc03',1250),p('abc04',2800)];
 assert.equal(pickRush(pool,new Set(),0,()=>0).id,'abc01');assert.equal(pickRush(pool,new Set(['abc01']),0,()=>0).id,'abc02');assert.equal(pickRush(pool,new Set(),10,()=>0).id,'abc03');assert.equal(pickRush(pool,new Set(pool.map(x=>x.id)),100),null);assert.equal(difficulty(100),2800);
});
test('personal best survives history truncation and ignores stopped rounds',()=>{
 let r=recordRush(createRush('3',0),p('abc01'),true,1);r=endRush(r,2,'stopped');
 let h=saveRushHistory({},r,10);assert.equal(h.best['3'],0);assert.equal(h.runs[0].score,1);
 r=recordRush(createRush('5',0),p('abc02'),true,1);r=endRush(r,300000,'time');h=saveRushHistory(h,r,20);assert.equal(h.best['5'],1);assert.equal(h.best['3'],0);
 assert.equal(normalizeRushHistory({best:h.best,runs:[]}).best['5'],1);
});

test('rest is unlimited and cannot consume time or award another answer',()=>{
 let r=createRush('3',100);r=recordRush(r,p('abc01'),true,10100);r=pauseRush(r,10100);
 assert.equal(remainingRush(r,1000000),170000);assert.equal(elapsedRush(r,1000000),10000);
 assert.equal(checkRush(r,1000000),r);assert.equal(recordRush(r,p('abc02'),true,1000000),r);assert.equal(pauseRush(r,500000),r);
 r=resumeRush(r,1000000);assert.equal(remainingRush(r,1000000),170000);assert.equal(resumeRush(r,1000001),r);
 r=recordRush(r,p('abc02'),true,1010000);r=pauseRush(r,1010000);assert.equal(remainingRush(r,2000000),160000);
 r=endRush(r,2000000,'stopped');assert.equal(r.reason,'stopped');assert.equal(saveRushHistory({},r,2000000).runs[0].seconds,20);
});
test('deadline after multiple rests still rejects late moves',()=>{
 let r=pauseRush(createRush('5',0),0);r=resumeRush(r,10000);r=pauseRush(r,110000);r=resumeRush(r,200000);
 assert.equal(remainingRush(r,200000),200000);
 r=recordRush(r,p('abc01'),true,400000);assert.equal(r.reason,'time');assert.equal(r.score,0);assert.equal(elapsedRush(r,500000),300000);
});
test('survival elapsed time excludes rest and third error ends immediately',()=>{
 let r=createRush('survival',0);r=recordRush(r,p('abc01'),false,5000);r=pauseRush(r,5000);r=resumeRush(r,65000);
 r=recordRush(r,p('abc02'),false,70000);r=pauseRush(r,70000);r=resumeRush(r,130000);r=recordRush(r,p('abc03'),false,135000);
 assert.equal(r.reason,'mistakes');assert.equal(elapsedRush(r,135000),15000);assert.equal(resumeRush(r,200000),r);
});
