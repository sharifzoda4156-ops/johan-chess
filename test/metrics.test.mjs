import {test} from 'node:test';import assert from 'node:assert/strict';import {Chess} from 'chess.js';import {evaluateMove,winChance,scoreValue,parseInfo,parseMultiInfo,classifyMove,isSacrificeMove,estimateGameRating} from '../public/metrics.js';
const cp=value=>({kind:'cp',value}),mate=value=>({kind:'mate',value});
test('best move accuracy',()=>{assert.equal(evaluateMove(cp(50),cp(50),true).accuracy,100)});
test('large loss is blunder',()=>{assert.equal(evaluateMove(cp(100),cp(-500)).label,'Грубая ошибка')});
test('winning position remains winning',()=>{assert.ok(evaluateMove(cp(1500),cp(1000)).loss<3)});
test('mate sign',()=>{assert.equal(winChance(mate(1)),100);assert.equal(winChance(mate(-1)),0);assert.ok(scoreValue(mate(1))>scoreValue(mate(3)))});
test('UCI exact score only',()=>{assert.equal(parseInfo('info depth 10 score cp 22 upperbound pv e2e4'),null);assert.deepEqual(parseInfo('info depth 13 score mate -3 nodes 200 pv e2e4 e7e5'),{score:mate(-3),depth:13,pv:['e2e4','e7e5']})});
test('parseMultiInfo extracts multipv index while preserving exact-score filtering',()=>{
 assert.equal(parseMultiInfo('info depth 10 multipv 2 score cp 15 lowerbound pv g1f3'),null);
 assert.deepEqual(parseMultiInfo('info depth 12 multipv 2 score cp -45 pv d2d4 d7d5'),{score:cp(-45),depth:12,pv:['d2d4','d7d5'],multipv:2});
 assert.equal(parseMultiInfo('info depth 12 score cp 30 pv e2e4').multipv,1);
});
test('classifyMove distinguishes book, brilliant, great, best, miss and blunder',()=>{
 assert.equal(classifyMove({best:cp(30),actual:cp(25),isBook:true}).kind,'book');
 assert.equal(classifyMove({best:cp(260),actual:cp(260),second:cp(20),isBest:true,isSacrifice:true}).kind,'brilliant');
 assert.equal(classifyMove({best:cp(260),actual:cp(260),second:cp(20),isBest:true,isSacrifice:true}).symbol,'!!');
 assert.equal(classifyMove({best:cp(240),actual:cp(240),second:cp(-20),isBest:true,isSacrifice:false}).kind,'great');
 assert.equal(classifyMove({best:cp(40),actual:cp(40),second:cp(35),isBest:true}).kind,'best');
 assert.equal(classifyMove({best:cp(300),actual:cp(15),isBest:false}).kind,'miss');
 assert.equal(classifyMove({best:cp(80),actual:cp(-450),isBest:false}).kind,'blunder');
});
test('isSacrificeMove detects genuine piece sacrifices and rejects normal captures',()=>{
 // Legal's Mate queen sacrifice 5. Nxe5 (offering Qd1 to Bg4)
 const legalGame=new Chess();
 for(const m of ['e4','e5','Nf3','d6','Bc4','Bg4','Nc3','g6'])legalGame.move(m);
 const beforeLegal=legalGame.fen();
 const sacMove=legalGame.move('Nxe5');
 assert.equal(isSacrificeMove({beforeFen:beforeLegal,move:sacMove,pv:['f3e5','g4d1','c4f7','e8e7'],Chess}),true);
 // Ordinary central pawn capture 2. exd5 in Scandinavian is NOT a sacrifice
 const scand=new Chess();
 for(const m of ['e4','d5'])scand.move(m);
 const beforeScand=scand.fen();
 const ordinary=scand.move('exd5');
 assert.equal(isSacrificeMove({beforeFen:beforeScand,move:ordinary,pv:['e4d5','d8d5'],Chess}),false);
});
test('estimateGameRating maps accuracy monotonically within chess ELO range',()=>{
 const low=estimateGameRating(45,-1),mid=estimateGameRating(75,0),high=estimateGameRating(96,1);
 assert.ok(low>=400&&low<mid&&mid<high&&high<=2900);
 assert.equal(estimateGameRating(NaN),null);
});

