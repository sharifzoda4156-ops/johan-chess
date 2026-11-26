import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeJourney,rewardJourney,journeyLevel,levelCost,breakJourney,targetSeconds,dayKey,dailyOrder,completeDaily,dailyStreak,shiftDay,createPuzzleTimer} from '../public/puzzle-journey.js';
const day='2026-11-26',p={id:'abc01',rating:1200,solution:['e2e4']};
test('XP and time bonuses, duplicates and assisted attempts',()=>{
 let r=rewardJourney({},p,{day,seconds:1,target:1100,clean:true});assert.equal(r.reward.points,32);assert.equal(r.state.xp,32);
 const duplicate=rewardJourney(r.state,p,{day,seconds:0,target:1100,clean:true});assert.equal(duplicate.reward,null);assert.equal(duplicate.state.xp,32);
 r=rewardJourney(r.state,{...p,id:'abc02'},{day,seconds:1000,target:1100,clean:true});assert.equal(r.reward.speed,0);assert.equal(r.reward.series,1);
 r=rewardJourney(r.state,{...p,id:'abc03'},{day,seconds:10,target:1100,clean:true});assert.equal(r.reward.daily,20);
 const failed=rewardJourney(r.state,{...p,id:'abc04'},{day,seconds:0,target:1100,clean:false});assert.equal(failed.reward,null);assert.equal(failed.state.streak,0);assert.equal(failed.state.xp,r.state.xp);
 assert.equal(breakJourney(r.state).bestStreak,3);
 assert.equal(normalizeJourney({...r.state,xp:999999}).xp,r.state.xp);
});
test('160 levels, boundaries and max',()=>{
 assert.equal(journeyLevel(0).level,1);assert.equal(journeyLevel(levelCost(1)).level,2);
 let total=0;for(let n=1;n<=20;n++)total+=levelCost(n);
 assert.equal(journeyLevel(total).name,'Конь');assert.equal(journeyLevel(total).position,1);
 assert.equal(journeyLevel(1e9).level,160);assert.equal(journeyLevel(1e9).maxed,true);assert.ok(targetSeconds(p,1100)>0);
});
test('daily rotation is independent of input order and user, consecutive dates differ',()=>{
 const rows=['abc01','abc02','abc03'].map(id=>({id}));
 assert.equal(dailyOrder(rows,day)[0].id,dailyOrder([...rows].reverse(),day)[0].id);
 assert.notEqual(dailyOrder(rows,day)[0].id,dailyOrder(rows,shiftDay(day,1))[0].id);
 assert.equal(shiftDay('2026-12-31',1),'2027-01-01');assert.equal(dayKey(new Date(2026,10,26)),day);
 assert.deepEqual(dailyOrder(rows,'2026-02-30'),[]);
});
test('daily completion is idempotent, streak and gap',()=>{
 let s=completeDaily({},shiftDay(day,-1),{id:p.id,seconds:10,hearts:4});
 assert.equal(dailyStreak(s,day),1);
 s=completeDaily(s,day,{id:'abc02',seconds:25,hearts:2});assert.equal(dailyStreak(s,day),2);
 s=completeDaily(s,day,{id:'abc03',seconds:1,hearts:5});assert.equal(s.records[day].id,'abc02');assert.equal(s.records[day].hearts,2);
 assert.equal(dailyStreak(s,shiftDay(day,2)),0);
});
test('timer counts only active time, repeated resume and pause are harmless',()=>{
 let now=0;const t=createPuzzleTimer(()=>now);t.resume();now=2000;t.resume();t.pause();now=7000;t.pause();assert.equal(t.seconds(),2);t.resume();now=8000;assert.equal(t.seconds(),3);t.reset();assert.equal(t.seconds(),0);
});
