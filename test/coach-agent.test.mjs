import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {createGameTools,runCoachAgent,MAX_TOOL_CALLS,MAX_TOOL_ROUNDS,GAME_TOOLS} from '../lib/coach-agent.mjs';
const initial=[{role:'system',content:'coach'},{role:'user',content:'why?'}];
const reply=(message,usage)=>({choices:[{message}],usage});
const call=(id,name='position_facts',args='{"ply":0,"when":"after"}')=>({id,type:'function',function:{name,arguments:args}});
function fixture(){
  const chess=new Chess(),fens=[chess.fen()],moves=['e4','e5','Nf3'];
  for(const san of moves){chess.move(san);fens.push(chess.fen());}
  const rows=moves.map((san,index)=>({index,san,color:index%2?'b':'w',loss:index*100,label:index?'неточность':null}));
  return {game:{result:'1-0',moves},rows,fens,Chess};
}
test('tools read only validated game positions; explicit bounded report coverage',()=>{
  const f=fixture(),run=createGameTools(f);
  const r=run('game_report','{"from":1,"count":12}');
  assert.deepEqual(r.data,{total:3,from:1,next:null,rows:[{ply:1,san:'e5',color:'b',lossCp:100,label:'неточность'},{ply:2,san:'Nf3',color:'w',lossCp:200,label:'неточность'}]});
  assert.equal(run('game_report','{"from":0,"count":1}').data.next,1);
  assert.equal(run('position_facts','{"ply":2,"when":"before"}').data.fen,f.fens[2]);
  assert.equal(run('position_facts','{"ply":2,"when":"after"}').data.fen,f.fens[3]);
  for(const [name,args] of [['game_report','{"from":0,"count":13}'],['game_report','{"from":-1,"count":1}'],['position_facts','{"ply":3,"when":"after"}'],['position_facts','{"ply":0,"when":"before","fen":"arbitrary"}'],['position_facts','{"ply":0,"when":"now"}'],['position_facts','null'],['position_facts','{'],['shell','{}']]){
    assert.equal(run(name,args).ok,false);
  }
  assert.equal(createGameTools({...f,game:{...f.game,result:'*'}}),null);
  assert.equal(createGameTools({...f,fens:[]}),null);
  assert.equal(createGameTools({}),null);
});
test('model may call tools then receive matched tool results and return final answer',async()=>{
  const execute=createGameTools(fixture()),seen=[];
  const r=await runCoachAgent({messages:initial,execute,request:async(messages,tools)=>{
    seen.push({messages,tools});
    if(seen.length===1)return reply({content:null,tool_calls:[call('a'),call('b','game_report','{"from":0,"count":2}')]},{prompt_tokens:20,completion_tokens:5,total_tokens:25});
    assert.deepEqual(messages.slice(0,2),initial);
    assert.deepEqual(messages.slice(2).map(m=>m.role),['assistant','tool','tool']);
    assert.equal(messages[3].tool_call_id,'a');assert.equal(messages[4].tool_call_id,'b');
    assert.equal(JSON.parse(messages[3].content).data.when,'after');
    return reply({content:'<think>x</think>Ответ'},{prompt_tokens:30,completion_tokens:5,total_tokens:35});
  }});
  assert.deepEqual(seen[0].tools,GAME_TOOLS);
  assert.deepEqual(r,{answer:'Ответ',usage:{prompt_tokens:50,completion_tokens:10,total_tokens:60}});
  assert.equal(initial.length,2);
});
test('no game uses the original single request without tools',async()=>{
  let n=0;
  const result=await runCoachAgent({messages:initial,request:async(messages,tools)=>{n++;assert.equal(tools,null);assert.deepEqual(messages,initial);return reply({content:'OK'});}});
  assert.equal(n,1);assert.equal(result.answer,'OK');
});
test('unknown tool or bad arguments return structured error for a corrective model turn',async()=>{
  let n=0;
  const result=await runCoachAgent({messages:initial,execute:createGameTools(fixture()),request:async(messages)=>{
    if(++n===1)return reply({tool_calls:[call('x','shell','{}'),call('y','game_report','bad json')]});
    assert.equal(JSON.parse(messages[3].content).ok,false);
    assert.equal(JSON.parse(messages[4].content).ok,false);
    return reply({content:'Нет данных'});
  }});
  assert.equal(result.answer,'Нет данных');
});
test('six bounded rounds then tool-free final request',async()=>{
  let n=0,executed=0;
  const r=await runCoachAgent({messages:initial,execute:()=>{executed++;return {ok:true};},request:async(messages,tools)=>{
    n++;
    if(n<=MAX_TOOL_ROUNDS){assert.ok(tools);return reply({tool_calls:[call('x'+n)]});}
    assert.equal(tools,null);assert.match(messages.at(-1).content,/Лимит/);
    return reply({content:'done'});
  }});
  assert.equal(n,MAX_TOOL_ROUNDS+1);assert.equal(executed,MAX_TOOL_CALLS);assert.equal(r.answer,'done');
});
test('oversized batch, duplicate IDs, malformed call and unavailable tool are rejected',async()=>{
  for(const [execute,calls] of [[()=>{throw Error('unexpected execution');},Array.from({length:7},(_,i)=>call('x'+i))],[()=>{throw Error('unexpected execution');},[call('x'),call('x')]],[()=>{throw Error('unexpected execution');},[{id:'x',type:'function',function:{name:'a',arguments:{}}}]],[null,[call('x')]]]){
    await assert.rejects(runCoachAgent({messages:initial,execute,request:async()=>reply({tool_calls:calls})}),/лимит|Неверный|вне разрешённого/);
  }
});
test('tool calls in forced final turn and empty answers fail rather than publishing fake success',async()=>{
  let n=0;
  await assert.rejects(runCoachAgent({messages:initial,execute:()=>({ok:true}),request:async()=>reply({tool_calls:[call('x'+(++n))]})}),/вне разрешённого/);
  assert.equal(n,MAX_TOOL_CALLS+1);
  await assert.rejects(runCoachAgent({messages:initial,request:async()=>reply({content:'<think>x</think>'})}),/Пустой ответ/);
});

test('stockfish_move exposes only the stored verified line for a bounded completed-game ply',()=>{
  const f=fixture(),line={bestUci:'d2d4',bestSan:'d4',pvUci:['d2d4','d7d5'],pvSan:['d4','d5'],depth:12,source:'pv'};
  const run=createGameTools({...f,searchLines:[line,null,null]});
  assert.deepEqual(run('stockfish_move','{"ply":0}'),{ok:true,data:{ply:0,when:'before',fen:f.fens[0],color:'w',actualSan:'e4',lossCp:0,...line}});
  for(const args of ['{"ply":1}','{"ply":3}','{"ply":-1}','{"ply":0,"depth":99}','{"ply":0,"fen":"arbitrary"}'])assert.equal(run('stockfish_move',args).ok,false);
  assert.equal(createGameTools(f)('stockfish_move','{"ply":0}').ok,false);
});
