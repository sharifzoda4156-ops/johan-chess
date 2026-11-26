import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {displayName,profileStats} from '../public/profile-core.js';
test('profile name comes from connected account, not stale logged out data',()=>{
 assert.equal(displayName({connected:true,name:'  Test Name  '},'Johan'),'Test Name');
 assert.equal(displayName({connected:true,name:''},'Johan'),'Johan');
 assert.equal(displayName({connected:false,name:'Old Name'},'Johan'),'Johan');
});
const game=(white,black,result)=>({user:'Johan',pgn:'[White "'+white+'"]\n[Black "'+black+'"]\n[Result "'+result+'"]\n\n1. e4 e5 '+result});
test('profile totals use own color, actual saved results and valid accuracy',()=>{
 const rows=[game('Johan','Stockfish','1-0'),game('Stockfish','Johan','0-1'),game('Johan','Stockfish','0-1'),game('Stockfish','Johan','1/2-1/2'),{...game('Johan','Stockfish','1-0'),user:'Other'}];
 assert.deepEqual(profileStats(rows,[{color:'w',accuracy:80},{color:'b',accuracy:60},{color:'w',accuracy:null}], 'johan',Chess),{played:4,wins:2,losses:1,draws:1,reviewed:3,accuracy:70});
});
