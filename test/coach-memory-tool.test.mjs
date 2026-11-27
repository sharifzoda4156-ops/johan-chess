import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {createMemoryTool,MEMORY_TOOL} from '../lib/coach-memory-tool.mjs';
import {runCoachAgent} from '../lib/coach-agent.mjs';
import {decodePayload} from '../lib/coach-runner-core.mjs';
import {normalizeMemory,createMemoryUpdate} from '../public/coach-memory.js';
const encode=p=>Buffer.from(JSON.stringify(p)).toString('base64');
test('memory tool requires explicit opt-in; legacy payloads cannot enable it',()=>{
 for(const value of [undefined,false,'true',1,null]){
  const p=decodePayload(encode({question:'q',memoryUpdate:value}));
  assert.equal(p.memoryUpdate,false);
  const t=createMemoryTool(p.memoryUpdate);
  assert.equal(t.execute('{"action":"keep","summary":""}').ok,false);
  assert.equal(t.proposal(),null);
 }
 assert.equal(decodePayload(encode({question:'q',memoryUpdate:true})).memoryUpdate,true);
});
test('memory proposal is bounded, validated and staged at most once',()=>{
 const t=createMemoryTool(true);
 for(const args of ['null','{}','{"action":"keep","summary":"bad"}',JSON.stringify({action:'replace',summary:'x'.repeat(2401)}),JSON.stringify({action:'replace',summary:'ok',goal:'overwrite'})])assert.equal(t.execute(args).ok,false);
 assert.equal(t.proposal(),null);
 const update={action:'replace',summary:'А'.repeat(2400)};
 assert.equal(t.execute(JSON.stringify(update)).ok,true);
 assert.equal(t.execute('{"action":"keep","summary":""}').ok,false);
 assert.deepEqual(t.proposal(),update);
});
test('agent handles large valid memory arguments, and client commits only with matching consent',async()=>{
 const t=createMemoryTool(true),proposal={action:'replace',summary:'А'.repeat(2300)};
 let n=0;
 const result=await runCoachAgent({messages:[{role:'user',content:'q'}],schemas:[MEMORY_TOOL],execute:(name,args)=>t.execute(args),request:async(messages,tools)=>{
  assert.deepEqual(tools,[MEMORY_TOOL]);
  if(++n===1)return {choices:[{message:{tool_calls:[{type:'function',id:'m1',function:{name:'memory_update',arguments:JSON.stringify(proposal)}}]}}]};
  assert.equal(JSON.parse(messages.at(-1).content).ok,true);
  return {choices:[{message:{content:'Продолжим тренировки'}}]};
 }});
 assert.equal(result.answer,'Продолжим тренировки');
 const m=normalizeMemory({summary:'old',summaryPending:5},Chess);
 let allowed=true;
 const tx=createMemoryUpdate(m,()=>allowed);
 assert.equal(tx.execute(t.proposal()).ok,true);
 assert.equal(m.summary,'old');
 allowed=false;assert.equal(tx.finish(m),m);
 allowed=true;assert.equal(tx.finish(m).summary,proposal.summary);
});
test('keep does not replace existing summary; missing proposal leaves compaction pending',()=>{
 const m=normalizeMemory({summary:'old',summaryPending:5},Chess),t=createMemoryTool(true);
 assert.equal(t.execute('{"action":"keep","summary":""}').ok,true);
 const tx=createMemoryUpdate(m,()=>true);
 assert.equal(tx.execute(t.proposal()).ok,true);
 assert.equal(tx.finish(m).summary,'old');
 assert.equal(tx.finish(m).summaryPending,0);
 assert.equal(createMemoryUpdate(m,()=>true).finish(m).summaryPending,6);
});
