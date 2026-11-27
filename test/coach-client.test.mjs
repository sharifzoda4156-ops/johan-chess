import test from 'node:test';
import assert from 'node:assert/strict';
import {askCoach,tokenOk,encodePayload,decodeAnswer,newRequestId,ANSWER_PREFIX,resolveCoachAccount,hasPublicConsent,setPublicConsent} from '../public/coach-client.js';
const TOKEN='github_pat_'+'A'.repeat(30);
const b64=o=>ANSWER_PREFIX+Buffer.from(JSON.stringify(o)).toString('base64');
const res=(data,status=200)=>({ok:status<400,status,json:async()=>data});

test('tokenOk',()=>{assert.ok(tokenOk(TOKEN));assert.ok(tokenOk('ghp_'+'a'.repeat(30)));assert.ok(!tokenOk('abc'));assert.ok(!tokenOk(''));});
test('encodePayload round-trips unicode',()=>{
  const e=encodePayload({question:'Привет ♟'});assert.deepEqual(JSON.parse(Buffer.from(e,'base64').toString()),{question:'Привет ♟'});
  assert.throws(()=>encodePayload({q:'x'.repeat(70000)}));
});
test('decodeAnswer',()=>{assert.equal(decodeAnswer(b64({answer:'Привет'})).answer,'Привет');assert.equal(decodeAnswer('other'),null);});
test('askCoach full flow',async()=>{
  const id=newRequestId();const calls=[];let polls=0;
  const fetcher=async(url,init={})=>{
    calls.push((init.method||'GET')+' '+url.replace('https://api.github.com/repos/o/r',''));
    assert.equal(init.headers.authorization,'Bearer '+TOKEN);
    if(url.endsWith('/dispatches')){const body=JSON.parse(init.body);assert.equal(body.inputs.request_id,id);assert.equal(body.ref,'main');return res(null,204);}
    if(url.includes('/workflows/coach-runner.yml/runs'))return res({workflow_runs:[{id:1,display_title:'other'},{id:7,display_title:'coach '+id,html_url:'u'}]});
    if(url.endsWith('/actions/runs/7'))return res({status:++polls<2?'queued':'completed',conclusion:'success',html_url:'u'});
    if(url.endsWith('/runs/7/jobs'))return res({jobs:[{id:99}]});
    if(url.includes('/check-runs/99/annotations'))return res([{message:'noise'},{message:b64({request_id:id,ok:true,answer:'Ответ'})}]);
    throw Error('unexpected '+url);
  };
  const st=[];const r=await askCoach({question:'q'},{token:TOKEN,fetcher,repo:'o/r',id,sleeper:async()=>{},onStatus:s=>st.push(s)});
  assert.equal(r.answer,'Ответ');assert.ok(st.length>=3);assert.match(calls[0],/^POST .*dispatches$/);
});
test('askCoach errors',async()=>{
  await assert.rejects(askCoach({question:'q'},{token:'bad'}),/токен/);
  await assert.rejects(askCoach({question:'q'},{token:TOKEN,repo:'o/r',sleeper:async()=>{},fetcher:async()=>res({},401)}),/отклонил/);
  const id='abc123';
  const f=async url=>url.includes('/runs?')?res({workflow_runs:[{id:1,display_title:'coach '+id}]}):url.endsWith('/runs/1')?res({status:'completed',conclusion:'failure'}):url.endsWith('/jobs')?res({jobs:[{id:2}]}):url.includes('annotations')?res([{message:b64({request_id:id,ok:false,error:'boom'})}]):res(null,204);
  await assert.rejects(askCoach({question:'q'},{token:TOKEN,repo:'o/r',id,sleeper:async()=>{},fetcher:f}),/boom/);
  await assert.rejects(askCoach({question:'q'},{token:TOKEN,repo:'o/r',id,sleeper:async()=>{},fetcher:f,isCancelled:()=>true}),/отменён/);
});

test('stable verified GitHub ID is hashed, independent of token rotation and login changes',async()=>{
  const {webcrypto,createHash}=await import('node:crypto');
  const check=async(token,id,login)=>resolveCoachAccount(token,{subtle:webcrypto.subtle,fetcher:async(url,init)=>{
    assert.equal(url,'https://api.github.com/user');assert.equal(init.headers.authorization,'Bearer '+token);
    return res({id,login});
  }});
  const a=await check(TOKEN,123,'first');
  assert.equal(a,createHash('sha256').update('github-user:123').digest('hex'));
  assert.equal(await check('github_pat_'+'B'.repeat(30),123,'renamed'),a);
  assert.notEqual(await check(TOKEN,456,'first'),a);
  const {memoryKey}=await import('../public/coach-memory.js');
  assert.ok(memoryKey(a,'player'));assert.notEqual(memoryKey(a,'player'),memoryKey(a,'other'));
  for(const bad of [{id:'123'},{id:0},{id:-1},{}])await assert.rejects(resolveCoachAccount(TOKEN,{subtle:webcrypto.subtle,fetcher:async()=>res(bad)}),/аккаунт/);
  await assert.rejects(resolveCoachAccount(TOKEN,{subtle:webcrypto.subtle,fetcher:async()=>res({},401)}),/401/);
});
test('public consent is versioned and isolated by verified account',()=>{
  const m=new Map([['jc-coach-consent','1']]),s={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};
  const a='a'.repeat(64),b='b'.repeat(64);
  assert.equal(hasPublicConsent(a,s),false);
  assert.equal(setPublicConsent(a,true,s),true);
  assert.equal(hasPublicConsent(a,s),true);assert.equal(hasPublicConsent(b,s),false);
  assert.equal(setPublicConsent('github',true,s),false);
  assert.equal(setPublicConsent(a,false,s),true);assert.equal(hasPublicConsent(a,s),false);
});
test('cancelled request cannot dispatch any public workflow data',async()=>{
  let called=0;
  await assert.rejects(askCoach({question:'q'},{token:TOKEN,isCancelled:()=>true,fetcher:async()=>{called++;throw Error('unexpected');}}),/отменён/);
  assert.equal(called,0);
});
