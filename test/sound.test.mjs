import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {soundForMove,readSoundEnabled,saveSoundEnabled,isSoundEnabled} from '../public/sound.js';

function memoryStorage(){
 const map=new Map();
 return {
  getItem(k){return map.has(k)?map.get(k):null;},
  setItem(k,v){map.set(k,String(v));}
 };
}

test('soundForMove classifies ordinary moves, captures, castles, promotions, checks and game over',()=>{
 const g=new Chess();
 assert.equal(soundForMove(g.move('e4'),g),'move');
 assert.equal(soundForMove(g.move('d5'),g),'move');
 assert.equal(soundForMove(g.move('exd5'),g),'capture');

 // Castling
 const castleGame=new Chess('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
 assert.equal(soundForMove(castleGame.move('O-O'),castleGame),'castle');

 // Promotion (non-checking)
 const promoGame=new Chess('8/P7/7k/8/8/8/8/4K3 w - - 0 1');
 assert.equal(soundForMove(promoGame.move({from:'a7',to:'a8',promotion:'q'}),promoGame),'promote');

 // Check
 const checkGame=new Chess('4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1');
 assert.equal(soundForMove(checkGame.move('Qe6+'),checkGame),'check');

 // Checkmate -> end
 const mateGame=new Chess('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
 assert.equal(soundForMove(mateGame.move('Qxf7#'),mateGame),'end');
});

test('sound preference defaults to enabled and persists in storage',()=>{
 const st=memoryStorage();
 assert.equal(readSoundEnabled(st),true);
 assert.equal(saveSoundEnabled(false,st),true);
 assert.equal(isSoundEnabled(),false);
 assert.equal(readSoundEnabled(st),false);
 assert.equal(saveSoundEnabled(true,st),true);
 assert.equal(isSoundEnabled(),true);
 assert.equal(readSoundEnabled(st),true);
});
