// Browser-native Lichess OAuth2 PKCE + Board API streaming client.
// Mirrors the Android Lichess bridge contract so online.js works identically on Web & Android.
import {finishedStatus,matchControl,validNick,validGameId} from './online-core.js';

export const LICHESS_HOST='https://lichess.org';
export const WEB_CLIENT_ID='johan-chess-web';
export const WEB_SESSION_KEY='jc-lichess-web-v1';
export const WEB_PKCE_KEY='jc-lichess-pkce-v1';
const SCOPES='board:play challenge:read challenge:write follow:read follow:write';

export function base64Url(bytes){
 const arr=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 let bin='';
 for(let i=0;i<arr.length;i++)bin+=String.fromCharCode(arr[i]);
 const b64=typeof btoa==='function'?btoa(bin):Buffer.from(arr).toString('base64');
 return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export function randomVerifier(cryptoApi=globalThis.crypto){
 const bytes=new Uint8Array(32);
 cryptoApi.getRandomValues(bytes);
 return base64Url(bytes);
}

export async function pkceChallenge(verifier,subtle=globalThis.crypto?.subtle){
 if(!subtle)throw Error('Браузер не поддерживает криптографию Web Crypto (нужен HTTPS или localhost)');
 const data=new TextEncoder().encode(verifier);
 const digest=await subtle.digest('SHA-256',data);
 return base64Url(new Uint8Array(digest));
}

export function parseNdjsonChunk(buffer,onObject,maxLine=1000000){
 let start=0;
 while(true){
  const nl=buffer.indexOf('\n',start);
  if(nl===-1)break;
  const line=buffer.slice(start,nl).trim();
  start=nl+1;
  if(line.length>maxLine)throw Error('Строка Lichess слишком большая');
  if(!line)continue;
  onObject(JSON.parse(line));
 }
 const rest=buffer.slice(start);
 if(rest.length>maxLine)throw Error('Буфер потока Lichess переполнен');
 return rest;
}

export function createOpponentPresence(){
 let gone=false,claimAt=-1;
 return {
  gone(){return gone;},
  reset(){gone=false;claimAt=-1;},
  update(isGone,claimWinInSeconds,nowMs){
   if(!isGone){gone=false;claimAt=-1;return;}
   gone=true;
   if(typeof claimWinInSeconds==='number'&&Number.isFinite(claimWinInSeconds)&&claimWinInSeconds>=0){
    claimAt=nowMs+claimWinInSeconds*1000;
   }else{
    claimAt=-1;
   }
  },
  remaining(nowMs){
   if(!gone||claimAt<0)return -1;
   return Math.max(0,claimAt-nowMs);
  },
  canClaim(nowMs){
   return gone&&claimAt>=0&&nowMs>=claimAt;
  }
 };
}

function formBody(params){
 const sp=new URLSearchParams();
 for(const [k,v] of Object.entries(params))sp.set(k,String(v));
 return sp.toString();
}

export function createWebLichess({
 onUpdate=()=>{},
 fetchImpl=(...a)=>globalThis.fetch(...a),
 storage=globalThis.localStorage,
 session=globalThis.sessionStorage,
 loc=globalThis.location,
 hist=globalThis.history,
 cryptoApi=globalThis.crypto,
 openUrl=(u)=>globalThis.open?.(u,'_blank','noopener,noreferrer'),
 navigatorApi=globalThis.navigator,
 now=()=>Date.now()
}={}){
 let token='',username='',account={},full=null,state=null,ongoing=[],incoming=[],chat=[],gameId='',notice='';
 let terminal=false,needsSync=false,rateUntil=0,revision=0,gameStartedAt=0,disposed=false,reconnectTimer=null;
 let eventsStream=null,gameStream=null,waitStream=null;
 const opponent=createOpponentPresence();

 // Restore saved web session if present
 try{
  const raw=storage?.getItem(WEB_SESSION_KEY);
  if(raw){
   const parsed=JSON.parse(raw);
   if(typeof parsed?.token==='string'&&parsed.token&&validNick(parsed?.username)){
    token=parsed.token;username=parsed.username;
   }
  }
 }catch{}

 function saveSession(t,u){
  token=t||'';username=u||'';
  try{
   if(token&&username)storage?.setItem(WEB_SESSION_KEY,JSON.stringify({token,username}));
   else storage?.removeItem(WEB_SESSION_KEY);
  }catch{}
 }

 function locked(){return needsSync||waitStream!==null||(!!gameId&&!terminal);}
 function live(){return !!gameId&&!terminal;}
 function emit(){try{onUpdate(snapshot());}catch{}}

 function redirectUri(){
  return (loc?.origin||'')+(loc?.pathname||'/');
 }

 function snapshot(){
  const t=now();
  const out={
   connected:!!token,
   username,
   account,
   locked:locked(),
   needsSync,
   eventReady:!!(eventsStream&&eventsStream.ready),
   waiting:waitStream!==null,
   gameId,
   terminal,
   notice,
   incoming:incoming.slice(),
   ongoing:ongoing.slice(),
   chat:chat.slice(),
   opponentGone:live()&&!needsSync&&opponent.gone(),
   claimRemaining:live()&&!needsSync?opponent.remaining(t):-1,
   claimReady:live()&&!needsSync&&opponent.canClaim(t)
  };
  if(full)out.full=full;
  if(state)out.state=state;
  return out;
 }

 function requireLogin(){if(!token)throw Error('Войди в Lichess');}
 function checkNick(s){if(!validNick(s))throw Error('Неверный ник Lichess');return s;}
 function checkId(s){if(!validGameId(s))throw Error('Неверный ID партии');return s;}

 async function request(path,{method='GET',auth=token,body=null,accept='application/json',limit=1000000}={}){
  if(now()<rateUntil)throw Error('Лимит Lichess: повтори через минуту');
  const headers={Accept:accept};
  if(auth)headers.Authorization='Bearer '+auth;
  if(body!==null)headers['Content-Type']='application/x-www-form-urlencoded';
  const res=await fetchImpl(LICHESS_HOST+path,{method,headers,body});
  if(res.status===429)rateUntil=now()+60000;
  if(!res.ok){
   if(res.status===401&&auth&&auth===token){
    stopStreams();saveSession('','');account={};incoming=[];ongoing=[];gameId='';full=state=null;terminal=false;needsSync=false;emit();
   }
   throw Error('Lichess HTTP '+res.status+(res.status===401?' · войди заново':res.status===429?' · подожди минуту':''));
  }
  const txt=await res.text();
  if(txt.length>limit)throw Error('Ответ Lichess слишком большой');
  return txt;
 }

 async function jsonReq(path,method='GET',body=null){
  requireLogin();
  const txt=await request(path,{method,body,accept:'application/json'});
  return txt.trim()?JSON.parse(txt):{};
 }

 async function ndjsonReq(path,max=200){
  requireLogin();
  const txt=await request(path,{method:'GET',accept:'application/x-ndjson',limit:2000000});
  const out=[];
  for(const line of txt.split('\n')){
   if(out.length>=max)break;
   const t=line.trim();
   if(!t)continue;
   out.push(JSON.parse(t));
  }
  return out;
 }

 function cancelStream(s){
  if(!s)return;
  s.canceled=true;
  try{s.controller.abort();}catch{}
 }

 function clearReconnect(){if(reconnectTimer!==null){clearTimeout(reconnectTimer);reconnectTimer=null;}}
 function scheduleReconnect(delay=2500){
  if(disposed||!token||reconnectTimer!==null)return;
  reconnectTimer=setTimeout(()=>{
   reconnectTimer=null;
   if(disposed||!token)return;
   if(!eventsStream)eventsStream=startStream('events','/api/stream/event','GET',null);
   if(live()&&!gameStream)gameStream=startStream('game','/api/board/game/stream/'+gameId,'GET',null);
  },delay);
 }

 function stopStreams(){
  clearReconnect();
  cancelStream(eventsStream);cancelStream(gameStream);cancelStream(waitStream);
  eventsStream=gameStream=waitStream=null;
 }

 function startStream(kind,path,method='GET',body=null){
  const controller=new AbortController();
  const s={kind,path,method,body,controller,canceled:false,ready:false};
  (async()=>{
   let errMsg='';
   try{
    if(now()<rateUntil)throw Error('Лимит Lichess: повтори через минуту');
    const headers={Accept:'application/x-ndjson'};
    if(token)headers.Authorization='Bearer '+token;
    if(body!==null)headers['Content-Type']='application/x-www-form-urlencoded';
    const res=await fetchImpl(LICHESS_HOST+path,{method,headers,body,signal:controller.signal});
    if(res.status===429)rateUntil=now()+60000;
    if(!res.ok)throw Error('Lichess HTTP '+res.status+(res.status===401?' · войди заново':''));
    if(s.canceled)return;
    s.ready=true;
    emit();
    if(res.body&&typeof res.body.getReader==='function'){
     const reader=res.body.getReader();
     const decoder=new TextDecoder();
     let buf='';
     while(!s.canceled){
      const {done,value}=await reader.read();
      if(done)break;
      buf+=decoder.decode(value,{stream:true});
      buf=parseNdjsonChunk(buf,obj=>{if(!s.canceled&&kind!=='wait')receive(s,obj);});
     }
     buf+=decoder.decode();
     if(!s.canceled&&buf.trim()&&kind!=='wait'){
      parseNdjsonChunk(buf+'\n',obj=>receive(s,obj));
     }
    }else{
     const txt=await res.text();
     if(!s.canceled&&kind!=='wait')parseNdjsonChunk(txt+'\n',obj=>receive(s,obj));
    }
   }catch(e){
    if(!s.canceled&&e?.name!=='AbortError')errMsg=e?.message||'Связь потеряна';
   }finally{
    if(!s.canceled)ended(s,errMsg);
   }
  })();
  return s;
 }

 function startGame(raw){
  const next=checkId(raw);
  if(next===gameId&&gameStream)return;
  if(gameStream){cancelStream(gameStream);gameStream=null;}
  if(waitStream){cancelStream(waitStream);waitStream=null;}
  revision++;gameId=next;gameStartedAt=now();terminal=false;needsSync=true;full=null;state=null;chat=[];
  opponent.reset();notice='Подключаюсь к партии';
  gameStream=startStream('game','/api/board/game/stream/'+next,'GET',null);
  emit();
 }

 function receive(s,msg){
  if(s.canceled||!msg)return;
  const type=msg.type;
  if(s===eventsStream){
   if(type==='gameStart'){
    const g=msg.game;
    if(g&&g.speed!=='correspondence')startGame(g.gameId||g.id);
   }else if(type==='challenge'||type==='challengeCanceled'||type==='challengeDeclined'){
    const ch=msg.challenge;
    if(ch&&ch.id){
     incoming=incoming.filter(row=>row?.id!==ch.id);
     if(type==='challenge'&&ch.destUser&&String(ch.destUser.id||'').toLowerCase()===username.toLowerCase()){
      incoming.push(ch);
     }
    }
    notice='Есть обновление вызовов';
    emit();
   }else if(type==='gameFinish'&&!terminal){
    const g=msg.game;
    if(g&&gameId===(g.gameId||g.id)){revision++;needsSync=true;emit();}
   }
  }else if(s===gameStream){
   if(type==='gameFull'){
    revision++;full=msg;state=msg.state;
   }else if(type==='gameState'&&full){
    revision++;
    const oldMoves=state?.moves||'',newMoves=msg.moves||'';
    if(opponent.gone()&&newMoves!==oldMoves&&newMoves.startsWith(oldMoves)){
     const before=oldMoves.trim()?oldMoves.trim().split(/\s+/).length:0;
     const after=newMoves.trim()?newMoves.trim().split(/\s+/).length:0;
     const fen=full.initialFen||'startpos';
     const whiteFirst=fen==='startpos'||!fen||fen.includes(' w ');
     const mineWhite=String(full.white?.id||'').toLowerCase()===username.toLowerCase();
     if(after>before&&(after-before>=2||((before%2===0)===whiteFirst)!==mineWhite))opponent.reset();
    }
    state=msg;
   }else if(type==='chatLine'){
    const room=String(msg.room||'player');
    const txt=String(msg.text||'').trim();
    if(room==='player'&&txt){
     chat=[...chat,{username:String(msg.username||'Lichess'),text:txt.slice(0,200),room}].slice(-100);
     emit();
    }
    return;
   }else if(type==='opponentGone'&&full&&!terminal){
    const delay=typeof msg.claimWinInSeconds==='number'?msg.claimWinInSeconds:null;
    if(typeof msg.gone==='boolean')opponent.update(msg.gone,delay,now());
    emit();
    return;
   }else return;
   if(state){
    const wasTerminal=terminal;
    terminal=finishedStatus(state.status);
    notice=terminal?'Партия завершена':'';
    if(terminal&&!wasTerminal){opponent.reset();revision++;needsSync=true;}
    else if(!terminal)needsSync=false;
    emit();
   }
  }
 }

 function ended(s,errMsg){
  if(s.canceled)return;
  if(s===eventsStream){
   eventsStream=null;
   notice=errMsg||'Поток событий закрыт';
   if(waitStream){cancelStream(waitStream);waitStream=null;needsSync=true;revision++;}
   emit();
   scheduleReconnect();
  }else if(s===waitStream){
   waitStream=null;
   if(!gameId||!gameStream){
    revision++;needsSync=true;
    notice=errMsg||'Поиск завершён. Проверяю партии…';
   }
   emit();
  }else if(s===gameStream){
   gameStream=null;
   if(!terminal){
    revision++;needsSync=true;opponent.reset();
    notice=errMsg||'Связь потеряна. Восстанавливаю соединение…';
    scheduleReconnect();
   }
   emit();
  }
 }

 async function refresh(){
  requireLogin();
  const before=revision;
  const [a,playingResp,chResp]=await Promise.all([
   jsonReq('/api/account','GET'),
   jsonReq('/api/account/playing?nb=50','GET'),
   jsonReq('/api/challenge','GET')
  ]);
  account=a;
  ongoing=Array.isArray(playingResp.nowPlaying)?playingResp.nowPlaying:[];
  incoming=Array.isArray(chResp.in)?chResp.in:[];
  if(!eventsStream)eventsStream=startStream('events','/api/stream/event','GET',null);
  if(before!==revision){emit();return snapshot();}
  let next='';
  for(const p of ongoing){
   if(p&&p.speed!=='correspondence'&&validGameId(p.gameId)){
    next=p.gameId;
    if(next===gameId)break;
   }
  }
  if(next){
   if(!gameStream||next!==gameId){
    if(gameStream){cancelStream(gameStream);gameStream=null;}
    startGame(next);
   }else{
    needsSync=false;
   }
  }else if(!waitStream){
   const recentlyStarted=!!(gameId&&!terminal&&gameStream&&(now()-gameStartedAt)<15000);
   if(!recentlyStarted){
    if(gameId&&!terminal){
     if(gameStream){cancelStream(gameStream);gameStream=null;}
     gameId='';full=state=null;notice='Партия завершена на Lichess. Проверь историю.';
    }
    opponent.reset();needsSync=false;
   }
  }
  if(!notice.startsWith('Партия завершена'))notice='';
  emit();
  return snapshot();
 }

 async function login(){
  if(locked())throw Error('Сначала заверши или синхронизируй онлайн-партию');
  const verifier=randomVerifier(cryptoApi);
  const stateToken=randomVerifier(cryptoApi);
  const challenge=await pkceChallenge(verifier,cryptoApi?.subtle);
  const redirect=redirectUri();
  try{session?.setItem(WEB_PKCE_KEY,JSON.stringify({verifier,state:stateToken,redirect}));}catch{throw Error('Не удалось сохранить состояние OAuth в sessionStorage');}
  const url=LICHESS_HOST+'/oauth?'+formBody({
   response_type:'code',
   client_id:WEB_CLIENT_ID,
   redirect_uri:redirect,
   scope:SCOPES,
   state:stateToken,
   code_challenge_method:'S256',
   code_challenge:challenge
  });
  loc.assign(url);
  return snapshot();
 }

 async function consumeOAuthCallback(){
  const search=loc?.search||'';
  if(!search)return {handled:false,connected:false};
  const sp=new URLSearchParams(search);
  const code=sp.get('code'),stateParam=sp.get('state'),oauthErr=sp.get('error');
  if(!code&&!oauthErr)return {handled:false,connected:false};
  // Clean OAuth parameters from URL immediately
  sp.delete('code');sp.delete('state');sp.delete('error');sp.delete('error_description');
  const cleanSearch=sp.toString();
  const cleanUrl=(loc?.pathname||'/')+(cleanSearch?'?'+cleanSearch:'')+(loc?.hash||'');
  try{hist?.replaceState?.(null,'',cleanUrl);}catch{}
  let saved=null;
  try{
   const raw=session?.getItem(WEB_PKCE_KEY);
   session?.removeItem(WEB_PKCE_KEY);
   if(raw)saved=JSON.parse(raw);
  }catch{}
  if(oauthErr){
   notice='Вход в Lichess отменён.';
   emit();
   return {handled:true,connected:false,error:notice};
  }
  if(!saved||!saved.verifier||!saved.state||saved.state!==stateParam){
   notice='Неверный OAuth state Lichess. Попробуй войти снова.';
   emit();
   return {handled:true,connected:false,error:notice};
  }
  const tokenText=await request('/api/token',{
   method:'POST',
   auth:'',
   body:formBody({
    grant_type:'authorization_code',
    client_id:WEB_CLIENT_ID,
    redirect_uri:saved.redirect||redirectUri(),
    code,
    code_verifier:saved.verifier
   }),
   accept:'application/json',
   limit:20000
  });
  const tokenJson=JSON.parse(tokenText);
  const access=tokenJson.access_token;
  if(!access||String(tokenJson.token_type||'').toLowerCase()!=='bearer')throw Error('Неверный OAuth ответ Lichess');
  const profileText=await request('/api/account',{method:'GET',auth:access,accept:'application/json',limit:500000});
  const profile=JSON.parse(profileText);
  const name=checkNick(profile.username);
  stopStreams();
  saveSession(access,name);
  account=profile;full=null;state=null;gameId='';terminal=false;needsSync=false;notice='';
  emit();
  return {handled:true,connected:true};
 }

 function canMatch(){
  requireLogin();
  if(locked()||!eventsStream||!eventsStream.ready)throw Error('Сначала синхронизируй подключение Lichess');
 }

 async function match(req,direct){
  const min=Number(req.minutes),inc=Number(req.increment);
  if(!matchControl(min,inc,direct))throw Error('Недопустимый контроль времени');
  canMatch();
  const body=direct
   ?formBody({'clock.limit':min*60,'clock.increment':inc,rated:!!req.rated,variant:'standard',keepAliveStream:'true'})
   :formBody({time:min,increment:inc,rated:!!req.rated,variant:'standard'});
  const path=direct?'/api/challenge/'+checkNick(req.user):'/api/board/seek';
  waitStream=startStream('wait',path,'POST',body);
  notice=direct?'Вызов отправляется':'Поиск соперника';
  emit();
  return snapshot();
 }

 async function cancel(){
  if(waitStream){cancelStream(waitStream);waitStream=null;needsSync=true;emit();}
  return refresh();
 }

 async function accept(raw){
  const cid=checkId(raw);
  canMatch();
  const found=incoming.find(x=>x?.id===cid);
  const variant=found?.variant,clock=found?.timeControl;
  if(!variant||variant.key!=='standard'||!clock||clock.type!=='clock'||(clock.limit+40*clock.increment)<180){
   throw Error('Этот вызов не поддерживается Board API');
  }
  needsSync=true;emit();
  await jsonReq('/api/challenge/'+cid+'/accept','POST','');
  if(cid!==gameId||!gameStream)startGame(cid);
  return snapshot();
 }

 async function gameAction(r){
  const target=checkId(r.gameId),act=String(r.action||'');
  if(act==='chat'){
   if(target!==gameId||needsSync||!full||!state)throw Error('Нет подключённой партии');
   const text=String(r.text||'').trim();
   if(!text||text.length>140)throw Error('Сообщение должно быть от 1 до 140 символов');
   return jsonReq('/api/board/game/'+target+'/chat','POST',formBody({room:'player',text}));
  }
  if(target!==gameId||terminal||needsSync||!full||!state||!gameStream||!gameStream.ready){
   throw Error('Нет активной подключённой партии');
  }
  if((act==='claim-victory'||act==='claim-draw')&&!opponent.canClaim(now())){
   throw Error('Lichess ещё не разрешил завершить партию');
  }
  let suffix='';
  if(act==='move'){
   const m=String(r.move||'');
   if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))throw Error('Неверный ход');
   suffix='move/'+m;
  }else if(['abort','resign','draw/yes','draw/no','claim-victory','claim-draw'].includes(act)){
   suffix=act;
  }else throw Error('Неизвестное действие');
  return jsonReq('/api/board/game/'+target+'/'+suffix,'POST','');
 }

 async function logout(){
  if(locked())throw Error('Сначала заверши партию');
  requireLogin();
  const current=token;
  try{await request('/api/token',{method:'DELETE',auth:current,accept:'application/json',limit:10000});}catch{}
  stopStreams();saveSession('','');account={};incoming=[];ongoing=[];chat=[];gameId='';full=state=null;terminal=false;needsSync=false;notice='';
  emit();
  return snapshot();
 }

 async function shareProfile(){
  if(locked())throw Error('Сначала заверши игру');
  requireLogin();
  const url=LICHESS_HOST+'/@/'+checkNick(username);
  if(typeof navigatorApi?.share==='function'){
   try{await navigatorApi.share({title:'Мой профиль Lichess — Johan Chess',url});return {ok:true};}catch{}
  }
  if(typeof navigatorApi?.clipboard?.writeText==='function'){
   await navigatorApi.clipboard.writeText(url);
   notice='Ссылка на профиль Lichess скопирована.';
   emit();
   return {ok:true};
  }
  openUrl(url);
  return {ok:true};
 }

 async function call(op,args={}){
  if(locked()&&!['snapshot','refresh','cancel','gameAction'].includes(op)){
   throw Error('Действие недоступно во время онлайн-партии');
  }
  switch(op){
   case 'snapshot':return snapshot();
   case 'refresh':return token?refresh():snapshot();
   case 'login':return login();
   case 'cancelLogin':return snapshot();
   case 'logout':return logout();
   case 'seek':return match(args,false);
   case 'challenge':return match(args,true);
   case 'cancel':return cancel();
   case 'accept':return accept(args.challengeId);
   case 'decline':return jsonReq('/api/challenge/'+checkId(args.challengeId)+'/decline','POST','');
   case 'gameAction':return gameAction(args);
   case 'friends':return {users:await ndjsonReq('/api/rel/following',200)};
   case 'player':return jsonReq('/api/user/'+checkNick(args.user),'GET');
   case 'follow':return jsonReq('/api/rel/follow/'+checkNick(args.user),'POST','');
   case 'unfollow':return jsonReq('/api/rel/unfollow/'+checkNick(args.user),'POST','');
   case 'history':return {games:await ndjsonReq('/api/games/user/'+checkNick(username)+'?max=20&ongoing=false&moves=false&clocks=false&evals=false',20)};
   case 'pgn':return {pgn:await request('/game/export/'+checkId(args.gameId),{method:'GET',accept:'application/x-chess-pgn',limit:300000})};
   case 'share':return shareProfile();
   case 'open':requireLogin();openUrl(LICHESS_HOST+'/@/'+checkNick(args.user||username));return {ok:true};
   default:throw Error('Неизвестное действие Lichess');
  }
 }

 return {
  call,
  snapshot,
  consumeOAuthCallback,
  dispose:()=>{disposed=true;stopStreams();}
 };
}
