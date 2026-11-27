import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {
 base64Url,
 pkceChallenge,
 parseNdjsonChunk,
 createOpponentPresence,
 createWebLichess,
 WEB_SESSION_KEY,
 WEB_PKCE_KEY
} from '../public/lichess-web.js';

function memoryStorage(){
 const map=new Map();
 return {
  getItem(k){return map.has(k)?map.get(k):null;},
  setItem(k,v){map.set(k,String(v));},
  removeItem(k){map.delete(k);}
 };
}

test('pkceChallenge matches RFC 7636 S256 test vector',async()=>{
 const verifier='dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
 const challenge=await pkceChallenge(verifier,webcrypto.subtle);
 assert.equal(challenge,'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
 assert.equal(base64Url(new Uint8Array([251,255,192])),'-__A');
});

test('parseNdjsonChunk handles fragmented chunks, blank keep-alives and rejects oversized lines',()=>{
 const items=[];
 let rest=parseNdjsonChunk('{"a":1}\n\n{"b":',obj=>items.push(obj));
 assert.deepEqual(items,[{a:1}]);
 assert.equal(rest,'{"b":');
 rest=parseNdjsonChunk(rest+'2}\n',obj=>items.push(obj));
 assert.deepEqual(items,[{a:1},{b:2}]);
 assert.equal(rest,'');
 assert.throws(()=>parseNdjsonChunk('x'.repeat(200)+'\n',()=>{},100));
});

test('createOpponentPresence tracks disconnect countdown and claim eligibility',()=>{
 const p=createOpponentPresence();
 assert.equal(p.gone(),false);
 assert.equal(p.remaining(1000),-1);
 assert.equal(p.canClaim(1000),false);
 p.update(true,30,10000);
 assert.equal(p.gone(),true);
 assert.equal(p.remaining(25000),15000);
 assert.equal(p.canClaim(25000),false);
 assert.equal(p.remaining(40000),0);
 assert.equal(p.canClaim(40000),true);
 p.update(false,null,41000);
 assert.equal(p.gone(),false);
 assert.equal(p.canClaim(41000),false);
});

test('OAuth2 PKCE login redirects, verifies state, exchanges token and logs out cleanly',async()=>{
 const storage=memoryStorage(),session=memoryStorage();
 let redirected='',replaced='';
 const loc={origin:'https://example.org',pathname:'/johan-chess/',search:'',hash:'',assign(u){redirected=u;}};
 const hist={replaceState(_s,_t,u){replaced=u;}};
 const calls=[];
 const fetchImpl=async(url,init)=>{
  calls.push({url,method:init?.method||'GET',headers:init?.headers||{},body:init?.body||null});
  if(url==='https://lichess.org/api/token'){
   return new Response(JSON.stringify({token_type:'Bearer',access_token:'lip_test_token_123'}),{status:200});
  }
  if(url==='https://lichess.org/api/account'){
   return new Response(JSON.stringify({username:'JohanPlayer',perfs:{rapid:{rating:1650}}}),{status:200});
  }
  if(url==='https://lichess.org/api/token'&&init?.method==='DELETE'){
   return new Response('',{status:204});
  }
  return new Response('{}',{status:200});
 };

 const client=createWebLichess({fetchImpl,storage,session,loc,hist,cryptoApi:webcrypto});
 await client.call('login');
 assert.ok(redirected.startsWith('https://lichess.org/oauth?'));
 const oauthUrl=new URL(redirected);
 assert.equal(oauthUrl.searchParams.get('client_id'),'johan-chess-web');
 assert.equal(oauthUrl.searchParams.get('code_challenge_method'),'S256');
 assert.equal(oauthUrl.searchParams.get('redirect_uri'),'https://example.org/johan-chess/');
 const savedPkce=JSON.parse(session.getItem(WEB_PKCE_KEY));
 assert.equal(oauthUrl.searchParams.get('state'),savedPkce.state);

 // Mismatched state is rejected and query params stripped
 loc.search='?code=abc123&state=wrong_state';
 const bad=await client.consumeOAuthCallback();
 assert.equal(bad.handled,true);
 assert.equal(bad.connected,false);
 assert.equal(replaced,'/johan-chess/');
 assert.equal(session.getItem(WEB_PKCE_KEY),null);

 // Valid callback exchanges code for Bearer token and stores session
 session.setItem(WEB_PKCE_KEY,JSON.stringify(savedPkce));
 loc.search='?code=valid_code&state='+encodeURIComponent(savedPkce.state);
 const ok=await client.consumeOAuthCallback();
 assert.deepEqual(ok,{handled:true,connected:true});
 assert.equal(client.snapshot().connected,true);
 assert.equal(client.snapshot().username,'JohanPlayer');
 assert.equal(JSON.parse(storage.getItem(WEB_SESSION_KEY)).token,'lip_test_token_123');

 // Logout revokes token on Lichess and clears storage
 const afterLogout=await client.call('logout');
 assert.equal(afterLogout.connected,false);
 assert.equal(storage.getItem(WEB_SESSION_KEY),null);
 assert.ok(calls.some(c=>c.url==='https://lichess.org/api/token'&&c.method==='DELETE'));
 client.dispose();
});

test('web NDJSON streaming updates game state, locks session and sends moves',async()=>{
 const storage=memoryStorage(),session=memoryStorage();
 storage.setItem(WEB_SESSION_KEY,JSON.stringify({token:'lip_tok',username:'Alice'}));
 let clockMs=10000;
 const updates=[];
 const enc=new TextEncoder();
 const streamResp=lines=>new Response(new ReadableStream({
  start(ctrl){
   for(const l of lines)ctrl.enqueue(enc.encode(JSON.stringify(l)+'\n'));
   // Keep open briefly
  }
 }),{status:200});

 const posted=[];
 const fetchImpl=async(url,init)=>{
  if(url.endsWith('/api/account'))return new Response(JSON.stringify({username:'Alice',perfs:{rapid:{rating:1500}}}),{status:200});
  if(url.includes('/api/account/playing'))return new Response(JSON.stringify({nowPlaying:[{gameId:'Ab12Cd34',speed:'rapid'}]}),{status:200});
  if(url.endsWith('/api/challenge'))return new Response(JSON.stringify({in:[]}),{status:200});
  if(url.endsWith('/api/stream/event'))return streamResp([]);
  if(url.endsWith('/api/board/game/stream/Ab12Cd34')){
   return streamResp([
    {type:'gameFull',id:'Ab12Cd34',variant:{key:'standard'},initialFen:'startpos',clock:{initial:600000,increment:0},white:{id:'alice',name:'Alice',rating:1500},black:{id:'bob',name:'Bob',rating:1480},state:{type:'gameState',moves:'',wtime:600000,btime:600000,status:'started'}},
    {type:'chatLine',room:'player',username:'Bob',text:'Good luck!'},
    {type:'chatLine',room:'spectator',username:'Spec',text:'Ignored'},
    {type:'opponentGone',gone:true,claimWinInSeconds:15}
   ]);
  }
  if(url.includes('/api/board/game/Ab12Cd34/move/')||url.endsWith('/api/board/game/Ab12Cd34/chat')||url.endsWith('/api/board/game/Ab12Cd34/abort')){
   posted.push({url,body:init?.body||''});
   return new Response(JSON.stringify({ok:true}),{status:200});
  }
  return new Response('{}',{status:200});
 };

 const client=createWebLichess({onUpdate:s=>updates.push(s),fetchImpl,storage,session,cryptoApi:webcrypto,now:()=>clockMs});
 await client.call('refresh');
 // Allow ReadableStream microtasks to process
 await new Promise(r=>setTimeout(r,20));
 const snap=client.snapshot();
 assert.equal(snap.connected,true);
 assert.equal(snap.locked,true);
 assert.equal(snap.gameId,'Ab12Cd34');
 assert.equal(snap.full.id,'Ab12Cd34');
 assert.equal(snap.opponentGone,true);
 assert.equal(snap.claimReady,false);
 assert.deepEqual(snap.chat,[{username:'Bob',text:'Good luck!',room:'player'}]);

 // Sending a legal move, abort, and player chat message works while locked; logout is blocked while locked
 await client.call('gameAction',{gameId:'Ab12Cd34',action:'move',move:'e2e4'});
 assert.ok(posted.some(p=>p.url.endsWith('/move/e2e4')));
 await client.call('gameAction',{gameId:'Ab12Cd34',action:'abort'});
 assert.ok(posted.some(p=>p.url.endsWith('/abort')));
 await client.call('gameAction',{gameId:'Ab12Cd34',action:'chat',text:'Удачи!'});
 const chatPost=posted.find(p=>p.url.endsWith('/chat'));
 assert.ok(chatPost&&chatPost.body.includes('room=player')&&chatPost.body.includes('text='));
 await assert.rejects(()=>client.call('gameAction',{gameId:'Ab12Cd34',action:'chat',text:'   '}),/1 до 140/);
 await assert.rejects(()=>client.call('logout'),/онлайн-партии|Сначала заверши/);

 // After 15s opponent absence, claimReady becomes true
 clockMs+=16000;
 assert.equal(client.snapshot().claimReady,true);
 client.dispose();
});
