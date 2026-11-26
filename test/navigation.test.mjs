import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScreen} from '../public/navigation.js';
test('navigation locks to play for every active game',()=>{
 for(const screen of ['review','coach','play','unknown'])assert.equal(normalizeScreen(screen,true),'play');
 assert.equal(normalizeScreen('review',false),'review');assert.equal(normalizeScreen('coach',false),'coach');assert.equal(normalizeScreen('unknown',false),'play');
});
