import {Chess} from './chess.js';
import {renderBoardView,clearBoardView,roundMotionFactor} from './board-view.js';
import {findKingSquare,renderMaterial} from './material.js';
import {playSound,soundForMove} from './sound.js';
import {confirmDialog} from './dialog.js';
import {matchControl,validNick,validGameId,readOnlineGame,serverClock,resultText,completedPgn} from './online-core.js';
import {createWebLichess} from './lichess-web.js';

const $=id=>document.getElementById(id),native=globalThis.JohanLichess;
const pending=new Map();let seq=0;
if(native)native.onmessage=e=>{try{const r=JSON.parse(e.data),p=pending.get(r.id);if(!p)return;clearTimeout(p.timer);pending.delete(r.id);r.error?p.reject(Error(r.error)):p.resolve(r.data);}catch{}};
function nativeCall(op,args={}){return new Promise((resolve,reject)=>{const id=String(++seq),timer=setTimeout(()=>{pending.delete(id);reject(Error('Lichess не ответил'));},op==='login'?330000:100000);pending.set(id,{resolve,reject,timer});try{native.postMessage(JSON.stringify({id,op,...args}));}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});}

const el=(tag,value,cls)=>{const a=document.createElement(tag);if(value!==undefined)a.textContent=value;if(cls)a.className=cls;return a;};
const text=(id,value)=>{const a=$(id);value=String(value??'');if(a.textContent!==value)a.textContent=value;};
const clock=ms=>{const n=Math.ceil(ms/1000);return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};

