import {Chess} from './chess.js';
import {renderBoardView,clearBoardView,roundMotionFactor,decoratePromotionButtons,getBoardMotion,setBoardMotion} from './board-view.js';
import {findKingSquare,renderMaterial} from './material.js';
import {playSound,soundForMove,isSoundEnabled,saveSoundEnabled} from './sound.js';
import {confirmDialog} from './dialog.js';
import {liveClockText} from './training-core.js';
import {matchControl,validNick,validGameId,readOnlineGame,firstMoveRemaining,serverClock,resultText,completedPgn} from './online-core.js';
import {createWebLichess} from './lichess-web.js';

const $=id=>document.getElementById(id),native=globalThis.JohanLichess;
const pending=new Map();let seq=0;
if(native)native.onmessage=e=>{try{const r=JSON.parse(e.data),p=pending.get(r.id);if(!p)return;clearTimeout(p.timer);pending.delete(r.id);r.error?p.reject(Error(r.error)):p.resolve(r.data);}catch{}};
function nativeCall(op,args={}){return new Promise((resolve,reject)=>{const id=String(++seq),timer=setTimeout(()=>{pending.delete(id);reject(Error('Lichess не ответил'));},op==='login'?330000:100000);pending.set(id,{resolve,reject,timer});try{native.postMessage(JSON.stringify({id,op,...args}));}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});}

const el=(tag,value,cls)=>{const a=document.createElement(tag);if(value!==undefined)a.textContent=value;if(cls)a.className=cls;return a;};
const text=(id,value)=>{const a=$(id);if(!a)return;value=String(value??'');if(a.textContent!==value)a.textContent=value;};
function buildFrames(initialFen,moves){
 const c=initialFen&&initialFen!=='startpos'?new Chess(initialFen):new Chess();
 const frames=[{fen:c.fen(),last:null}];
 const sans=[];
 for(const u of moves){
  const m=c.move({from:u.slice(0,2),to:u.slice(2,4),...(u.length===5?{promotion:u[4]}:{})});
  if(!m)break;
  sans.push(m.san);
  frames.push({fen:c.fen(),last:m});
 }
 return {frames,sans};
}
function statusReason(status){
 return ({mate:'Мат',resign:'Сдача',stalemate:'Пат',timeout:'Время истекло',outoftime:'Время истекло',draw:'Ничья',aborted:'Партия отменена',noStart:'Партия не началась'})[status]||'Партия завершена';
}

