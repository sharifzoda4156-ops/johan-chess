import {test} from 'node:test';import assert from 'node:assert/strict';import {evaluateMove,winChance,scoreValue,parseInfo} from '../public/metrics.js';
const cp=value=>({kind:'cp',value}),mate=value=>({kind:'mate',value});
test('best move accuracy',()=>{assert.equal(evaluateMove(cp(50),cp(50),true).accuracy,100)});
test('large loss is blunder',()=>{assert.equal(evaluateMove(cp(100),cp(-500)).label,'Грубая ошибка')});
test('winning position remains winning',()=>{assert.ok(evaluateMove(cp(1500),cp(1000)).loss<3)});
test('mate sign',()=>{assert.equal(winChance(mate(1)),100);assert.equal(winChance(mate(-1)),0);assert.ok(scoreValue(mate(1))>scoreValue(mate(3)))});
test('UCI exact score only',()=>{assert.equal(parseInfo('info depth 10 score cp 22 upperbound pv e2e4'),null);assert.deepEqual(parseInfo('info depth 13 score mate -3 nodes 200 pv e2e4 e7e5'),{score:mate(-3),depth:13,pv:['e2e4','e7e5']})});
