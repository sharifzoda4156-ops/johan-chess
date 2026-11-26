import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {normalizePgn,splitPgn,buildPgn} from '../public/pgn.js';

const G1='[Event "A"]\n[White "W1"]\n[Black "B1"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0';
const G2='[Event "B"]\n[White "W2"]\n[Black "B2"]\n[Result "*"]\n\n1. d4 d5 *';
const hist=pgn=>{const c=new Chess();c.loadPgn(pgn);return c;};
const sc=(kind,value)=>({kind,value});
function fake(c){
  const moves=c.history({verbose:true});
  const results=moves.map((m,i)=>({color:m.color,loss:[0,6,12,25][i]||0,bestSan:'Nf3',playedScore:[sc('cp',30),sc('cp',30),sc('mate',3),sc('cp',-45)][i]}));
  return {moves,results};
}
test('normalize strips BOM, NUL and CRLF',()=>{
  assert.equal(normalizePgn('\uFEFF  [A "b"]\r\n\0\r\n1. e4\r'),'[A "b"]\n\n1. e4');
});
test('split games',()=>{
  const parts=splitPgn('\uFEFF'+G1.replace(/\n/g,'\r\n')+'\r\n\r\n'+G2);
  assert.equal(parts.length,2);assert.equal(parts[0],G1);assert.equal(parts[1],G2);
  assert.equal(splitPgn(G1).length,1);
});
test('round-trip without analysis',()=>{
  const c=hist(G1),out=buildPgn({headers:c.getHeaders(),moves:c.history({verbose:true}),results:[],depth:10});
  assert.ok(!out.includes('Annotator'));
  assert.deepEqual(hist(out).history(),c.history());
});
test('round-trip with analysis, eval format and marks',()=>{
  const c=hist(G1),{moves,results}=fake(c);
  const out=buildPgn({headers:c.getHeaders(),moves,results,depth:12});
  assert.match(out,/\[Annotator "Johan Chess \(Stockfish, depth 12\)"\]/);
  assert.match(out,/e4 \{\[%eval 0\.30\]\}/);
  assert.match(out,/e5\?! \{\[%eval -0\.30\] Best: Nf3\}/);
  assert.match(out,/2\. Nf3\? \{\[%eval #3\] Best: Nf3\}/);
  assert.match(out,/Nc6\?\? \{\[%eval 0\.45\] Best: Nf3\}/);
  assert.match(out,/1\.\.\. e5/);assert.match(out,/2\.\.\. Nc6/);
  const back=hist(out);
  assert.deepEqual(back.history(),c.history());
  assert.equal(back.getHeaders().Annotator,'Johan Chess (Stockfish, depth 12)');
  assert.match(back.getComments()[0].comment,/%eval/);
});
test('black mate eval is negated',()=>{
  const c=hist(G1),{moves}=fake(c);
  const out=buildPgn({headers:{},moves:[moves[1]],results:[{color:'b',loss:0,playedScore:sc('mate',2)}],depth:5});
  assert.match(out,/\[%eval #-2\]/);
});
