import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {makeClock,remaining,nextClock,clockText,liveClockText,terminal,flagResult,adaptiveLevel,parseUci} from '../public/training-core.js';
test('clock charges moving side, gives increment only on legal move and detects flag',()=>{
 const c=makeClock('15+10','w',1000);
 assert.deepEqual(remaining(c,3000),{w:898000,b:900000});
 const n=nextClock(c,3000);assert.equal(n.w,908000);assert.equal(n.turn,'b');assert.equal(remaining(n,5000).b,898000);
 assert.equal(nextClock(makeClock('10+0','b',0),600000),null);assert.equal(clockText(1),'0:01');
 assert.equal(liveClockText(null),'∞');assert.equal(liveClockText(25000),'0:25');assert.equal(liveClockText(14150),'0:14.2');assert.equal(liveClockText(0),'0:00.0');
 assert.equal(nextClock(makeClock('free','b',0),100000000).b,null);
});
test('checkmate, stalemate and repetition use full game history',()=>{
 const g=new Chess();for(const m of ['f3','e5','g4','Qh4#'])g.move(m);
 assert.equal(terminal(g).result,'0-1');
 const s=new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');assert.equal(terminal(s).reason,'Пат');
 const r=new Chess();for(let i=0;i<2;i++)for(const m of ['Nf3','Nf6','Ng1','Ng8'])r.move(m);assert.equal(terminal(r).result,'1/2-1/2');
});
test('timeout with bare king is draw; ordinary timeout loses',()=>{
 assert.equal(flagResult(new Chess(),'w').result,'0-1');
 assert.equal(flagResult(new Chess('7k/8/8/8/8/8/P7/K7 w - - 0 1'),'w').result,'1/2-1/2');
});
test('adaptive strength stays within bounds and draws retain level',()=>{
 assert.equal(adaptiveLevel(0,'0-1','w'),0);assert.equal(adaptiveLevel(5,'1-0','w'),5);
 assert.equal(adaptiveLevel(2,'0-1','b'),3);assert.equal(adaptiveLevel(2,'1-0','b'),1);assert.equal(adaptiveLevel(2,'1/2-1/2','b'),2);
});
test('UCI moves and underpromotion parse strictly',()=>{
 assert.deepEqual(parseUci('a7a8n'),{from:'a7',to:'a8',promotion:'n'});assert.deepEqual(parseUci('e2e4'),{from:'e2',to:'e4'});assert.throws(()=>parseUci('(none)'));
});
