import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {resolveBoards} from '../public/coach-board-core.js';
const make=()=>{const c=new Chess();return {result:'1-0',startFen:c.fen(),color:'w',moves:['e4','e5'],analysis:[{index:0,move:'e2e4',best:'d2d4',label:'Неточность'},{index:1,move:'e7e5',best:'c7c5'}]}};
test('board marker resolves from actual position, played and best are legal',()=>{
 const g=make(),parts=resolveBoards('Ошибка\n[[board:0]]\nДальше',g,Chess),b=parts[1].board;
 assert.equal(parts[0].text,'Ошибка\n');assert.equal(b.fen,g.startFen);assert.equal(b.played.san,'e4');assert.equal(b.best.san,'d4');assert.equal(new Chess(b.played.fen).get('e4').type,'p');assert.equal(parts[2].text,'\nДальше');
});
test('unknown, inconsistent, unfinished or absent analysis never renders a board',()=>{
 for(const [answer,g] of [['[[board:99]]',make()],['[[board:0]]',null],['[[board:0]]',{...make(),result:'*'}],['[[board:0]]',{...make(),analysis:[{index:0,move:'d2d4',best:'e2e4'}]}]])assert.equal(resolveBoards(answer,g,Chess)[0].text,'[Позиция недоступна]');
});
test('references after black move use exact prior history and orientation',()=>{
 const g=make();g.color='b';const b=resolveBoards('[[board:1]]',g,Chess)[0].board;assert.equal(b.label,'1... e5');assert.equal(b.orientation,'b');assert.equal(new Chess(b.fen).get('e4').color,'w');
});
test('at most three cards; plain text survives',()=>{
 assert.equal(resolveBoards('Обычный ответ',null,Chess)[0].text,'Обычный ответ');
 assert.equal(resolveBoards('[[board:0]][[board:0]][[board:0]][[board:0]]',make(),Chess).filter(p=>p.board).length,3);
});

test('historical board is explicitly distinct from the student move',()=>{
 const g={...make(),source:'historical',color:null};const b=resolveBoards('[[board:0]]',g,Chess)[0].board;assert.equal(b.historical,true);assert.equal(b.played.san,'e4');assert.equal(resolveBoards('[[board:0]]',make(),Chess)[0].board.historical,false);
});
