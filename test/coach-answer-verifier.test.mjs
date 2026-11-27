import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {createAnswerVerifier} from '../lib/coach-answer-verifier.mjs';
import {runCoachAgent} from '../lib/coach-agent.mjs';
function fixture(fen,moves=['e4','e5','Nf3']){
  const c=new Chess(fen),fens=[c.fen()];
  for(const san of moves){c.move(san);fens.push(c.fen());}
  return {game:{result:'1-0',moves},fens,Chess};
}
const pv=(f,moves=['d4','d5'])=>({ok:true,data:{ply:0,fen:f.fens[0],pvSan:moves,bestSan:moves[0]}});
test('played and returned PV references expand to canonical numbered SAN',()=>{
  const f=fixture(),v=createAnswerVerifier(f);
  assert.equal(v.verify('Лучше [[pv:0]]').ok,false);
  assert.equal(v.record('stockfish_move',pv(f)).data.lineRef,'[[pv:0]]');
  assert.deepEqual(v.verify('Сыграно [[played:1]], лучше [[pv:0]].'),{ok:true,answer:'Сыграно 1... e5, лучше 1. d4 d5.'});
  assert.equal(v.verify('[[played:3]]').ok,false);
  assert.equal(v.verify('[[pv:00]]').ok,false);
  assert.equal(v.verify('[[PV:0]]').ok,false);
});
test('wrong FEN, illegal continuations, failed tools and wrong first SAN cannot register a PV',()=>{
  const f=fixture(),v=createAnswerVerifier(f);
  for(const result of [pv(f,['d4','d5','Qh5']),pv(f,['e5']),{ok:false,data:pv(f).data},{ok:true,data:{...pv(f).data,fen:f.fens[1]}},{ok:true,data:{...pv(f).data,bestSan:'e4'}}]){
    assert.equal(v.record('stockfish_move',result).data?.lineRef,undefined);
    assert.equal(v.verify('[[pv:0]]').ok,false);
  }
});
test('opening references are scoped to successful returned legal lines and are available without a game',()=>{
  const v=createAnswerVerifier({Chess});
  const result=v.record('opening_search',{ok:true,data:{results:[{moves:['e4','c5']},{moves:['e5']},{moves:['d4','d5','c4']}]}});
  assert.equal(result.data.results[0].lineRef,'[[opening:0]]');
  assert.equal(result.data.results[1].lineRef,undefined);
  assert.equal(result.data.results[2].lineRef,'[[opening:1]]');
  assert.deepEqual(v.verify('Дебют: [[opening:1]].'),{ok:true,answer:'Дебют: 1. d4 d5 2. c4.'});
  assert.equal(v.verify('[[played:0]]').ok,false);
  assert.equal(v.verify('[[opening:2]]').ok,false);
});
test('raw explicit SAN/UCI, numbered pawn moves and Russian notation are rejected, positional prose allowed',()=>{
  const v=createAnswerVerifier(fixture());
  for(const a of ['Лучше Qh5','Nbd2','R1e2','exd5','e8=Q+','O-O-O','e2e4','1. e4','2... d5','ход e4','сыграть **e4**','Кf3','Лe1','e4+'])assert.equal(v.verify(a).ok,false,a);
  for(const a of ['Контролируй поле e4.','Слабость на d5 и c6.','Дебют B20.','Рейтинг 1500.','См. [[board:0]].'])assert.deepEqual(v.verify(a),{ok:true,answer:a});
  assert.equal(v.verify('[[played:0]] '.repeat(13)).ok,false);
});
test('custom FEN move numbers, promotion and black turn are preserved',()=>{
  const f=fixture('7k/8/8/8/8/8/p7/7K b - - 0 42',['a1=Q+']);
  assert.deepEqual(createAnswerVerifier(f).verify('[[played:0]]'),{ok:true,answer:'42... a1=Q+'});
});
test('agent gets exactly one correction and never publishes invalid candidate on failure',async()=>{
  const v=createAnswerVerifier(fixture()),seen=[];
  const response=await runCoachAgent({messages:[{role:'user',content:'Почему?'}],verifyAnswer:v.verify,request:async messages=>{
    seen.push(messages);
    return {choices:[{message:{content:seen.length===1?'Qh5':'Сыграно [[played:0]]'}}],usage:{total_tokens:10}};
  }});
  assert.equal(response.answer,'Сыграно 1. e4');assert.equal(response.usage.total_tokens,20);
  assert.match(seen[1].at(-1).content,/не прошёл проверку/);
  let n=0;
  await assert.rejects(runCoachAgent({messages:[],verifyAnswer:v.verify,request:async()=>{n++;return {choices:[{message:{content:'Qh5'}}]};}}),/Не удалось проверить/);
  assert.equal(n,2);
});
