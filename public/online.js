import {Chess} from './chess.js';
import {renderBoardView,clearBoardView} from './board-view.js';
import {matchControl,validNick,validGameId,readOnlineGame,serverClock,resultText,completedPgn} from './online-core.js';
const $=id=>document.getElementById(id),native=globalThis.JohanLichess;
const pending=new Map();let seq=0;
if(native)native.onmessage=e=>{try{const r=JSON.parse(e.data),p=pending.get(r.id);if(!p)return;clearTimeout(p.timer);pending.delete(r.id);r.error?p.reject(Error(r.error)):p.resolve(r.data);}catch{}};
function call(op,args={}){if(!native)return Promise.reject(Error('Онлайн доступен в Android.'));return new Promise((resolve,reject)=>{const id=String(++seq),timer=setTimeout(()=>{pending.delete(id);reject(Error('Lichess не ответил'));},op==='login'?330000:100000);pending.set(id,{resolve,reject,timer});try{native.postMessage(JSON.stringify({id,op,...args}));}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});}
const el=(tag,value,cls)=>{const a=document.createElement(tag);if(value!==undefined)a.textContent=value;if(cls)a.className=cls;return a;};
const text=(id,value)=>{const a=$(id);value=String(value??'');if(a.textContent!==value)a.textContent=value;};
const clock=ms=>{const n=Math.ceil(ms/1000);return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};
export function initOnline({canStart,lock,review}){
 let snap={connected:false,locked:false},game=null,signature='',receivedAt=0,selected=null,promotion=[],sending=false,awaiting=false,working=false,polling=false,active=false,uiLock=false,history=[],friendRows=[],lastAccount='',error='',syncAttempt='',lastGame='',challengeKey='',absenceAt=0;
 function setLock(v){v=!!v;if(v!==uiLock){uiLock=v;lock(v);}}
 const say=s=>{error=s;text('onlineStatus',s);};
 function controls(){
  const connected=snap.connected,blocked=working||uiLock;
  $('onlineLogin').hidden=connected;$('onlineLogout').hidden=!connected;$('onlineAccount').hidden=!connected;$('onlineSocial').hidden=!connected||uiLock;$('onlineLobby').hidden=!connected||!!(game&&!game.done)||snap.waiting;
  text('onlineConnect',connected?'Lichess · '+snap.username:'Подключить Lichess');text('onlineProfileStatus',connected?'Профиль: '+snap.username:'Онлайн-игра и друзья');
  $('onlineLogin').disabled=working||uiLock||!native;$('onlineLogout').disabled=blocked;$('onlineRefresh').disabled=working||!connected;
  $('onlineSeek').disabled=blocked||!snap.eventReady||!canStart();$('onlineChallenge').disabled=blocked||!snap.eventReady||!canStart();$('onlineCancel').hidden=!snap.waiting;$('onlineCancel').disabled=working;
  $('onlineGame').hidden=!game||snap.waiting;$('onlineHistoryRefresh').disabled=blocked;$('onlineFriendSearch').disabled=blocked;$('onlineFriendsRefresh').disabled=blocked;
  $('onlineWaiting').hidden=!snap.waiting;$('onlineReconnect').hidden=!(snap.locked&&!snap.waiting&&(!game||snap.needsSync||awaiting));$('onlineAbsence').hidden=!(snap.absenceRemaining>=0||snap.forfeitPending);
 }
 function profileView(){text('onlineName',snap.username||'');const perf=snap.account?.perfs||{};for(const [type,id] of [['blitz','onlineBlitzRating'],['rapid','onlineRapidRating'],['classical','onlineClassicalRating']]){const r=perf[type];text(id,Number.isFinite(r?.rating)?r.rating+(r.prov?'?':''):'—');}}
 function tick(){
  if(snap.forfeitPending)text('onlineAbsence','Время отсутствия истекло · ожидаю подтверждение сдачи от Lichess');
  else if(snap.absenceRemaining>=0)text('onlineAbsence','Возвращение в игру: '+Math.max(0,Math.ceil((snap.absenceRemaining-(performance.now()-absenceAt))/1000))+' с');
  if(!game)return;const times=serverClock(game,Math.max(0,performance.now()-receivedAt));text('onlineTopClock',clock(times[game.color==='w'?'b':'w']));text('onlineBottomClock',clock(times[game.color]));}
 function draw(animateMoves=[]){
  if(!game){clearBoardView($('onlineBoard'));return;}
  const mine=game.color,turn=game.game.turn(),playable=!game.done&&turn===mine&&!snap.forfeitPending&&!(snap.absenceRemaining>=0)&&!snap.needsSync&&!sending&&!awaiting&&!working&&!promotion.length;
  const targets=[]; // No assistance or legal-move dots in rated or casual online play.
  renderBoardView($('onlineBoard'),{rows:game.game.board(),flip:mine==='b',interactive:true,disabled:!playable,onClick:click,selected,targets,last:game.game.history({verbose:true}).at(-1),animateMoves});
  $('onlinePromotion').hidden=!promotion.length;
  const player=c=>c==='w'?game.white:game.black,label=p=>[p?.name||p?.id||'Игрок',p?.rating].filter(Boolean).join(' · ');
  text('onlineTop',label(player(mine==='w'?'b':'w')));text('onlineBottom',label(player(mine)));
  text('onlineTurn',game.done?resultText(game):snap.forfeitPending?'Сдача ожидает подтверждения':snap.needsSync?'Связь потеряна · обнови':awaiting?'Ожидаю подтверждение Lichess':resultText(game));
  $('onlineGameActions').hidden=game.done;$('onlineReviewGame').hidden=!game.done||!game.moves.length||snap.locked;
  $('onlineDrawNo').hidden=!game.drawOffer;text('onlineDraw',game.drawOffer?'Принять ничью':'Предложить ничью');
  for(const id of ['onlineResign','onlineDraw','onlineDrawNo'])$(id).disabled=working||sending||game.done||snap.needsSync||snap.forfeitPending;
  tick();
 }
 function challenges(){const box=$('onlineChallenges'),frag=document.createDocumentFragment();
  for(const c of (snap.incoming||[]).slice(0,20)){if(!validGameId(c.id))continue;const row=el('div',undefined,'online-list-row'),actions=el('div',undefined,'controls'),yes=el('button','Принять','primary'),no=el('button','Отклонить');row.append(el('strong',c.challenger?.name||c.challenger?.id||'Игрок'),el('small',c.timeControl?.show||c.speed||'Вызов'));yes.disabled=uiLock||!snap.eventReady;yes.onclick=()=>begin('accept',{challengeId:c.id});no.onclick=()=>action(async()=>{await call('decline',{challengeId:c.id});apply(await call('refresh'));});actions.append(yes,no);row.append(actions);frag.append(row);}
  if(!frag.childNodes.length)frag.append(el('p','Нет входящих вызовов.','muted'));box.replaceChildren(frag);}
 function apply(s){
  if(!s)return;const previous=snap;snap=s;absenceAt=performance.now();setLock(s.locked);profileView();
  if(s.username!==lastAccount){lastAccount=s.username;history=[];friendRows=[];renderHistory();renderFriends();$('onlinePlayer').replaceChildren();}
  const sig=JSON.stringify([s.gameId,s.full?.id,s.state]);
  if(sig!==signature){signature=sig;const old=game;game=null;selected=null;promotion=[];awaiting=false;
   if(s.full&&s.state){try{game=readOnlineGame(s.full,s.state,s.username,Chess);receivedAt=performance.now();const moves=old&&lastGame===s.gameId&&game.moves.length===old.moves.length+1&&old.moves.every((u,i)=>u===game.moves[i])?[game.game.history({verbose:true}).at(-1)]:[];lastGame=s.gameId;draw(moves);}catch(e){say(e.message+' · открой Lichess для этой партии');}}else clearBoardView($('onlineBoard'));
  }else if(previous.needsSync!==s.needsSync||previous.locked!==s.locked||previous.forfeitPending!==s.forfeitPending||(previous.absenceRemaining>=0)!==(s.absenceRemaining>=0))draw();
  const ck=JSON.stringify([s.incoming,s.locked,s.eventReady]);if(ck!==challengeKey){challengeKey=ck;challenges();}
  if(s.notice&&!error)text('onlineStatus',s.notice);else if(!error)text('onlineStatus','');if(!s.needsSync)syncAttempt='';controls();
 }
 async function action(fn){if(working)return;working=true;error='';controls();try{await fn();}catch(e){say(e.message||'Ошибка Lichess');}finally{working=false;controls();draw();}}
 async function refresh(){apply(await call('refresh'));if(!snap.needsSync){awaiting=false;draw();}}
 function begin(op,args){if(working||uiLock||!canStart())return;if(!snap.eventReady){say('Обнови подключение');return;}setLock(true);action(async()=>{try{apply(await call(op,args));}catch(e){try{apply(await call('snapshot'));}catch{}throw e;}});}
 function params(){const [minutes,increment]=$('onlineControl').value.split('+').map(Number);return {minutes,increment,rated:$('onlineRated').checked};}
 async function sendMove(move){if(sending||awaiting||working||!game||game.done||snap.needsSync||snap.forfeitPending||snap.absenceRemaining>=0||game.game.turn()!==game.color)return;sending=true;awaiting=true;selected=null;promotion=[];draw();try{await call('gameAction',{gameId:snap.gameId,action:'move',move:move.from+move.to+(move.promotion||'')});}catch(e){say(e.message);try{await refresh();}catch{}awaiting=false;}finally{sending=false;draw();}}
 function click(square){if(!game||game.done||game.game.turn()!==game.color||sending||awaiting||working||snap.needsSync||snap.forfeitPending||snap.absenceRemaining>=0||promotion.length)return;if(selected){const options=game.game.moves({square:selected,verbose:true}).filter(m=>m.to===square);if(options.length>1){promotion=options;draw();return;}if(options.length===1){sendMove(options[0]);return;}}selected=game.game.get(square)?.color===game.color&&square!==selected?square:null;draw();}
 function gameAction(name,confirmText){if(!game||game.done||working||sending||snap.needsSync||confirmText&&!confirm(confirmText))return;action(async()=>{await call('gameAction',{gameId:snap.gameId,action:name});});}
 function renderFriends(){const box=$('onlineFriends'),frag=document.createDocumentFragment();for(const u of friendRows){const name=u.username||u.id;if(!validNick(name))continue;const row=el('div',undefined,'online-list-row'),actions=el('div',undefined,'controls'),view=el('button','Профиль'),play=el('button','Вызов','primary'),remove=el('button','Удалить');row.append(el('strong',name),el('small',u.online?'В сети':'Lichess'));view.onclick=()=>action(async()=>showPlayer(await call('player',{user:name})));play.onclick=()=>{const p=params();if(matchControl(p.minutes,p.increment,true))begin('challenge',{...p,user:name});};remove.onclick=()=>action(async()=>{await call('unfollow',{user:name});friendRows=(await call('friends')).users||[];renderFriends();});actions.append(view,play,remove);row.append(actions);frag.append(row);}if(!frag.childNodes.length)frag.append(el('p','Список пуст или ещё не загружен.','muted'));box.replaceChildren(frag);}
 function showPlayer(p){const box=$('onlinePlayer');box.replaceChildren();const name=p.username||p.id;if(!validNick(name))return;box.append(el('strong',name),el('small',['blitz','rapid','classical'].map(k=>p.perfs?.[k]?.rating?k+': '+p.perfs[k].rating:null).filter(Boolean).join(' · ')));const row=el('div',undefined,'controls'),follow=el('button',p.following?'Удалить из друзей':'Добавить в друзья','primary'),play=el('button','Вызов'),open=el('button','Открыть профиль');follow.disabled=p.followable===false&&!p.following||name.toLowerCase()===snap.username.toLowerCase();follow.onclick=()=>action(async()=>{await call(p.following?'unfollow':'follow',{user:name});showPlayer(await call('player',{user:name}));});play.onclick=()=>{const q=params();if(matchControl(q.minutes,q.increment,true))begin('challenge',{...q,user:name});};open.onclick=()=>action(()=>call('open',{user:name}));row.append(follow,play,open);box.append(row);}
 function renderHistory(){const box=$('onlineHistory'),frag=document.createDocumentFragment();for(const g of history){if(!validGameId(g.id)||!['mate','resign','stalemate','timeout','draw','outoftime','cheat','variantEnd','unknownFinish'].includes(g.status)||g.variant!=='standard')continue;const name=c=>g.players?.[c]?.user?.name||g.players?.[c]?.user?.id||'Игрок';const b=el('button',undefined,'online-history-row');b.append(el('strong',name('white')+' — '+name('black')),el('small',(g.winner==='white'?'1–0':g.winner==='black'?'0–1':'½–½')+' · '+(g.speed||'')+' · Разобрать'));b.onclick=()=>openReview(g.id);frag.append(b);}if(!frag.childNodes.length)frag.append(el('p','Завершённых партий пока нет или история не загружена.','muted'));box.replaceChildren(frag);}
 function openReview(id){if(!validGameId(id)||uiLock||!canStart())return;action(async()=>{const r=await call('pgn',{gameId:id});if(!completedPgn(r.pgn,Chess))throw Error('Нужна завершённая партия с ходами');review(r.pgn,snap.username);});}
 $('onlineLogin').onclick=()=>action(async()=>{say('Продолжи вход в браузере.');apply(await call('login'));});
 $('onlineLogout').onclick=()=>action(async()=>{if(confirm('Отключить аккаунт Lichess?'))apply(await call('logout'));});
 $('onlineRefresh').onclick=()=>action(refresh);$('onlineReconnect').onclick=()=>action(refresh);
 $('onlineSeek').onclick=()=>{const p=params();if(!matchControl(p.minutes,p.increment,false)){say('Для блица нужен прямой вызов. Выбери рапид или классику.');return;}begin('seek',p);};
 $('onlineChallenge').onclick=()=>{const p=params(),user=$('onlineFriendNick').value.trim();if(!validNick(user)||!matchControl(p.minutes,p.increment,true)){say('Проверь ник и контроль времени');return;}begin('challenge',{...p,user});};
 $('onlineCancel').onclick=()=>action(async()=>apply(await call('cancel')));
 $('onlineShare').onclick=()=>action(()=>call('share'));$('onlineOpenProfile').onclick=()=>action(()=>call('open'));
 $('onlineFriendSearch').onclick=()=>action(async()=>{const user=$('onlineFriendNick').value.trim();if(!validNick(user))throw Error('Введи ник Lichess');showPlayer(await call('player',{user}));});
 $('onlineFriendsRefresh').onclick=()=>action(async()=>{friendRows=(await call('friends')).users||[];renderFriends();});
 $('onlineHistoryRefresh').onclick=()=>action(async()=>{history=(await call('history')).games||[];renderHistory();});
 $('onlineReviewGame').onclick=()=>openReview(snap.gameId);
 $('onlineResign').onclick=()=>{if(game&&!game.done&&!snap.forfeitPending&&confirm('Сдаться в онлайн-партии?'))action(async()=>apply(await call('forfeit')));};$('onlineDraw').onclick=()=>gameAction('draw/yes');$('onlineDrawNo').onclick=()=>gameAction('draw/no');
 for(const type of ['q','r','b','n'])$('onlinePromote'+type).onclick=()=>{const m=promotion.find(x=>x.promotion===type);if(m)sendMove(m);};
 $('onlinePromotionCancel').onclick=()=>{promotion=[];draw();};
 document.addEventListener('jc-screen',e=>{active=e.detail==='online';if(active){controls();draw();}});
 if(!native){say('Для онлайн-игры нужна Android-сборка.');$('onlineLogin').disabled=true;return {locked:()=>false};}
 async function poll(){if(polling||working)return;polling=true;try{const s=await call('snapshot');apply(s);if(s.connected&&s.needsSync&&!s.waiting&&s.terminal&&syncAttempt!==s.gameId+':'+s.notice){syncAttempt=s.gameId+':'+s.notice;action(refresh);}}catch(e){if(active)say(e.message);}finally{polling=false;}}
 action(async()=>{const s=await call('snapshot');apply(s);if(s.connected){setLock(true);try{await refresh();}catch(e){apply(await call('snapshot'));throw e;}}});
 setInterval(poll,500);setInterval(()=>{if(active)tick();},200);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
 return {locked:()=>uiLock};
}
