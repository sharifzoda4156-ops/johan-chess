import test from 'node:test';
import assert from 'node:assert/strict';
import {beginAuth,checkCallback,isLocalRequest,requestBody,consumeResponse,planEnabled} from '../lib/coach-core.mjs';
test('official dynamic registration + PKCE and stable returning client',()=>{
 const redirect='http://127.0.0.1:4173/auth/callback',host='urn:uuid:test';
 const a=beginAuth(host,redirect),u=new URL(a.url);
 assert.equal(u.origin,'https://auth.openai.com');assert.equal(u.searchParams.get('client_id'),'dynamic_agent_client');assert.equal(u.searchParams.get('redirect_uri'),redirect);assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.notEqual(u.searchParams.get('code_challenge'),a.attempt.verifier);
 const b=beginAuth(host,redirect,{client_id:'oaiapp_saved',email:'a@example.test'});assert.equal(new URL(b.url).searchParams.get('client_id'),'oaiapp_saved');assert.notEqual(b.attempt.state,a.attempt.state);assert.equal(new URL(b.url).searchParams.has('agent_name_hint'),false);
});
test('callback rejects forged state, expiration and client replacement',()=>{
 const {attempt}=beginAuth('host','http://127.0.0.1:4173/auth/callback',{client_id:'oaiapp_saved'});
 const p=new URLSearchParams({state:attempt.state,code:'code',client_id:'oaiapp_saved'});
 assert.equal(checkCallback(attempt,p).client,'oaiapp_saved');
 assert.throws(()=>checkCallback(attempt,p,attempt.expires));p.set('client_id','oaiapp_wrong');assert.throws(()=>checkCallback(attempt,p));p.set('state','fake');assert.throws(()=>checkCallback(attempt,p));
});
test('local host, origin and header required',()=>{
 const req={socket:{remoteAddress:'127.0.0.1'},headers:{host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173','x-johan-coach':'1'}};
 assert.ok(isLocalRequest(req,4173,true));assert.equal(isLocalRequest({...req,headers:{...req.headers,origin:'https://evil.test'}},4173,true),false);assert.equal(isLocalRequest({...req,socket:{remoteAddress:'192.168.0.2'}},4173),false);
});
test('identity alone cannot authorize inference',()=>{assert.equal(planEnabled({access_token:'a',scopes:['openid']}),false);assert.ok(planEnabled({access_token:'a',scopes:['chatgpt.tokens.use.direct']}));});
test('request uses official streaming fields, rejects ongoing game and role injection',()=>{
 const ctx={game:{result:'1-0'}},b=requestBody('model',ctx,[],'Разбери');
 assert.equal(b.store,false);assert.equal(b.stream,true);assert.ok(!('previous_response_id'in b));assert.throws(()=>requestBody('model',{game:{result:'*'}},[],'x'));assert.throws(()=>requestBody('model',ctx,[{role:'system',content:'x'}],'x'));
});
const chunks=async function*(...s){for(const x of s)yield Buffer.from(x);};
test('SSE handles split records and requires completion',async()=>{
 assert.equal(await consumeResponse(chunks('data: {"type":"response.output_text.delta","delta":"Hi"}\r','\n\r\ndata: {"type":"response.completed"}\n\n')),'Hi');
 await assert.rejects(consumeResponse(chunks('data: {"type":"response.output_text.delta","delta":"Hi"}\n\n')));
 await assert.rejects(consumeResponse(chunks('data: {"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}}\n\n')));
});
