import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeScreen,parentTab} from '../public/navigation.js';
test('home, puzzles and study with play and review as child screens',()=>{
 for(const screen of ['home','puzzles','review','coach','profile','play','unknown'])assert.equal(normalizeScreen(screen,true),'play');
 for(const screen of ['home','puzzles','review','coach','profile','play'])assert.equal(normalizeScreen(screen,false),screen);
 assert.equal(normalizeScreen('unknown',false),'home');assert.equal(parentTab('review'),'home');assert.equal(parentTab('play'),'home');assert.equal(parentTab('coach'),'coach');assert.equal(parentTab('profile'),'profile');assert.equal(parentTab('library'),'coach');assert.equal(normalizeScreen('library',false),'library');assert.equal(normalizeScreen('library',true),'play');
});

test('online is a home child screen',()=>{assert.equal(normalizeScreen('online',false),'online');assert.equal(parentTab('online'),'home');});

test('account settings is a profile child and cannot bypass play lock',()=>{assert.equal(normalizeScreen('account',false),'account');assert.equal(parentTab('account'),'profile');assert.equal(normalizeScreen('account',true),'play');});

test('rush is a puzzles child and cannot bypass play lock',()=>{assert.equal(normalizeScreen('rush',false),'rush');assert.equal(parentTab('rush'),'puzzles');assert.equal(normalizeScreen('rush',true),'play');});