export function initOnline({canStart,lock,review,openOnline}){
 let snap={connected:false,locked:false},game=null,signature='',receivedAt=0,selected=null,promotion=[],sending=false,awaiting=false,working=false,polling=false,active=false,uiLock=false,history=[],friendRows=[],lastAccount='',error='',syncAttempt='',lastGame='',challengeKey='',claimAt=0;
 const webClient=native?null:createWebLichess({onUpdate:s=>handlePush(s)});
 const call=(op,args={})=>native?nativeCall(op,args):webClient.call(op,args);

 function setLock(v){v=!!v;if(v!==uiLock){uiLock=v;lock(v);}}
 const say=s=>{error=s;text('onlineStatus',s);};
 function controls(){
  const connected=snap.connected,blocked=working||uiLock;
  $('onlineLogin').hidden=connected;$('onlineLogout').hidden=!connected;$('onlineAccount').hidden=!connected;$('onlineSocial').hidden=!connected||uiLock;$('onlineLobby').hidden=!connected||!!(game&&!game.done)||snap.waiting;
  text('onlineProfileStatus',connected?snap.username:'Подключить');
  $('onlineLogin').disabled=working||uiLock;$('onlineLogout').disabled=blocked;$('onlineRefresh').disabled=working||!connected;
  $('onlineSeek').disabled=blocked||!snap.eventReady||!canStart();$('onlineChallenge').disabled=blocked||!snap.eventReady||!canStart();$('onlineCancel').hidden=!snap.waiting;$('onlineCancel').disabled=working;
  $('onlineGame').hidden=!game||snap.waiting;document.body.classList.toggle('online-board-focus',!!game&&!game.done&&!snap.waiting&&uiLock);$('onlineHistoryRefresh').disabled=blocked;$('onlineFriendSearch').disabled=blocked;$('onlineFriendsRefresh').disabled=blocked;
  $('onlineWaiting').hidden=!snap.waiting;$('onlineReconnect').hidden=!(snap.locked&&!snap.waiting&&(!game||snap.needsSync||awaiting));$('onlineOpponentGone').hidden=!snap.opponentGone||!game||game.done;
  $('onlineClaimActions').hidden=!snap.claimReady||!game||game.done||snap.needsSync;
  for(const id of ['onlineClaimVictory','onlineClaimDraw'])$(id).disabled=working||sending||!snap.claimReady;
  $('onlineGameNotice').hidden=!(game&&!game.done&&(snap.needsSync||awaiting||error));$('onlineGameNoticeText').textContent=error||(snap.needsSync?'Связь потеряна':awaiting?'Ожидаю подтверждения Lichess':'');$('onlineGameReconnect').hidden=!(snap.needsSync||awaiting);
 }
 function profileView(){text('onlineName',snap.username||'');const perf=snap.account?.perfs||{};for(const [type,id] of [['blitz','onlineBlitzRating'],['rapid','onlineRapidRating'],['classical','onlineClassicalRating']]){const r=perf[type];text(id,Number.isFinite(r?.rating)?r.rating+(r.prov?'?':''):'—');}}
 function tick(){
  if(snap.opponentGone){
   const seconds=Math.max(0,Math.ceil((snap.claimRemaining-(performance.now()-claimAt))/1000));
   text('onlineOpponentGone',snap.claimReady?'Соперник покинул игру. Можно потребовать победу или ничью.':snap.claimRemaining>=0?'Соперник отключился · ожидание '+seconds+' с':'Соперник отключился · ожидаем Lichess');
  }
  if(!game)return;const times=serverClock(game,Math.max(0,performance.now()-receivedAt));text('onlineTopClock',clock(times[game.color==='w'?'b':'w']));text('onlineBottomClock',clock(times[game.color]));
 }
 function draw(animateMoves=[]){
  if(!game){clearBoardView($('onlineBoard'));return;}
  const mine=game.color,turn=game.game.turn(),playable=!game.done&&turn===mine&&!snap.needsSync&&!sending&&!awaiting&&!working&&!promotion.length;
  const targets=[]; // No assistance or legal-move dots in rated or casual online play.
  const rows=game.game.board(),checkSquare=game.game.isCheck()?findKingSquare(rows,turn):null;
  renderBoardView($('onlineBoard'),{rows,flip:mine==='b',interactive:true,disabled:!playable,onClick:click,selected,targets,last:game.game.history({verbose:true}).at(-1),checkSquare,animateMoves,motionFactor:roundMotionFactor(snap.full?.clock?.initial,snap.full?.clock?.increment,game.done)});
  renderMaterial($('onlineTopMat'),rows,mine==='w'?'b':'w');
  renderMaterial($('onlineBottomMat'),rows,mine);
  $('onlinePromotion').hidden=!promotion.length;
  const player=c=>c==='w'?game.white:game.black,label=p=>[p?.name||p?.id||'Игрок',p?.rating].filter(Boolean).join(' · ');
  text('onlineTop',label(player(mine==='w'?'b':'w')));text('onlineBottom',label(player(mine)));
  text('onlineTurn',game.done?resultText(game):snap.needsSync?'Связь потеряна · обнови':awaiting?'Ожидаю подтверждение Lichess':resultText(game));
  $('onlineGameActions').hidden=game.done;$('onlineReviewGame').hidden=!game.done||!game.moves.length||snap.locked;
  $('onlineDrawNo').hidden=!game.drawOffer;$('onlineDraw').querySelector('span').textContent=game.drawOffer?'Принять':'Ничья';
  const list=$('onlineMoveStrip'),sans=game.game.history().map((m,i)=>i%2===0?Math.floor(i/2)+1+'. '+m:m).join(' ');if(list.textContent!==sans){list.textContent=sans;list.scrollLeft=list.scrollWidth;}
  $('onlineTopClock').classList.toggle('running',!game.done&&turn!==mine);$('onlineBottomClock').classList.toggle('running',!game.done&&turn===mine);
  for(const id of ['onlineResign','onlineDraw','onlineDrawNo'])$(id).disabled=working||sending||game.done||snap.needsSync;
  tick();
 }
 function challenges(){
  const box=$('onlineChallenges'),frag=document.createDocumentFragment();
  for(const c of (snap.incoming||[]).slice(0,20)){
   if(!validGameId(c.id))continue;
   const row=el('div',undefined,'online-list-row'),actions=el('div',undefined,'controls'),yes=el('button','Принять','primary'),no=el('button','Отклонить');
   row.append(el('strong',c.challenger?.name||c.challenger?.id||'Игрок'),el('small',c.timeControl?.show||c.speed||'Вызов'));
   yes.disabled=uiLock||!snap.eventReady;yes.onclick=()=>begin('accept',{challengeId:c.id});
   no.onclick=()=>action(async()=>{await call('decline',{challengeId:c.id});apply(await call('refresh'));});
   actions.append(yes,no);row.append(actions);frag.append(row);
  }
  if(!frag.childNodes.length)frag.append(el('p','Нет входящих вызовов.','muted'));
  box.replaceChildren(frag);
 }
 function apply(s){
  if(!s)return;const previous=snap;snap=s;claimAt=performance.now();setLock(s.locked);profileView();
  if(s.username!==lastAccount){lastAccount=s.username;history=[];friendRows=[];renderHistory();renderFriends();$('onlinePlayer').replaceChildren();}
  const sig=JSON.stringify([s.gameId,s.full?.id,s.state]);
  if(sig!==signature){
   signature=sig;const old=game;game=null;selected=null;promotion=[];awaiting=false;
   if(s.full&&s.state){
    try{
     game=readOnlineGame(s.full,s.state,s.username,Chess);receivedAt=performance.now();
     const moves=old&&lastGame===s.gameId&&game.moves.length===old.moves.length+1&&old.moves.every((u,i)=>u===game.moves[i])?[game.game.history({verbose:true}).at(-1)]:[];
     lastGame=s.gameId;draw(moves);
     if(moves.length)playSound(soundForMove(moves[0],game.game));
     else if(old&&!old.done&&game.done)playSound('end');
    }catch(e){say(e.message+' · открой Lichess для этой партии');}
   }else clearBoardView($('onlineBoard'));
  }else if(previous.needsSync!==s.needsSync||previous.locked!==s.locked)draw();
  const ck=JSON.stringify([s.incoming,s.locked,s.eventReady]);if(ck!==challengeKey){challengeKey=ck;challenges();}
  if(s.notice&&!error)text('onlineStatus',s.notice);else if(!error)text('onlineStatus',s.connected?'':'Войди через Lichess, чтобы играть онлайн.');
  if(!s.needsSync)syncAttempt='';
  controls();
 }
 function handlePush(s){
  apply(s);
  if(s?.connected&&s.needsSync&&!s.waiting&&s.terminal&&syncAttempt!==s.gameId+':'+s.notice){
   syncAttempt=s.gameId+':'+s.notice;
   action(refresh);
  }
 }
 async function action(fn){if(working)return;working=true;error='';controls();try{await fn();}catch(e){say(e.message||'Ошибка Lichess');}finally{working=false;controls();draw();}}
 async function refresh(){apply(await call('refresh'));if(!snap.needsSync){awaiting=false;draw();}}
 function begin(op,args){if(working||uiLock||!canStart())return;if(!snap.eventReady){say('Обнови подключение');return;}setLock(true);action(async()=>{try{apply(await call(op,args));}catch(e){try{apply(await call('snapshot'));}catch{}throw e;}});}
 function params(){const [minutes,increment]=$('onlineControl').value.split('+').map(Number);return {minutes,increment,rated:$('onlineRated').checked};}
 async function sendMove(move){if(sending||awaiting||working||!game||game.done||snap.needsSync||game.game.turn()!==game.color)return;sending=true;awaiting=true;selected=null;promotion=[];draw();try{await call('gameAction',{gameId:snap.gameId,action:'move',move:move.from+move.to+(move.promotion||'')});}catch(e){say(e.message);try{await refresh();}catch{}awaiting=false;}finally{sending=false;draw();}}
 function click(square){if(!game||game.done||game.game.turn()!==game.color||sending||awaiting||working||snap.needsSync||promotion.length)return;if(selected){const options=game.game.moves({square:selected,verbose:true}).filter(m=>m.to===square);if(options.length>1){promotion=options;draw();return;}if(options.length===1){sendMove(options[0]);return;}}selected=game.game.get(square)?.color===game.color&&square!==selected?square:null;draw();}
 async function gameAction(name,confirmCfg){if(!game||game.done||working||sending||snap.needsSync)return;const targetId=snap.gameId;if(confirmCfg&&!(await confirmDialog(confirmCfg)))return;if(!game||game.done||working||sending||snap.needsSync||snap.gameId!==targetId)return;action(async()=>{await call('gameAction',{gameId:targetId,action:name});});}
 function renderFriends(){
  const box=$('onlineFriends'),frag=document.createDocumentFragment();
  for(const u of friendRows){
   const name=u.username||u.id;if(!validNick(name))continue;
   const row=el('div',undefined,'online-list-row'),actions=el('div',undefined,'controls'),view=el('button','Профиль'),play=el('button','Вызов','primary'),remove=el('button','Удалить');
   row.append(el('strong',name),el('small',u.online?'В сети':'Lichess'));
   view.onclick=()=>action(async()=>showPlayer(await call('player',{user:name})));
   play.onclick=()=>{const p=params();if(matchControl(p.minutes,p.increment,true))begin('challenge',{...p,user:name});};
   remove.onclick=()=>action(async()=>{await call('unfollow',{user:name});friendRows=(await call('friends')).users||[];renderFriends();});
   actions.append(view,play,remove);row.append(actions);frag.append(row);
  }
  if(!frag.childNodes.length)frag.append(el('p','Список пуст или ещё не загружен.','muted'));
  box.replaceChildren(frag);
 }
 function showPlayer(p){
  const box=$('onlinePlayer');box.replaceChildren();const name=p.username||p.id;if(!validNick(name))return;
  box.append(el('strong',name),el('small',['blitz','rapid','classical'].map(k=>p.perfs?.[k]?.rating?k+': '+p.perfs[k].rating:null).filter(Boolean).join(' · ')));
  const row=el('div',undefined,'controls'),follow=el('button',p.following?'Удалить из друзей':'Добавить в друзья','primary'),play=el('button','Вызов'),open=el('button','Открыть профиль');
  follow.disabled=p.followable===false&&!p.following||name.toLowerCase()===snap.username.toLowerCase();
  follow.onclick=()=>action(async()=>{await call(p.following?'unfollow':'follow',{user:name});showPlayer(await call('player',{user:name}));});
  play.onclick=()=>{const q=params();if(matchControl(q.minutes,q.increment,true))begin('challenge',{...q,user:name});};
  open.onclick=()=>action(()=>call('open',{user:name}));
  row.append(follow,play,open);box.append(row);
 }
 function renderHistory(){
  const box=$('onlineHistory'),frag=document.createDocumentFragment();
  for(const g of history){
   if(!validGameId(g.id)||!['mate','resign','stalemate','timeout','draw','outoftime','cheat','variantEnd','unknownFinish'].includes(g.status)||g.variant!=='standard')continue;
   const name=c=>g.players?.[c]?.user?.name||g.players?.[c]?.user?.id||'Игрок';
   const b=el('button',undefined,'online-history-row');
   b.append(el('strong',name('white')+' — '+name('black')),el('small',(g.winner==='white'?'1–0':g.winner==='black'?'0–1':'½–½')+' · '+(g.speed||'')+' · Разобрать'));
   b.onclick=()=>openReview(g.id);frag.append(b);
  }
  if(!frag.childNodes.length)frag.append(el('p','Завершённых партий пока нет или история не загружена.','muted'));
  box.replaceChildren(frag);
 }
 function openReview(id){if(!validGameId(id)||uiLock||!canStart())return;action(async()=>{const r=await call('pgn',{gameId:id});if(!completedPgn(r.pgn,Chess))throw Error('Нужна завершённая партия с ходами');review(r.pgn,snap.username);});}

 $('onlineLogin').onclick=()=>action(async()=>{say(native?'Продолжи вход в браузере.':'Перенаправляю на Lichess…');apply(await call('login'));});
 $('onlineLogout').onclick=async()=>{if(working||uiLock)return;if(await confirmDialog({title:'Выйти из Lichess?',message:'Токен доступа будет отозван и удалён с устройства.',confirmText:'Выйти',danger:true}))action(async()=>{apply(await call('logout'));});};
 $('onlineRefresh').onclick=()=>action(refresh);$('onlineReconnect').onclick=()=>action(refresh);$('onlineGameReconnect').onclick=()=>action(refresh);
 $('onlineSeek').onclick=()=>{const p=params();if(!matchControl(p.minutes,p.increment,false)){say('Для блица нужен прямой вызов. Выбери рапид или классику.');return;}begin('seek',p);};
 $('onlineChallenge').onclick=()=>{const p=params(),user=$('onlineFriendNick').value.trim();if(!validNick(user)||!matchControl(p.minutes,p.increment,true)){say('Проверь ник и контроль времени');return;}begin('challenge',{...p,user});};
 $('onlineCancel').onclick=()=>action(async()=>apply(await call('cancel')));
 $('onlineShare').onclick=()=>action(()=>call('share'));$('onlineOpenProfile').onclick=()=>action(()=>call('open'));
 $('onlineFriendSearch').onclick=()=>action(async()=>{const user=$('onlineFriendNick').value.trim();if(!validNick(user))throw Error('Введи ник Lichess');showPlayer(await call('player',{user}));});
 $('onlineFriendsRefresh').onclick=()=>action(async()=>{friendRows=(await call('friends')).users||[];renderFriends();});
 $('onlineHistoryRefresh').onclick=()=>action(async()=>{history=(await call('history')).games||[];renderHistory();});
 $('onlineReviewGame').onclick=()=>openReview(snap.gameId);
 $('onlineResign').onclick=()=>gameAction('resign',{title:'Сдаться в онлайн-партии?',message:'Партия на Lichess завершится вашим поражением.',confirmText:'Сдаться',danger:true});
 $('onlineClaimVictory').onclick=()=>{if(snap.claimReady)gameAction('claim-victory',{title:'Потребовать победу?',message:'Соперник покинул игру. Зафиксировать победу на Lichess?',confirmText:'Потребовать победу'});};
 $('onlineClaimDraw').onclick=()=>{if(snap.claimReady)gameAction('claim-draw',{title:'Зафиксировать ничью?',message:'Завершить партию вничью из-за ухода соперника?',confirmText:'Ничья'});};
 $('onlineDraw').onclick=()=>gameAction('draw/yes');$('onlineDrawNo').onclick=()=>gameAction('draw/no');
 for(const type of ['q','r','b','n'])$('onlinePromote'+type).onclick=()=>{const m=promotion.find(x=>x.promotion===type);if(m)sendMove(m);};
 $('onlinePromotionCancel').onclick=()=>{promotion=[];draw();};

 document.addEventListener('jc-screen',e=>{
  active=e.detail==='online';
  if(active){
   controls();draw();
   if(snap.connected&&(!snap.eventReady||snap.needsSync)&&!working)action(refresh);
  }
 });

 async function poll(){
  if(polling||working||document.hidden)return;
  polling=true;
  try{
   const s=await call('snapshot');
   handlePush(s);
  }catch(e){if(active)say(e.message);}
  finally{polling=false;}
 }

 // Prevent accidental tab close during a live web Lichess game
 if(!native&&typeof globalThis.addEventListener==='function'){
  globalThis.addEventListener('beforeunload',e=>{
   if(uiLock&&game&&!game.done){e.preventDefault();e.returnValue='';}
  });
 }

 // Tick clocks and opponent-gone countdown only when online screen is visible and active
 setInterval(()=>{if(active&&(game||snap.opponentGone))tick();},250);

 if(native){
  document.addEventListener('jc-native-online-lock',()=>{setLock(true);poll();});
  document.addEventListener('jc-lichess-update',()=>poll());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(snap.connected||uiLock))poll();});
  // Fallback native poll runs only when connected and either on Online screen or locked in a game
  setInterval(()=>{if(snap.connected&&(active||uiLock))poll();},1000);
  setLock(true);
  action(async()=>{
   const s=await call('snapshot');
   if(s.connected){snap=s;try{await refresh();}catch(e){apply(await call('snapshot'));throw e;}}
   else apply(s);
  });
 }else{
  document.addEventListener('visibilitychange',()=>{
   if(!document.hidden&&snap.connected&&(snap.needsSync||!snap.eventReady)&&!working)action(refresh);
  });
  action(async()=>{
   const cb=await webClient.consumeOAuthCallback();
   if(cb.handled){
    openOnline?.();
    if(cb.error){apply(webClient.snapshot());say(cb.error);return;}
   }
   const s=webClient.snapshot();
   if(s.connected){
    snap=s;
    try{await refresh();}catch(e){apply(webClient.snapshot());throw e;}
   }else{
    apply(s);
   }
  });
 }

 return {locked:()=>uiLock};
}
