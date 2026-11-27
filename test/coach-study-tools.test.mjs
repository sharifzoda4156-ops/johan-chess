import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {readFile} from 'node:fs/promises';
import {createStudyTools,combineCoachTools,STUDY_TOOLS} from '../lib/coach-study-tools.mjs';
import {GAME_TOOLS,runCoachAgent} from '../lib/coach-agent.mjs';

const root=new URL('../public/',import.meta.url);
const read=p=>readFile(new URL(p,root),'utf8');
test('real opening library: ECO and name searches return legal SAN, bounded results, lazy cache',async()=>{
  let reads=0;
  const run=createStudyTools({Chess,readText:async p=>{reads++;return read(p);}});
  const a=await run('opening_search','{"query":"B20"}');
  assert.equal(a.ok,true,a.error);
  assert.ok(a.data.results.length>0&&a.data.results.length<=8);
  for(const r of a.data.results){
    assert.equal(r.eco,'B20');
    const c=new Chess();for(const san of r.moves)assert.ok(c.move(san,{strict:true}));
  }
  const b=await run('opening_search','{"query":"Sicilian Defense"}');
  assert.equal(b.ok,true,b.error);assert.ok(b.data.results.length>0);
  assert.equal(reads,5);
  assert.deepEqual((await run('opening_search','{"query":"zz-no-such-opening-zz"}')).data.results,[]);
});
test('real starter puzzles: correct filters, actual IDs, no moves or FEN, lazy cache',async()=>{
  let reads=0;
  const run=createStudyTools({Chess,readText:async p=>{reads++;return read(p);}});
  const a=await run('puzzle_search','{"theme":"pin","min":1000,"max":2500}');
  assert.equal(a.ok,true,a.error);assert.ok(a.data.results.length>0&&a.data.results.length<=8);
  const source=JSON.parse(await read('lichess-puzzles.json'));
  for(const r of a.data.results){
    const actual=source.puzzles.find(p=>p.id===r.id);
    assert.ok(actual);assert.equal(r.rating,actual.rating);assert.ok(r.rating>=1000&&r.rating<=2500);
    assert.ok(r.themes.includes('pin'));assert.equal(r.url,'https://lichess.org/training/'+r.id);
    assert.deepEqual(Object.keys(r).sort(),['id','rating','themes','url']);
  }
  assert.deepEqual((await run('puzzle_search','{"theme":"zzNoSuchTheme","min":0,"max":9999}')).data.results,[]);
  assert.equal(reads,1);
});
test('invalid arguments and unknown tools do not read files',async()=>{
  let reads=0;
  const run=createStudyTools({Chess,readText:async()=>{reads++;throw Error('unexpected read');}});
  for(const [name,args] of [
    ['opening_search','{"query":" "}'],['opening_search','{"query":"e4","path":"secret"}'],
    ['opening_search','{"query":12}'],['puzzle_search','{"theme":"all","min":2000,"max":1000}'],
    ['puzzle_search','{"theme":"../","min":0,"max":1000}'],['puzzle_search','{"theme":"all","min":0.1,"max":1000}'],
    ['puzzle_search','{"theme":"all","min":0,"max":10000}'],['puzzle_search','{"theme":"all","min":0,"max":1000,"limit":100}'],
    ['puzzle_search','null'],['shell','{}']
  ])assert.equal((await run(name,args)).ok,false);
  assert.equal(reads,0);
});
test('corrupt puzzle license or unavailable source produces explicit error, not fabricated matches',async()=>{
  for(const readText of [async()=>JSON.stringify({license:'unknown',puzzles:[]}),async()=>{throw Error('missing');}]){
    const run=createStudyTools({Chess,readText});
    assert.equal((await run('puzzle_search','{"theme":"all","min":0,"max":9999}')).ok,false);
  }
});
test('study-only agent cannot access game positions, and uses same bounded function loop',async()=>{
  const {execute,schemas}=combineCoachTools(null,createStudyTools({Chess}),GAME_TOOLS);
  assert.deepEqual(schemas,STUDY_TOOLS);
  assert.equal((await execute('stockfish_move','{"ply":0}')).ok,false);
  let n=0;
  const response=await runCoachAgent({messages:[{role:'user',content:'Дай задачи'}],execute,schemas,request:async(messages,tools)=>{
    assert.deepEqual(tools,STUDY_TOOLS);
    if(++n===1)return {choices:[{message:{tool_calls:[{id:'s1',type:'function',function:{name:'puzzle_search',arguments:'{"theme":"pin","min":0,"max":9999}'}}]}}]};
    const tool=messages.find(m=>m.role==='tool');assert.ok(JSON.parse(tool.content).data.results.length);
    return {choices:[{message:{content:'Задачи найдены'}}]};
  }});
  assert.equal(response.answer,'Задачи найдены');assert.equal(n,2);
});
test('combined tool registry routes exactly to the selected tool, with no fallback access',async()=>{
  const seen=[];
  const game=(name,args)=>{seen.push(['game',name,args]);return {ok:true};};
  const study=(name,args)=>{seen.push(['study',name,args]);return {ok:true};};
  const {execute,schemas}=combineCoachTools(game,study,GAME_TOOLS);
  assert.deepEqual(schemas,[...GAME_TOOLS,...STUDY_TOOLS]);
  await execute('position_facts','{}');await execute('opening_search','{}');
  assert.equal((await execute('shell','{}')).ok,false);
  assert.deepEqual(seen,[['game','position_facts','{}'],['study','opening_search','{}']]);
});
