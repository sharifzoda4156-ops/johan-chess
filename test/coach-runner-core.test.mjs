import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {decodePayload,parseScore,classify,criticalMoments,buildMessages,cleanAnswer,criticalPositionFacts} from '../lib/coach-runner-core.mjs';
const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64');

test('decodePayload validates and trims',()=>{
  const p=decodePayload(enc({question:'  Привет ',history:[{role:'user',content:'a'},{role:'system',content:'x'}],game:{moves:['e4','e5'],result:'1-0',color:'w'}}));
  assert.equal(p.question,'Привет');assert.equal(p.history.length,1);assert.equal(p.game.moves.length,2);assert.equal(p.game.color,'w');
  assert.throws(()=>decodePayload(''));assert.throws(()=>decodePayload('###'));assert.throws(()=>decodePayload(enc({question:' '})));
  assert.equal(decodePayload(enc({question:'q',game:{moves:[1]}})).game,null);
});
test('parseScore handles cp and mate',()=>{
  assert.equal(parseScore('info depth 5 score cp 34 nodes 1'),34);
  assert.equal(parseScore('info score cp 99999'),2000);
  assert.ok(parseScore('info score mate 3')>1900);assert.ok(parseScore('info score mate -2')<-1900);
  assert.equal(parseScore('info string x'),null);
});
test('classify computes loss from consecutive evals',()=>{
  // e0=+20 (white), white plays blunder: black now sees +400 => loss 420
  const rows=classify([20,400,-390],['Qh5','Nc6'],'w');
  assert.equal(rows[0].loss,420);assert.equal(rows[0].label,'грубая ошибка');assert.equal(rows[0].color,'w');
  assert.equal(rows[1].color,'b');assert.equal(rows[1].loss,10);assert.equal(rows[1].label,null);
  assert.equal(criticalMoments(rows).length,1);assert.equal(criticalMoments(rows,6,'b').length,0);
});
test('buildMessages includes stockfish facts only',()=>{
  const p=decodePayload(enc({question:'Что не так?',game:{white:'A',black:'B',moves:['e4','e5'],result:'1-0',color:'w'},profile:{goal:'1500'}}));
  const m=buildMessages(p,[{index:0,moveNo:1,color:'w',san:'e4',loss:200,label:'ошибка'}]);
  assert.equal(m[0].role,'system');assert.match(m[0].content,/1500/);assert.match(m[0].content,/1\. e4 e5/);assert.match(m[0].content,/−2\.0/);
  assert.equal(m.at(-1).content,'Что не так?');
});
test('cleanAnswer strips think blocks',()=>assert.equal(cleanAnswer('<think>x</think> Ответ'),'Ответ'));

test('runner includes bounded facts only for selected critical moments, before and after the actual move',()=>{
  const chess=new Chess(),fens=[chess.fen()],moves=['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6'];
  for(const san of moves){chess.move(san);fens.push(chess.fen());}
  const rows=moves.map((san,index)=>({index,san,color:index%2?'b':'w',loss:100+index,label:'ошибка'}));
  const facts=criticalPositionFacts(rows,fens,'w',Chess);
  assert.deepEqual(facts.map(f=>f.ply),[2,4,6]);
  for(const f of facts){assert.equal(f.before.fen,fens[f.ply]);assert.equal(f.after.fen,fens[f.ply+1]);}
  const payload=decodePayload(enc({question:'Объясни',game:{moves,result:'1-0',color:'w'}}));
  assert.ok(buildMessages(payload,rows,facts)[0].content.includes(JSON.stringify(facts)));
  assert.ok(!buildMessages(payload,rows)[0].content.includes('Факты позиции:'));
  assert.deepEqual(criticalPositionFacts([],fens,'w',Chess),[]);
});
