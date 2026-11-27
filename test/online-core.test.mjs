import test from 'node:test';import assert from 'node:assert/strict';import {Chess} from 'chess.js';
import {matchControl,readOnlineGame,firstMoveRemaining,serverClock,resultText,completedPgn} from '../public/online-core.js';
const full={id:'abcd1234',variant:{key:'standard'},initialFen:'startpos',white:{id:'user'},black:{id:'opponent'}};
const state={moves:'e2e4 e7e5',wtime:600000,btime:599000,status:'started'};
test('supported time controls',()=>{assert.equal(matchControl(3,2),false);assert.equal(matchControl(3,2,true),true);assert.equal(matchControl(10,0),true);assert.equal(matchControl(30,20),true);assert.equal(matchControl(1,0,true),false);});
test('server position and participant validation',()=>{const g=readOnlineGame(full,state,'User',Chess);assert.equal(g.color,'w');assert.deepEqual(serverClock(g,3000),{w:597000,b:599000});assert.equal(firstMoveRemaining(g,3000),null);assert.equal(resultText(g),'Твой ход');assert.throws(()=>readOnlineGame(full,state,'other',Chess));assert.throws(()=>readOnlineGame({...full,variant:{key:'chess960'}},state,'user',Chess));assert.throws(()=>readOnlineGame(full,{...state,moves:'e2e5'},'user',Chess));const done=readOnlineGame(full,{...state,status:'resign',winner:'white'},'user',Chess);assert.equal(resultText(done),'Победа');assert.deepEqual(serverClock(done,10000),{w:600000,b:599000});});
test('firstMoveRemaining tracks 1st-move auto-abort timer while main clock stays paused',()=>{
 const open=readOnlineGame({...full,expiration:{millisToMove:28000}},{moves:'',wtime:600000,btime:600000,status:'started'},'user',Chess);
 assert.equal(firstMoveRemaining(open,5000),23000);
 assert.deepEqual(serverClock(open,5000),{w:600000,b:600000});
 const fallback=readOnlineGame(full,{moves:'e2e4',wtime:600000,btime:600000,status:'started'},'user',Chess);
 assert.equal(firstMoveRemaining(fallback,4000),26000);
});
test('analysis requires completed PGN',()=>{assert.equal(completedPgn('[Result "1-0"]\n\n1. e4 1-0',Chess),true);assert.equal(completedPgn('[Result "*"]\n\n1. e4 *',Chess),false);});
