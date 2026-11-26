import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {displayName,profileStats} from '../public/profile-core.js';
test('display name only from connected identity, with nickname fallback',()=>{
 assert.equal(displayName({connected:true,name:'  Alice  '},'Johan'),'Alice');
 assert.equal(displayName({connected:false,name:'Alice'},'Johan'),'Johan');
 assert.equal(displayName({connected:true,email:'secret@example.com'},'Johan'),'Johan');
});
test('local stats respect player color, invalid PGN and separate users',()=>{
 const pgn=(white,black,result)=>'[White "'+white+'"]\n[Black "'+black+'"]\n[Result "'+result+'"]\n\n1. e4 '+result;
 const rows=[{user:'Johan',pgn:pgn('Johan','Stockfish 3','1-0')},{user:'Johan',pgn:pgn('Stockfish 3','Johan','1-0')},{user:'Johan',pgn:pgn('Stockfish 3','Johan','1/2-1/2')},{user:'Other',pgn:pgn('Other','Stockfish 3','1-0')}];
 assert.deepEqual(profileStats(rows,[{color:'w',accuracy:80},{color:'b',accuracy:60}],'johan',Chess),{played:3,wins:1,losses:1,draws:1,reviewed:2,accuracy:70});
 assert.equal(profileStats([],[],'johan',Chess).accuracy,null);
});
