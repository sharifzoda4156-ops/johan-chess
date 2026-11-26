import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {earnedAchievements,achievementCards} from '../public/achievement-core.js';
const game=(moves,color='b',source='chesscom',result='0-1',extra='')=>({pgn:'[White "White"]\n[Black "Black"]\n[WhiteElo "1600"]\n[BlackElo "1000"]\n[Result "'+result+'"]\n'+extra+'\n'+moves+' '+result,color,source});
test('source IDs: fool mate, own color and rating rules',()=>{
 const row=game('1. f3 e5 2. g4 Qh4#');
 assert.deepEqual(earnedAchievements([row],Chess),[1,2,4,19,20,21,30,31,37]);
 assert.deepEqual(earnedAchievements([{...row,color:'w'}],Chess),[1]);
 assert.deepEqual(earnedAchievements([{...row,source:'training'}],Chess),[1,19,20,21,31,37]);
});
test('long castle and en passant detected only for acting player',()=>{
 const ep=game('1. e4 a6 2. e5 d5 3. exd6','w','training','1-0');
 assert.ok(earnedAchievements([ep],Chess).includes(26));
 assert.ok(!earnedAchievements([{...ep,color:'b'}],Chess).includes(26));
 const castle=game('1. d4 d5 2. Nc3 Nc6 3. Bf4 Bf5 4. Qd2 Qd7 5. O-O-O','w','training','1-0');
 assert.ok(earnedAchievements([castle],Chess).includes(23));
});
test('exclude setup positions and unfinished games; retain valid previously earned IDs',()=>{
 const setup=game('1. e8=Q+','w','training','1-0','[SetUp "1"]\n[FEN "k7/4P3/8/8/8/8/8/7K w - - 0 1"]\n');
 assert.deepEqual(earnedAchievements([setup,game('1. e4','w','training','*')],Chess,[37,999,'1']),[37]);
 assert.equal(achievementCards([]).length,18);
 assert.equal(achievementCards([37]).filter(a=>a.earned).length,1);
});
