import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {boardSnapshots,splitBoardReply} from '../public/study-positions.js';
test('boards derive from real PGN and reject fabricated indices or illegal engine moves',()=>{
 const fen=new Chess().fen(),g={startFen:fen,color:'w',moves:['e4','e5','Nf3'],analysis:[{index:0,san:'e4',color:'w',best:'d2d4'},{index:1,san:'e5',color:'b',best:'e8e1'},{index:2,san:'Nf3',color:'w',best:'g1f3'}]};
 const s=boardSnapshots(g,Chess);assert.equal(s.size,2);assert.equal(s.get(0).fen,fen);assert.equal(s.get(0).best.san,'d4');assert.equal(s.has(1),false);
 const parts=splitBoardReply('Ошибка\n[[board:0]]\n[[board:99]]\n[[board:0]]\n[[board:2]]',s);
 assert.equal(parts.filter(p=>p.type==='board').length,2);
 assert.equal(parts[0].text,'Ошибка');
});
test('marker cannot render without supplied position data',()=>assert.deepEqual(splitBoardReply('[[board:1]]',new Map()),[]));
