import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {findKingSquare,materialState,materialText} from '../public/material.js';

test('findKingSquare locates white and black kings accurately',()=>{
 const g=new Chess();
 assert.equal(findKingSquare(g.board(),'w'),'e1');
 assert.equal(findKingSquare(g.board(),'b'),'e8');
 assert.equal(findKingSquare(null,'w'),null);
 assert.equal(findKingSquare(g.board(),'x'),null);
 g.load('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4');
 assert.equal(findKingSquare(g.board(),'w'),'g1');
 assert.equal(findKingSquare(g.board(),'b'),'e8');
});

test('materialState starts balanced and tracks captures and advantage',()=>{
 const g=new Chess();
 const start=materialState(g.board());
 assert.deepEqual(start.captured,{w:[],b:[]});
 assert.deepEqual(start.advantage,{w:0,b:0});
 assert.equal(materialText(start.captured.w,start.advantage.w),'');

 // White captures Black queen and pawn; Black captures White knight
 g.load('rnb1kbnr/pppp1ppp/8/8/8/8/PPPPPPPP/R1BQKBNR w KQkq - 0 1');
 const m=materialState(g.board());
 assert.deepEqual(m.captured.w,['q','p']);
 assert.deepEqual(m.captured.b,['n']);
 assert.deepEqual(m.advantage,{w:7,b:0});
 assert.equal(materialText(m.captured.w,m.advantage.w),'♛♟ +7');
 assert.equal(materialText(m.captured.b,m.advantage.b),'♞');
});

test('materialState handles promotions without negative captured counts',()=>{
 const g=new Chess('4k3/8/8/8/8/8/8/Q2QK3 w - - 0 1');
 const m=materialState(g.board());
 // Black has no pieces except king -> White captured all Black starting pieces
 assert.equal(m.captured.w.length,15);
 // White has 2 queens (more than starting 1) -> Black captured 0 queens
 assert.equal(m.captured.b.includes('q'),false);
 assert.equal(m.advantage.w,18);
});
