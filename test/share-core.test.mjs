import test from 'node:test';import assert from 'node:assert/strict';import {Chess} from 'chess.js';import {sharedInput,validatedSharedPgn} from '../public/share-core.js';
const pgn='[Event "Test"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 1-0';
test('shared URL normalization is restricted to public game IDs',()=>{
 assert.deepEqual(sharedInput('Look https://lichess.org/AbCd1234abcd/black#25'),{type:'lichess',gameId:'AbCd1234'});
 assert.deepEqual(sharedInput('https://www.chess.com/analysis/game/live/1234?tab=review'),{type:'chesscom',kind:'live',gameId:'1234'});
 for(const u of ['https://lichess.org.evil.com/AbCd1234','https://lichess.org@evil.com/AbCd1234','http://lichess.org/AbCd1234','https://chess.com/game/live/abc','https://lichess.org/study/AbCd1234'])assert.throws(()=>sharedInput(u));
 assert.equal(sharedInput('[Site "https://lichess.org/AbCd1234"]\n'+pgn).type,'pgn');
});
test('only finished legal standard PGNs, mixed files skip invalid games',()=>{
 assert.equal(validatedSharedPgn(pgn,Chess).count,1);
 assert.throws(()=>validatedSharedPgn(pgn.replaceAll('1-0','*'),Chess));
 assert.throws(()=>validatedSharedPgn(pgn.replace('e4 e5','e5 e4'),Chess));
 const mixed=validatedSharedPgn(pgn+'\n\n'+pgn.replaceAll('1-0','*'),Chess);assert.equal(mixed.count,1);assert.equal(mixed.skipped,1);
});
