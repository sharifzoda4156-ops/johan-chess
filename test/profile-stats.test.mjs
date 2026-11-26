import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {profileStats} from '../public/profile-stats.js';
test('profile scopes training to nick and scores from the player perspective',()=>{
 const games=[{user:'Johan',color:'b',result:'0-1'},{user:'JOHAN',color:'w',result:'0-1'},{user:'johan',color:'w',result:'1/2-1/2'},{user:'other',color:'w',result:'1-0'},{user:'Johan',pgn:'[White "Stockfish"]\n[Black "Johan"]\n[Result "0-1"]\n\n1. e4 e5 0-1',result:'0-1'}];
 assert.deepEqual(profileStats(games,[{color:'w',accuracy:80},{color:'b',accuracy:60},{color:'w',accuracy:null}], 'johan',Chess),{played:4,wins:2,losses:1,draws:1,reviewed:3,accuracy:70});
 assert.equal(profileStats([],[],'johan',Chess).accuracy,null);
});