export function initOnline({canStart,lock,review,openOnline}){
 let snap={connected:false,locked:false},game=null,signature='',receivedAt=0,selected=null,promotion=[],sending=false,awaiting=false,awaitingSlow=false,awaitTimer=null,optimistic=null,working=false,polling=false,pollQueued=false,active=false,uiLock=false,history=[],friendRows=[],lastAccount='',error='',syncAttempt='',lastGame='',challengeKey='',claimAt=0;
 let frames=[],sans=[],renderedStripSig='',viewPly=null,hasUnreadMove=false,flipped=false,optionsOpen=false,chatOpen=false,viewingFinished=false,resultDismissedFor='',chatLines=[],chatSig='',seenChatCount=0,chatSending=false;
 const webClient=native?null:createWebLichess({onUpdate:s=>handlePush(s)});
 const call=(op,args={})=>native?nativeCall(op,args):webClient.call(op,args);

 function clearOptimistic(){if(awaitTimer!==null){clearTimeout(awaitTimer);awaitTimer=null;}optimistic=null;awaiting=false;awaitingSlow=false;}
 function setLock(v){v=!!v;if(v!==uiLock){uiLock=v;lock(v);}}
 const say=s=>{error=s;text('onlineStatus',s);};
 function syncSheetPrefs(){
  if($('onlineSoundToggle'))$('onlineSoundToggle').checked=isSoundEnabled();
  if($('onlineMotionSelect'))$('onlineMotionSelect').value=getBoardMotion();
 }
 function setOptionsOpen(open){
  optionsOpen=!!open;
  if(optionsOpen){chatOpen=false;if($('onlineChatSheet'))$('onlineChatSheet').hidden=true;syncSheetPrefs();}
  if($('onlineOptionsSheet'))$('onlineOptionsSheet').hidden=!optionsOpen;
 }
 function renderOnlineChat(){
  const box=$('onlineChatLog');if(!box)return;
  const sig=JSON.stringify(chatLines);
  if(chatSig!==sig){
   chatSig=sig;
   const frag=document.createDocumentFragment();
   const me=String(snap.username||'').toLowerCase();
   for(const msg of chatLines){
    const mine=String(msg.username||'').toLowerCase()===me;
    const bubble=el('div',undefined,'chat-bubble '+(mine?'mine':'theirs'));
    bubble.append(el('small',msg.username||'Игрок'),el('div',msg.text||''));
    frag.append(bubble);
   }
   if(!frag.childNodes.length)frag.append(el('p','Пока нет сообщений. Пожелай сопернику удачи!','chat-empty'));
   box.replaceChildren(frag);
   box.scrollTop=box.scrollHeight;
  }
  const me=String(snap.username||'').toLowerCase();
  const unread=!chatOpen&&chatLines.slice(seenChatCount).some(m=>String(m.username||'').toLowerCase()!==me);
  if($('onlineChatBadge'))$('onlineChatBadge').hidden=!unread;
  const disabled=!game||snap.needsSync||chatSending;
  if($('onlineChatInput'))$('onlineChatInput').disabled=disabled;
  if($('onlineChatSend'))$('onlineChatSend').disabled=disabled;
  for(const b of document.querySelectorAll('#onlineChatQuick button'))b.disabled=disabled;
 }
 function setChatOpen(open){
  chatOpen=!!open;
  if(chatOpen){
   optionsOpen=false;
   if($('onlineOptionsSheet'))$('onlineOptionsSheet').hidden=true;
   seenChatCount=chatLines.length;
   if($('onlineChatBadge'))$('onlineChatBadge').hidden=true;
   renderOnlineChat();
  }
  if($('onlineChatSheet'))$('onlineChatSheet').hidden=!chatOpen;
 }
 async function sendChat(raw){
  const txt=String(raw||'').trim();
  if(!txt||txt.length>140||!game||snap.needsSync||chatSending)return;
  chatSending=true;renderOnlineChat();
  try{
   await call('gameAction',{gameId:snap.gameId,action:'chat',text:txt});
   if($('onlineChatInput'))$('onlineChatInput').value='';
  }catch(e){
   say(e.message||'Не удалось отправить сообщение');
   controls();
  }finally{
   chatSending=false;renderOnlineChat();
  }
 }
 function showBoardShell(){
  return !!game&&!snap.waiting&&(!game.done||viewingFinished);
 }
 function controls(){
  const connected=snap.connected,blocked=working||uiLock,inBoard=showBoardShell();
  $('onlineLogin').hidden=connected;$('onlineLogout').hidden=!connected;$('onlineAccount').hidden=!connected||inBoard;$('onlineSocial').hidden=!connected||uiLock||inBoard;$('onlineLobby').hidden=!connected||!!(game&&!game.done)||snap.waiting||inBoard;
  text('onlineProfileStatus',connected?snap.username:'Подключить');
  $('onlineLogin').disabled=working||uiLock;$('onlineLogout').disabled=blocked;$('onlineRefresh').disabled=working||!connected;
  $('onlineSeek').disabled=blocked||!snap.eventReady||!canStart();$('onlineChallenge').disabled=blocked||!snap.eventReady||!canStart();$('onlineCancel').hidden=!snap.waiting;$('onlineCancel').disabled=working;
  $('onlineGame').hidden=!inBoard;
  document.body.classList.toggle('online-board-focus',inBoard&&(uiLock||viewingFinished));
  $('onlineHistoryRefresh').disabled=blocked;$('onlineFriendSearch').disabled=blocked;$('onlineFriendsRefresh').disabled=blocked;
  $('onlineWaiting').hidden=!snap.waiting;$('onlineReconnect').hidden=!(snap.locked&&!snap.waiting&&(!game||snap.needsSync||awaitingSlow));$('onlineOpponentGone').hidden=!snap.opponentGone||!game||game.done;
  $('onlineClaimActions').hidden=!snap.claimReady||!game||game.done||snap.needsSync;
  for(const id of ['onlineClaimVictory','onlineClaimDraw'])$(id).disabled=working||sending||!snap.claimReady;
  const showSlow=awaitingSlow&&awaiting;
  $('onlineGameNotice').hidden=!(game&&!game.done&&(snap.needsSync||showSlow||error));$('onlineGameNoticeText').textContent=error||(snap.needsSync?'Связь потеряна':showSlow?'Ожидаю подтверждение Lichess':'');$('onlineGameReconnect').hidden=!(snap.needsSync||showSlow);
  if($('onlineSignal'))$('onlineSignal').classList.toggle('offline',!!snap.needsSync);
 }
 function profileView(){text('onlineName',snap.username||'');const perf=snap.account?.perfs||{};for(const [type,id] of [['blitz','onlineBlitzRating'],['rapid','onlineRapidRating'],['classical','onlineClassicalRating']]){const r=perf[type];text(id,Number.isFinite(r?.rating)?r.rating+(r.prov?'?':''):'—');}}
 function tick(){
  if(snap.opponentGone){
   const seconds=Math.max(0,Math.ceil((snap.claimRemaining-(performance.now()-claimAt))/1000));
   text('onlineOpponentGone',snap.claimReady?'Соперник покинул игру. Можно потребовать победу или ничью.':snap.claimRemaining>=0?'Соперник отключился · ожидание '+seconds+' с':'Соперник отключился · ожидаем Lichess');
  }
  if(!game)return;
  const viewGame=optimistic?{...game,game:optimistic.game,moves:[...game.moves,optimistic.uci]}:game;
  const elapsed=Math.max(0,performance.now()-receivedAt);
  const times=serverClock(viewGame,elapsed);
  const topColor=flipped?game.color:(game.color==='w'?'b':'w');
  const bottomColor=topColor==='w'?'b':'w';
  const topMs=times[topColor],bottomMs=times[bottomColor];
  text('onlineTopClock',liveClockText(topMs));text('onlineBottomClock',liveClockText(bottomMs));
  $('onlineTopClock').classList.toggle('low-time',!game.done&&topMs<20000);
  $('onlineBottomClock').classList.toggle('low-time',!game.done&&bottomMs<20000);
  if(!game.done&&!snap.needsSync&&!awaitingSlow){
   const fm=firstMoveRemaining(viewGame,elapsed);
   if(fm!==null){
    const sec=Math.ceil(fm/1000);
    const mineTurn=viewGame.game.turn()===game.color;
    text('onlineTurn',mineTurn?`Твой 1-й ход · ${sec} с`:`Ждём 1-й ход соперника · ${sec} с`);
   }
  }
 }
 function syncMoveStrip(liveSans,activePly){
  const list=$('onlineMoveStrip');if(!list)return;
  const sig=liveSans.join(' ');
  if(renderedStripSig!==sig){
   renderedStripSig=sig;
   const frag=document.createDocumentFragment();
   for(let i=0;i<liveSans.length;i++){
    const b=document.createElement('button');
    b.type='button';
    b.dataset.ply=String(i+1);
    b.textContent=(i%2===0?Math.floor(i/2)+1+'. ':'')+liveSans[i];
    b.onclick=()=>jumpPly(i+1);
    frag.append(b);
   }
   list.replaceChildren(frag);
   list.scrollLeft=list.scrollWidth;
  }
  const prev=list.querySelector('[aria-current="step"]');
  if(prev)prev.removeAttribute('aria-current');
  const cur=activePly>0?list.children[activePly-1]:null;
  if(cur){
   cur.setAttribute('aria-current','step');
   list.scrollLeft=Math.max(0,cur.offsetLeft-list.offsetLeft-(list.clientWidth-cur.offsetWidth)/2);
  }else list.scrollLeft=0;
 }
 function currentFrames(){
  if(!optimistic)return {list:frames,sansList:sans};
  return {list:[...frames,{fen:optimistic.game.fen(),last:optimistic.last}],sansList:[...sans,optimistic.last.san]};
 }
 function jumpPly(target){
  if(!game)return;
  const {list}=currentFrames();
  const max=list.length-1;
  const clamped=Math.max(0,Math.min(target,max));
  const prev=viewPly===null?max:viewPly;
  if(clamped===prev)return;
  selected=null;
  viewPly=clamped>=max?null:clamped;
  if(viewPly===null)hasUnreadMove=false;
  const step=clamped===prev+1&&list[clamped]?.last?[list[clamped].last]:[];
  if(step.length)playSound(soundForMove(step[0]));
  draw(step);
 }
 function draw(animateMoves=[]){
  if(!game){clearBoardView($('onlineBoard'));return;}
  const {list,sansList}=currentFrames();
  const maxPly=Math.max(0,list.length-1);
  const browsing=viewPly!==null&&viewPly<maxPly;
  const displayPly=browsing?viewPly:maxPly;
  const frame=list[displayPly]||list[maxPly];
  const liveChess=optimistic?optimistic.game:game.game;
  const displayChess=browsing&&frame?new Chess(frame.fen):liveChess;
  const mine=game.color,turn=liveChess.turn(),livePlayable=!browsing&&!game.done&&turn===mine&&!snap.needsSync&&!sending&&!awaiting&&!working&&!promotion.length;
  const targets=selected&&livePlayable?liveChess.moves({square:selected,verbose:true}).map(m=>m.to):[];
  const rows=displayChess.board(),checkSquare=displayChess.isCheck()?findKingSquare(rows,displayChess.turn()):null;
  const lastMove=frame?.last||null;
  const boardFlip=flipped?mine==='w':mine==='b';
  renderBoardView($('onlineBoard'),{rows,flip:boardFlip,interactive:true,disabled:browsing?false:!livePlayable,onClick:click,onDrop:drop,selected:browsing?null:selected,targets,last:lastMove,checkSquare,animateMoves,motionFactor:roundMotionFactor(snap.full?.clock?.initial,snap.full?.clock?.increment,game.done)});
  const topColor=boardFlip?'w':'b',bottomColor=topColor==='w'?'b':'w';
  renderMaterial($('onlineTopMat'),rows,topColor);
  renderMaterial($('onlineBottomMat'),rows,bottomColor);
  if(promotion.length)decoratePromotionButtons($('onlinePromotion'),mine,'onlinePromote');
  $('onlinePromotion').hidden=!promotion.length;
  const player=c=>c==='w'?game.white:game.black,label=p=>[p?.name||p?.id||'Игрок',p?.rating?'('+p.rating+')':''].filter(Boolean).join(' ');
  text('onlineTop',label(player(topColor)));text('onlineBottom',label(player(bottomColor)));
  const viewTurnText=game.done?resultText(game):snap.needsSync?'Связь потеряна · обнови':awaitingSlow?'Ожидаю подтверждение Lichess':turn===mine?'Твой ход':'Ход соперника';
  text('onlineTurn',viewTurnText);
  if($('onlineLivePill'))$('onlineLivePill').hidden=!browsing;
  if($('onlinePrevMove'))$('onlinePrevMove').disabled=displayPly<=0;
  if($('onlineNextMove'))$('onlineNextMove').disabled=!browsing;
  if($('onlineLiveDot'))$('onlineLiveDot').hidden=!hasUnreadMove;
  if($('onlineDrawBanner'))$('onlineDrawBanner').hidden=!game.drawOffer||game.done;
  $('onlineReviewGame').hidden=!game.done||!game.moves.length||snap.locked;
  if($('onlineDraw')?.querySelector('span'))$('onlineDraw').querySelector('span').textContent=game.drawOffer?'Принять ничью':'Предложить ничью';
  syncMoveStrip(sansList,displayPly);
  $('onlineTopClock').classList.toggle('running',!game.done&&turn===topColor);$('onlineBottomClock').classList.toggle('running',!game.done&&turn===bottomColor);
  const canAbort=!game.done&&game.moves.length<2;
  if($('onlineAbort'))$('onlineAbort').hidden=!canAbort;
  if($('onlineResign'))$('onlineResign').hidden=game.done||canAbort;
  if($('onlineDraw'))$('onlineDraw').hidden=game.done||canAbort;
  for(const id of ['onlineAbort','onlineResign','onlineDraw','onlineDrawNo','onlineDrawAccept']){if($(id))$(id).disabled=working||sending||game.done||snap.needsSync;}
  if($('onlineResultCard')){
   const showRes=game.done&&viewingFinished&&resultDismissedFor!==snap.gameId;
   $('onlineResultCard').hidden=!showRes;
   if(showRes){
    text('onlineResultTitle',resultText(game));
    text('onlineResultSub',statusReason(game.status));
    if($('onlineResultReview'))$('onlineResultReview').hidden=!game.moves.length||snap.locked;
   }
  }
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
   signature=sig;const old=game,prevOpt=optimistic,sameGame=!!(old&&lastGame===s.gameId);
   game=null;selected=null;promotion=[];clearOptimistic();
   if(s.full&&s.state){
    try{
     game=readOnlineGame(s.full,s.state,s.username,Chess);receivedAt=performance.now();
     const built=buildFrames(s.full.initialFen,game.moves);
     frames=built.frames;sans=built.sans;
     if(!sameGame){flipped=false;viewPly=null;hasUnreadMove=false;resultDismissedFor='';seenChatCount=0;setOptionsOpen(false);setChatOpen(false);}
     if(!game.done)viewingFinished=true;
     else if(sameGame&&!old.done){viewingFinished=true;resultDismissedFor='';setOptionsOpen(false);}
     const matchedOpt=prevOpt&&sameGame&&game.moves.length>prevOpt.baseLen&&game.moves[prevOpt.baseLen]===prevOpt.uci;
     let moves=[];
     if(matchedOpt){
      if(game.moves.length===prevOpt.baseLen+2)moves=[game.game.history({verbose:true}).at(-1)];
     }else if(sameGame&&game.moves.length===old.moves.length+1&&old.moves.every((u,i)=>u===game.moves[i])){
      moves=[game.game.history({verbose:true}).at(-1)];
     }
     const browsing=viewPly!==null&&viewPly<frames.length-1;
     if(browsing&&moves.length)hasUnreadMove=true;
     lastGame=s.gameId;draw(browsing?[]:moves);
     if(moves.length)playSound(soundForMove(moves[0],game.game));
     else if(sameGame&&!old.done&&game.done&&!matchedOpt)playSound('end');
    }catch(e){say(e.message+' · открой Lichess для этой партии');}
   }else{frames=[];sans=[];viewPly=null;hasUnreadMove=false;viewingFinished=false;chatLines=[];seenChatCount=0;clearBoardView($('onlineBoard'));}
  }else if(previous.needsSync!==s.needsSync||previous.locked!==s.locked)draw();
  chatLines=Array.isArray(s.chat)?s.chat:[];
  if(chatOpen)seenChatCount=chatLines.length;
  renderOnlineChat();
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
 async function action(fn){if(working)return;working=true;error='';controls();try{await fn();}catch(e){say(e.message||'Ошибка Lichess');}finally{working=false;controls();draw();if(native&&pollQueued&&!document.hidden){pollQueued=false;poll();}}}
 async function refresh(){apply(await call('refresh'));if(!snap.needsSync){clearOptimistic();draw();}}
 function begin(op,args){if(working||uiLock||!canStart())return;if(!snap.eventReady){say('Обнови подключение');return;}setLock(true);action(async()=>{try{apply(await call(op,args));}catch(e){try{apply(await call('snapshot'));}catch{}throw e;}});}
 function params(){const [minutes,increment]=$('onlineControl').value.split('+').map(Number);return {minutes,increment,rated:$('onlineRated').checked};}
 async function sendMove(move,via='tap'){
  if(sending||awaiting||working||!game||game.done||snap.needsSync||game.game.turn()!==game.color)return;
  const uci=move.from+move.to+(move.promotion||'');
  const preview=new Chess();
  const initialFen=snap.full?.initialFen;
  if(initialFen&&initialFen!=='startpos')preview.load(initialFen);
  for(const u of game.moves)preview.move({from:u.slice(0,2),to:u.slice(2,4),...(u.length===5?{promotion:u[4]}:{})});
  const applied=preview.move({from:move.from,to:move.to,...(move.promotion?{promotion:move.promotion}:{})});
  if(!applied)return;
  sending=true;awaiting=true;awaitingSlow=false;selected=null;promotion=[];viewPly=null;hasUnreadMove=false;
  optimistic={baseLen:game.moves.length,uci,game:preview,last:applied};
  if(awaitTimer!==null)clearTimeout(awaitTimer);
  awaitTimer=setTimeout(()=>{if(awaiting){awaitingSlow=true;controls();draw();}},1500);
  draw([{...applied,dragged:via==='drag'}]);
  playSound(soundForMove(applied,preview));
  controls();
  try{
   await call('gameAction',{gameId:snap.gameId,action:'move',move:uci});
  }catch(e){
   clearOptimistic();
   playSound('illegal');
   say(e.message);
   try{await refresh();}catch{}
  }finally{
   sending=false;
   controls();
   draw();
  }
 }
 function drop(from,to){
  if(!game)return;
  if(viewPly!==null){jumpPly(currentFrames().list.length-1);return;}
  if(game.done||game.game.turn()!==game.color||sending||awaiting||working||snap.needsSync||promotion.length)return;
  const options=game.game.moves({square:from,verbose:true}).filter(m=>m.to===to);
  if(options.length>1){promotion=options;draw();return;}
  if(options.length===1){sendMove(options[0],'drag');return;}
 }
 function click(square){
  if(!game)return;
  if(viewPly!==null){jumpPly(currentFrames().list.length-1);return;}
  if(game.done||game.game.turn()!==game.color||sending||awaiting||working||snap.needsSync||promotion.length)return;
  if(selected){const options=game.game.moves({square:selected,verbose:true}).filter(m=>m.to===square);if(options.length>1){promotion=options;draw();return;}if(options.length===1){sendMove(options[0],'tap');return;}}
  selected=game.game.get(square)?.color===game.color&&square!==selected?square:null;draw();
 }
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
 function openReview(id){if(!validGameId(id)||uiLock||!canStart())return;viewingFinished=false;controls();action(async()=>{const r=await call('pgn',{gameId:id});if(!completedPgn(r.pgn,Chess))throw Error('Нужна завершённая партия с ходами');review(r.pgn,snap.username);});}
 function leaveFinishedBoard(){viewingFinished=false;setOptionsOpen(false);setChatOpen(false);controls();}

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
 if($('onlineResultReview'))$('onlineResultReview').onclick=()=>openReview(snap.gameId);
 if($('onlineResultLobby'))$('onlineResultLobby').onclick=leaveFinishedBoard;
 if($('onlineResultClose'))$('onlineResultClose').onclick=()=>{resultDismissedFor=snap.gameId;draw();};
 if($('onlineBackBtn'))$('onlineBackBtn').onclick=()=>{if(game?.done)leaveFinishedBoard();else setOptionsOpen(true);};
 if($('onlineOptionsBtn'))$('onlineOptionsBtn').onclick=()=>setOptionsOpen(true);
 if($('onlineOptionsClose'))$('onlineOptionsClose').onclick=()=>setOptionsOpen(false);
 if($('onlineOptionsSheet'))$('onlineOptionsSheet').onclick=e=>{if(e.target===$('onlineOptionsSheet'))setOptionsOpen(false);};
 if($('onlineChatBtn'))$('onlineChatBtn').onclick=()=>setChatOpen(true);
 if($('onlineChatClose'))$('onlineChatClose').onclick=()=>setChatOpen(false);
 if($('onlineChatSheet'))$('onlineChatSheet').onclick=e=>{if(e.target===$('onlineChatSheet'))setChatOpen(false);};
 if($('onlineChatForm'))$('onlineChatForm').onsubmit=e=>{e.preventDefault();sendChat($('onlineChatInput')?.value);};
 for(const b of document.querySelectorAll('#onlineChatQuick button'))b.onclick=()=>sendChat(b.dataset.msg);
 if($('onlinePrevMove'))$('onlinePrevMove').onclick=()=>{const {list}=currentFrames();const cur=viewPly===null?list.length-1:viewPly;jumpPly(cur-1);};
 if($('onlineNextMove'))$('onlineNextMove').onclick=()=>{const {list}=currentFrames();const cur=viewPly===null?list.length-1:viewPly;jumpPly(cur+1);};
 if($('onlineLivePill'))$('onlineLivePill').onclick=()=>jumpPly(currentFrames().list.length-1);
 if($('onlineFlipToggle'))$('onlineFlipToggle').onclick=()=>{flipped=!flipped;setOptionsOpen(false);draw();};
 if($('onlineSoundToggle'))$('onlineSoundToggle').onchange=e=>{saveSoundEnabled(e.target.checked);const p=$('soundEnabled');if(p)p.checked=e.target.checked;if(e.target.checked)playSound('move');};
 if($('onlineMotionSelect'))$('onlineMotionSelect').onchange=e=>{setBoardMotion(e.target.value);};
 if($('onlineSignal'))$('onlineSignal').onclick=()=>action(refresh);
 if($('onlineAbort'))$('onlineAbort').onclick=()=>{setOptionsOpen(false);gameAction('abort',{title:'Отменить партию?',message:'Партия будет отменена на Lichess без изменения рейтинга.',confirmText:'Отменить партию'});};
 $('onlineResign').onclick=()=>{setOptionsOpen(false);gameAction('resign',{title:'Сдаться в онлайн-партии?',message:'Партия на Lichess завершится вашим поражением.',confirmText:'Сдаться',danger:true});};
 $('onlineClaimVictory').onclick=()=>{if(snap.claimReady)gameAction('claim-victory',{title:'Потребовать победу?',message:'Соперник покинул игру. Зафиксировать победу на Lichess?',confirmText:'Потребовать победу'});};
 $('onlineClaimDraw').onclick=()=>{if(snap.claimReady)gameAction('claim-draw',{title:'Зафиксировать ничью?',message:'Завершить партию вничью из-за ухода соперника?',confirmText:'Ничья'});};
 $('onlineDraw').onclick=()=>{
  setOptionsOpen(false);
  if(game?.drawOffer)gameAction('draw/yes');
  else gameAction('draw/yes',{title:'Предложить ничью?',message:'Отправить сопернику предложение ничьей на Lichess?',confirmText:'Предложить'});
 };
 if($('onlineDrawAccept'))$('onlineDrawAccept').onclick=()=>gameAction('draw/yes');
 $('onlineDrawNo').onclick=()=>gameAction('draw/no');
 for(const type of ['q','r','b','n'])$('onlinePromote'+type).onclick=()=>{const m=promotion.find(x=>x.promotion===type);if(m)sendMove(m,'tap');};
 $('onlinePromotionCancel').onclick=()=>{promotion=[];draw();};

 document.addEventListener('jc-screen',e=>{
  active=e.detail==='online';
  if(active){
   controls();draw();
   if(snap.connected&&(!snap.eventReady||snap.needsSync)&&!working)action(refresh);
  }
 });

 async function poll(){
  if(document.hidden)return;
  if(polling||working){pollQueued=true;return;}
  polling=true;
  try{
   const s=await call('snapshot');
   handlePush(s);
  }catch(e){if(active)say(e.message);}
  finally{
   polling=false;
   if(pollQueued&&!working&&!document.hidden){pollQueued=false;poll();}
  }
 }

 // Prevent accidental tab close during a live web Lichess game
 if(!native&&typeof globalThis.addEventListener==='function'){
  globalThis.addEventListener('beforeunload',e=>{
   if(uiLock&&game&&!game.done){e.preventDefault();e.returnValue='';}
  });
 }

 // Tick clocks and opponent-gone countdown only when online screen is visible and active
 setInterval(()=>{if(active&&(game||snap.opponentGone))tick();},100);

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

 return {
  locked:()=>uiLock,
  handleBack:()=>{
   if(optionsOpen){setOptionsOpen(false);return true;}
   if(chatOpen){setChatOpen(false);return true;}
   if(viewingFinished&&game?.done){leaveFinishedBoard();return true;}
   return false;
  }
 };
}
