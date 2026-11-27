import {renderBoardView,clearBoardView,moveDuration,roundMotionFactor,decoratePromotionButtons,getBoardMotion,setBoardMotion} from './board-view.js';
import {findKingSquare,renderMaterial} from './material.js';
import {playSound,soundForMove,isSoundEnabled,saveSoundEnabled} from './sound.js';
import {confirmDialog} from './dialog.js';
import {Chess} from './chess.js';
import {Engine} from './engine.js';
import {enginePath} from './engine-path.js';
import {LEVELS,DEFAULT_ADAPTIVE,CONTROLS,opposite,resultFor,clockText,liveClockText,makeClock,remaining,nextClock,terminal,flagResult,adaptiveLevel,parseUci} from './training-core.js';
const $=id=>document.getElementById(id);
const STORAGE='jc-training-history-v1';
function readHistory(){try{const data=JSON.parse(localStorage.getItem(STORAGE)||'[]');return Array.isArray(data)?data.filter(x=>x&&typeof x.pgn==='string'):[];}catch{return [];}}
function storeHistory(record){try{localStorage.setItem(STORAGE,JSON.stringify([record,...readHistory()].slice(0,30)));return true;}catch{return false;}}
function adaptiveIndex(user){try{const v=localStorage.getItem('jc-bot-level:'+user.toLowerCase());const n=v===null?DEFAULT_ADAPTIVE:Number(v);return Number.isInteger(n)&&n>=0&&n<LEVELS.length?n:DEFAULT_ADAPTIVE;}catch{return DEFAULT_ADAPTIVE;}}
function cloneClock(clock){return clock?{...clock}:null;}
function outcomeTitle(end,color){
 if(!end)return 'Партия завершена';
 if(end.result==='1/2-1/2')return 'Ничья';
 return end.result===resultFor(color)?'Победа!':'Поражение';
}
export function initTraining({canStart,lock,unlock,review,getUser,goHome,goOnline}){
 let session=null,serial=0,selected=null,promotions=[],timer=null,finished=null,view='hub',botReturnTo='home',hint=null,optionsOpen=false,chatOpen=false;
 const status=t=>{$('playStatus').textContent=t;$('playGameStatus').textContent=t;};
 const TIME_LABELS={'10+0':'10 минут','15+10':'15 | 10','30+0':'30 минут',free:'Без часов'};
 function historyList(){
  const select=$('playHistory');select.replaceChildren();
  const all=readHistory();
  all.forEach((g,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=g.date+' · '+g.result+' · SF '+g.level;select.append(o);});
  select.disabled=!all.length||!!session;$('playOpenHistory').disabled=select.disabled;
 }
 function setView(next,from='home'){
  view=next==='bot'?'bot':'hub';
  if(view==='bot')botReturnTo=from;
  if($('playHub'))$('playHub').hidden=view!=='hub';
  if($('playBotSheet'))$('playBotSheet').hidden=view!=='bot';
  if($('playTopbarTitle'))$('playTopbarTitle').textContent=view==='bot'?'Игра с ботом':'Новая партия';
  if($('playHistoryPanel'))$('playHistoryPanel').hidden=true;
 }
 function syncTimeLabels(){
  const v=$('playTime').value,label=TIME_LABELS[v]||v;
  if($('playTimeLabel'))$('playTimeLabel').textContent=label;
  if($('playBotTimeLabel'))$('playBotTimeLabel').textContent=label;
  if($('playBotTime')&&$('playBotTime').value!==v)$('playBotTime').value=v;
 }
 function syncLevelGrid(){
  const v=$('playLevel').value;
  for(const b of document.querySelectorAll('#playBotGrid button'))b.setAttribute('aria-pressed',String(b.dataset.level===v));
 }
 function settings(enabled){
  for(const id of ['playColor','playLevel','playTime','playBotTime','playFen','playStart','playBotStart','playHistory','playOpenHistory']){if($(id))$(id).disabled=!enabled;}
  for(const b of document.querySelectorAll('#playColorGroup button,#playBotGrid button'))b.disabled=!enabled;
 }
 function syncColorGroup(){const v=$('playColor').value;for(const b of document.querySelectorAll('#playColorGroup button'))b.setAttribute('aria-pressed',String(b.dataset.color===v));}
 function syncSheetPrefs(){
  if($('playSoundToggle'))$('playSoundToggle').checked=isSoundEnabled();
  if($('playMotionSelect'))$('playMotionSelect').value=getBoardMotion();
 }
 function setOptionsOpen(open){
  optionsOpen=!!open;
  if(optionsOpen){chatOpen=false;if($('playChatSheet'))$('playChatSheet').hidden=true;syncSheetPrefs();}
  if($('playOptionsSheet'))$('playOptionsSheet').hidden=!optionsOpen;
 }
 function setChatOpen(open){
  chatOpen=!!open;
  if(chatOpen){optionsOpen=false;if($('playOptionsSheet'))$('playOptionsSheet').hidden=true;if($('playChatBadge'))$('playChatBadge').hidden=true;}
  if($('playChatSheet'))$('playChatSheet').hidden=!chatOpen;
 }
 function renderClock(){
  const s=session;if(!s?.clock)return;
  const r=s.done?{w:s.clock.w,b:s.clock.b}:remaining(s.clock,performance.now());
  const topColor=s.flipped?s.color:opposite(s.color),bottomColor=opposite(topColor);
  for(const [id,c] of [['playTopClock',topColor],['playBottomClock',bottomColor]]){
   const el=$(id);
   const text=liveClockText(r[c]);
   if(el.textContent!==text)el.textContent=text;
   el.classList.toggle('running',!s.done&&s.clock.turn===c);
   el.classList.toggle('low-time',!s.done&&r[c]!==null&&r[c]<20000);
  }
 }
 function canUndo(s){
  if(!s||s.done||s.starting||s.hinting)return false;
  if(s.thinking)return s.frames.length>=2;
  const playerPlies=s.game.history({verbose:true}).filter(m=>m.color===s.color).length;
  return playerPlies>0;
 }
 function syncMoveStrip(s){
  const list=$('playMoves');if(!list)return;
  const total=s.sans.length,activePly=s.viewPly===null?total:s.viewPly;
  if(s.renderedPly!==total){
   const frag=document.createDocumentFragment();
   for(let i=0;i<total;i++){
    const b=document.createElement('button');
    b.type='button';
    b.dataset.ply=String(i+1);
    b.textContent=(i%2===0?Math.floor(i/2)+1+'. ':'')+s.sans[i];
    b.onclick=()=>jumpPly(i+1);
    frag.append(b);
   }
   list.replaceChildren(frag);
   list.scrollLeft=list.scrollWidth;
   s.renderedPly=total;
  }
  const prev=list.querySelector('[aria-current="step"]');
  if(prev)prev.removeAttribute('aria-current');
  const cur=activePly>0?list.children[activePly-1]:null;
  if(cur){
   cur.setAttribute('aria-current','step');
   list.scrollLeft=Math.max(0,cur.offsetLeft-list.offsetLeft-(list.clientWidth-cur.offsetWidth)/2);
  }else list.scrollLeft=0;
 }
 function draw(animateMoves=[]){
  const s=session;if(!s)return;
  const totalPlies=s.frames.length-1;
  const browsing=s.viewPly!==null&&s.viewPly<totalPlies;
  const displayPly=browsing?s.viewPly:totalPlies;
  const frame=s.frames[displayPly]||s.frames[totalPlies];
  const displayGame=browsing?new Chess(frame.fen):s.game;
  const rows=displayGame.board();
  const checkSquare=displayGame.isCheck()?findKingSquare(rows,displayGame.turn()):null;
  const livePlayable=!browsing&&!s.done&&!s.starting&&!s.thinking&&!s.hinting&&s.game.turn()===s.color&&promotions.length===0;
  const targets=selected&&livePlayable?s.game.moves({square:selected,verbose:true}).map(m=>m.to):[];
  const activeHint=!browsing&&!s.done&&hint&&hint.fen===s.game.fen()?hint:null;
  const hintSquare=activeHint?activeHint.from:null;
  const hintTarget=activeHint&&activeHint.step>=2?activeHint.to:null;
  const arrows=activeHint&&activeHint.step>=2?[{from:activeHint.from,to:activeHint.to,brush:'hint'}]:[];
  const flip=s.flipped?s.color==='w':s.color==='b';
  renderBoardView($('playBoard'),{
   rows,flip,interactive:true,disabled:browsing?false:!livePlayable,
   onClick:click,onDrop:drop,selected:browsing?null:selected,targets,
   last:frame.last,checkSquare,hintSquare,hintTarget,arrows,
   animateMoves,motionFactor:roundMotionFactor(CONTROLS[s.control]?.base,CONTROLS[s.control]?.increment,s.done)
  });
  const topColor=flip?'w':'b',bottomColor=opposite(topColor);
  const nameFor=c=>c===s.color?s.user:'Stockfish · уровень '+s.level;
  $('playTopName').textContent=nameFor(topColor);
  $('playBottomName').textContent=nameFor(bottomColor);
  renderMaterial($('playTopMat'),rows,topColor);
  renderMaterial($('playBottomMat'),rows,bottomColor);
  syncMoveStrip(s);
  if(promotions.length)decoratePromotionButtons($('playPromotion'),s.color,'promote-');
  $('playPromotion').hidden=!promotions.length;
  if($('playLivePill'))$('playLivePill').hidden=!browsing;
  if($('playPrevMove'))$('playPrevMove').disabled=displayPly<=0;
  if($('playNextMove'))$('playNextMove').disabled=!browsing;
  if($('playLiveDot'))$('playLiveDot').hidden=!s.hasUnreadMove;
  if($('playHint')){
   $('playHint').hidden=s.done;
   $('playHint').disabled=!livePlayable;
   $('playHint').classList.toggle('is-active',!!activeHint);
  }
  if($('playUndo')){$('playUndo').hidden=s.done;$('playUndo').disabled=!canUndo(s);}
  if($('playResign'))$('playResign').disabled=s.starting||s.done;
  if($('playDrawOffer'))$('playDrawOffer').disabled=s.starting||s.done;
  if($('playCancel'))$('playCancel').disabled=s.done;
  if($('playReview'))$('playReview').hidden=!s.done||!s.sans.length;
  if($('playRematchSheet'))$('playRematchSheet').hidden=!s.done;
  renderClock();
 }
 function jumpPly(target){
  const s=session;if(!s)return;
  const max=s.frames.length-1;
  const clamped=Math.max(0,Math.min(target,max));
  const prev=s.viewPly===null?max:s.viewPly;
  if(clamped===prev)return;
  selected=null;
  s.viewPly=clamped>=max?null:clamped;
  if(s.viewPly===null)s.hasUnreadMove=false;
  const step=clamped===prev+1&&s.frames[clamped]?.last?[s.frames[clamped].last]:[];
  if(step.length)playSound(soundForMove(step[0]));
  draw(step);
 }
 function stopEngine(s){if(timer!==null){clearInterval(timer);timer=null;}if(s?.engine){s.engine.close();s.engine=null;}}
 function exitGame(message){
  const s=session;
  session=null;serial++;stopEngine(s);selected=null;promotions=[];hint=null;
  setOptionsOpen(false);setChatOpen(false);
  $('playPromotion').hidden=true;
  if($('playResultCard'))$('playResultCard').hidden=true;
  if($('playLivePill'))$('playLivePill').hidden=true;
  $('playArea').hidden=true;settings(true);historyList();unlock();
  if(message!==undefined)status(message);
 }
 function finish(end){
  const s=session;if(!s||s.done)return;
  s.done=true;s.end=end;s.thinking=false;s.hinting=false;s.turnToken++;
  if(s.clock){const r=remaining(s.clock,performance.now());s.clock={...s.clock,w:r.w,b:r.b};}
  stopEngine(s);selected=null;promotions=[];hint=null;s.viewPly=null;s.hasUnreadMove=false;
  setOptionsOpen(false);
  s.game.setHeader('Result',end.result);s.game.setHeader('Termination',end.reason);
  const pgn=s.game.pgn(),hasMoves=s.game.history().length>0;
  finished=hasMoves?{pgn,user:s.user}:null;
  if(hasMoves){
   const record={pgn,result:end.result,date:new Date().toISOString().slice(0,10),level:s.level,user:s.user};
   if(!storeHistory(record))status('Партия завершена, но локальное сохранение не удалось.');
   if(s.adaptive&&s.standard&&!s.replay){try{localStorage.setItem('jc-bot-level:'+s.user.toLowerCase(),String(adaptiveLevel(s.levelIndex,end.result,s.color)));}catch{}}
  }
  historyList();
  status(end.reason+' · '+end.result);
  draw();
  if($('playResultCard')){
   $('playResultTitle').textContent=outcomeTitle(end,s.color);
   $('playResultSub').textContent=end.reason+' · '+end.result;
   $('playResultReview').hidden=!hasMoves;
   $('playResultCard').hidden=false;
  }
 }
 function cancel(message){
  finished=null;
  exitGame(message);
 }
 function tick(){const s=session;if(!s?.clock||s.done)return;renderClock();if(remaining(s.clock,performance.now())[s.clock.turn]===0)finish(flagResult(s.game,s.clock.turn));}
 function move(m,via='tap'){
  const s=session;if(!s||!s.clock||s.done)return false;
  const now=performance.now(),clock=nextClock(s.clock,now);
  if(!clock){finish(flagResult(s.game,s.clock.turn));return false;}
  try{s.last=s.game.move(m);s.sans.push(s.last.san);}catch{return false;}
  s.clock=clock;selected=null;promotions=[];hint=null;
  s.frames.push({fen:s.game.fen(),last:s.last,clock:cloneClock(clock)});
  const browsing=s.viewPly!==null;
  if(browsing)s.hasUnreadMove=true;
  draw(browsing?[]:[{...s.last,dragged:via==='drag'}]);
  playSound(soundForMove(s.last,s.game));
  const end=terminal(s.game);if(end){finish(end);return true;}
  return true;
 }
 async function bot(){
  const s=session;if(!s||s.done||s.starting||s.game.turn()===s.color)return;
  const id=s.id,token=++s.turnToken;
  s.thinking=true;status('Stockfish думает…');draw();
  try{
   const r=remaining(s.clock,performance.now())[s.game.turn()];
   const budget=r===null?800:Math.max(10,Math.min(800,r-50));
   const began=performance.now();
   const best=await s.engine.choose(s.startFen,s.game.history({verbose:true}).map(m=>m.from+m.to+(m.promotion||'')),budget);
   if(session!==s||id!==serial||s.done||s.turnToken!==token)return;
   const minPace=r===null||r>15000?380:r>5000?180:0;
   const targetDelay=Math.max(minPace,moveDuration(roundMotionFactor(CONTROLS[s.control]?.base,CONTROLS[s.control]?.increment))+140);
   const wait=Math.max(0,targetDelay-(performance.now()-began));
   if(wait&&(r===null||r>1500))await new Promise(resolve=>setTimeout(resolve,wait));
   if(session!==s||id!==serial||s.done||s.turnToken!==token)return;
   s.thinking=false;
   if(!move(parseUci(best),'bot')&&session===s)throw Error('Stockfish вернул нелегальный ход.');
   if(session===s&&!s.done){status(s.game.isCheck()?'Твой ход · шах!':'Твой ход');draw();}
  }catch(e){
   if(session===s&&id===serial&&!s.done&&s.turnToken===token)cancel('Тренировка прервана: '+e.message);
  }
 }
 function human(m,via='tap'){
  const s=session;if(!s||s.done||s.starting||s.thinking||s.hinting||s.game.turn()!==s.color)return;
  if(move(m,via)&&session===s&&!s.done)bot();
 }
 function drop(from,to){
  const s=session;if(!s)return;
  if(s.viewPly!==null){jumpPly(s.frames.length-1);return;}
  if(s.done||s.starting||s.thinking||s.hinting||s.game.turn()!==s.color||promotions.length)return;
  const options=s.game.moves({square:from,verbose:true}).filter(m=>m.to===to);
  if(options.length>1){promotions=options;draw();return;}
  if(options.length===1){human(options[0],'drag');return;}
 }
 function click(square){
  const s=session;if(!s)return;
  if(s.viewPly!==null){jumpPly(s.frames.length-1);return;}
  if(s.done||s.starting||s.thinking||s.hinting||s.game.turn()!==s.color||promotions.length)return;
  if(selected){
   const options=s.game.moves({square:selected,verbose:true}).filter(m=>m.to===square);
   if(options.length>1){promotions=options;draw();return;}
   if(options.length===1){human(options[0],'tap');return;}
  }
  const p=s.game.get(square);selected=p?.color===s.color&&selected!==square?square:null;draw();
 }
 async function requestHint(){
  const s=session;
  if(!s||s.done||s.starting||s.thinking||s.hinting||s.game.turn()!==s.color||promotions.length)return;
  if(s.viewPly!==null){s.viewPly=null;s.hasUnreadMove=false;}
  const fen=s.game.fen();
  if(hint&&hint.fen===fen){
   if(hint.step===1){
    hint={...hint,step:2};
    status('Подсказка: сыграй указанный ход');
    draw();
   }
   return;
  }
  const id=s.id,token=++s.turnToken;
  s.hinting=true;selected=null;
  status('Stockfish ищет лучшую подсказку…');
  draw();
  try{
   const historyUci=s.game.history({verbose:true}).map(m=>m.from+m.to+(m.promotion||''));
   await s.engine.setSkill(20);
   if(session!==s||id!==serial||s.done||s.turnToken!==token)return;
   const best=await s.engine.choose(s.startFen,historyUci,550);
   if(session!==s||id!==serial||s.done||s.turnToken!==token)return;
   await s.engine.setSkill(s.level);
   if(session!==s||id!==serial||s.done||s.turnToken!==token)return;
   const parsed=parseUci(best);
   hint={fen,from:parsed.from,to:parsed.to,step:1};
   status('Подсказка: ходи подсвеченной фигурой (нажми ещё раз для хода)');
  }catch(e){
   if(session===s&&id===serial&&!s.done)status('Не удалось получить подсказку');
  }finally{
   if(session===s&&id===serial){s.hinting=false;draw();}
  }
 }
 function undoMove(){
  const s=session;
  if(!canUndo(s))return;
  let pliesToUndo=0;
  if(s.thinking){
   s.turnToken++;
   s.thinking=false;
   s.engine?.stopSearch();
   pliesToUndo=1;
  }else{
   // Undo back to previous turn for player (typically 2 plies: bot reply + player move).
   const hist=s.game.history({verbose:true});
   if(hist.length>=2&&hist.at(-1).color!==s.color&&hist.at(-2).color===s.color)pliesToUndo=2;
   else if(hist.length>=1&&hist.at(-1).color===s.color)pliesToUndo=1;
   else return;
  }
  for(let i=0;i<pliesToUndo;i++){
   if(!s.game.undo())break;
   s.sans.pop();
   if(s.frames.length>1)s.frames.pop();
  }
  const top=s.frames.at(-1);
  s.last=top?.last||null;
  s.renderedPly=-1;
  s.viewPly=null;s.hasUnreadMove=false;
  selected=null;promotions=[];hint=null;
  if(top?.clock)s.clock={...top.clock,turn:s.game.turn(),since:performance.now()};
  else if(s.clock)s.clock={...s.clock,turn:s.game.turn(),since:performance.now()};
  status(s.game.isCheck()?'Ход отменён · шах!':'Ход отменён · твой ход');
  draw();
 }
 async function start(overrides={}){
  if(session&&!session.done){status('Дождись окончания текущей партии.');return false;}
  if(session&&session.done)exitGame('');
  if(!canStart()){status('Дождись окончания импорта или анализа.');return false;}
  let game,fen=overrides.fen??$('playFen').value.trim();
  try{game=fen?new Chess(fen):new Chess();const end=terminal(game);if(end)throw Error('В этой позиции партия уже окончена.');}
  catch(e){status('Некорректная стартовая позиция: '+e.message);return false;}
  const user=getUser()||'Johan0456',choice=$('playLevel').value,adaptive=choice==='adaptive',levelIndex=adaptive?adaptiveIndex(user):LEVELS.indexOf(Number(choice));
  if(levelIndex<0)return false;
  const control=$('playTime').value;if(!CONTROLS[control])return false;
  const color=overrides.color??($('playColor').value==='random'?(Math.random()<.5?'w':'b'):$('playColor').value);
  const level=LEVELS[levelIndex],id=++serial,standard=game.fen()===new Chess().fen();
  const s={id,game,user,color,flipped:false,level,levelIndex,adaptive,standard,control,replay:!!overrides.replay,startFen:game.fen(),clock:null,engine:null,starting:true,thinking:false,hinting:false,done:false,end:null,turnToken:0,last:null,sans:[],frames:[{fen:game.fen(),last:null,clock:null}],viewPly:null,hasUnreadMove:false,renderedPly:-1,chat:[]};
  game.setHeader('Event',overrides.replay?'Johan Chess · повтор позиции':'Johan Chess · тренировка');
  game.setHeader('Site','Johan Chess');game.setHeader('Date',new Date().toISOString().slice(0,10).replaceAll('-','.'));
  game.setHeader('White',color==='w'?user:'Stockfish '+level);game.setHeader('Black',color==='b'?user:'Stockfish '+level);
  game.setHeader('Result','*');game.setHeader('TimeControl',control==='free'?'-':String(CONTROLS[control].base/1000)+'+'+String(CONTROLS[control].increment/1000));
  session=s;finished=null;selected=null;promotions=[];hint=null;
  setOptionsOpen(false);setChatOpen(false);
  clearBoardView($('playBoard'));lock();settings(false);
  $('playArea').hidden=false;
  if($('playResultCard'))$('playResultCard').hidden=true;
  if($('playLivePill'))$('playLivePill').hidden=true;
  if($('playReview'))$('playReview').hidden=true;
  $('playTopClock').textContent=$('playBottomClock').textContent=clockText(CONTROLS[control].base);
  $('playTopClock').classList.remove('low-time');$('playBottomClock').classList.remove('low-time');
  status('Запускаю Stockfish…');draw();
  try{
   s.engine=new Engine(enginePath);await s.engine.init();if(session!==s)return false;
   await s.engine.setSkill(level);if(session!==s)return false;
   s.starting=false;s.clock=makeClock(control,game.turn(),performance.now());
   s.frames[0].clock=cloneClock(s.clock);
   timer=setInterval(tick,100);
   if(game.turn()!==color)bot();else{status(game.isCheck()?'Твой ход · шах!':'Твой ход');draw();}
   return true;
  }catch(e){if(session===s)cancel('Не удалось запустить Stockfish: '+e.message);return false;}
 }
 function openReviewFromFinished(){
  if(!finished||!canStart())return;
  const target=finished;
  exitGame('');
  review(target.pgn,true,target.user);
 }
 $('playStart').onclick=()=>start();
 if($('playBotStart'))$('playBotStart').onclick=()=>start();
 if($('playBack'))$('playBack').onclick=()=>{if(session)return;if(view==='bot'&&botReturnTo==='hub'){setView('hub');return;}goHome?.();};
 if($('playGameBackBtn'))$('playGameBackBtn').onclick=async()=>{
  const s=session;if(!s)return;
  if(s.done){exitGame('');return;}
  if(await confirmDialog({title:'Выйти из партии?',message:'Текущая тренировка будет прервана без сохранения результата.',confirmText:'Выйти',danger:true})&&session===s)cancel('Тренировка отменена.');
 };
 if($('playBotOpen'))$('playBotOpen').onclick=()=>{if(!session)setView('bot','hub');};
 if($('playGoOnline'))$('playGoOnline').onclick=()=>{
  if(session)return;
  const map={'10+0':'10+0','15+10':'15+10','30+0':'30+20'};
  const ctrl=map[$('playTime').value];
  if(ctrl&&$('onlineControl'))$('onlineControl').value=ctrl;
  goOnline?.({friend:false});
 };
 if($('playGoFriend'))$('playGoFriend').onclick=()=>{if(!session)goOnline?.({friend:true});};
 if($('playHistoryToggle'))$('playHistoryToggle').onclick=()=>{const p=$('playHistoryPanel');if(p){p.hidden=!p.hidden;if(!p.hidden)p.open=true;}};
 $('playTime').onchange=syncTimeLabels;
 if($('playBotTime'))$('playBotTime').onchange=()=>{$('playTime').value=$('playBotTime').value;syncTimeLabels();};
 for(const b of document.querySelectorAll('#playBotGrid button'))b.onclick=()=>{if(session)return;$('playLevel').value=b.dataset.level;syncLevelGrid();};
 $('playLevel').onchange=syncLevelGrid;
 if($('playOptionsBtn'))$('playOptionsBtn').onclick=()=>setOptionsOpen(true);
 if($('playOptionsClose'))$('playOptionsClose').onclick=()=>setOptionsOpen(false);
 if($('playOptionsSheet'))$('playOptionsSheet').onclick=e=>{if(e.target===$('playOptionsSheet'))setOptionsOpen(false);};
 if($('playChatBtn'))$('playChatBtn').onclick=()=>setChatOpen(true);
 if($('playChatClose'))$('playChatClose').onclick=()=>setChatOpen(false);
 if($('playChatSheet'))$('playChatSheet').onclick=e=>{if(e.target===$('playChatSheet'))setChatOpen(false);};
 if($('playHint'))$('playHint').onclick=()=>requestHint();
 if($('playUndo'))$('playUndo').onclick=()=>undoMove();
 if($('playPrevMove'))$('playPrevMove').onclick=()=>{const s=session;if(!s)return;const cur=s.viewPly===null?s.frames.length-1:s.viewPly;jumpPly(cur-1);};
 if($('playNextMove'))$('playNextMove').onclick=()=>{const s=session;if(!s)return;const cur=s.viewPly===null?s.frames.length-1:s.viewPly;jumpPly(cur+1);};
 if($('playLivePill'))$('playLivePill').onclick=()=>{if(session)jumpPly(session.frames.length-1);};
 if($('playFlipToggle'))$('playFlipToggle').onclick=()=>{if(!session)return;session.flipped=!session.flipped;setOptionsOpen(false);draw();};
 if($('playSoundToggle'))$('playSoundToggle').onchange=e=>{saveSoundEnabled(e.target.checked);const p=$('soundEnabled');if(p)p.checked=e.target.checked;if(e.target.checked)playSound('move');};
 if($('playMotionSelect'))$('playMotionSelect').onchange=e=>{setBoardMotion(e.target.value);};
 if($('playDrawOffer'))$('playDrawOffer').onclick=async()=>{
  const s=session;if(!s||s.starting||s.done)return;
  setOptionsOpen(false);
  if(await confirmDialog({title:'Предложить ничью?',message:'Завершить тренировочную партию вничью и сохранить для разбора?',confirmText:'Ничья'})&&session===s&&!s.done){
   finish({result:'1/2-1/2',reason:'Ничья по соглашению'});
  }
 };
 $('playCancel').onclick=async()=>{
  const s=session;if(!s||s.done)return;
  setOptionsOpen(false);
  if(await confirmDialog({title:'Прервать тренировку?',message:'Текущая партия завершится без результата и не попадёт в историю.',confirmText:'Прервать',danger:true})&&session===s&&!s.done)cancel('Тренировка отменена.');
 };
 $('playResign').onclick=async()=>{
  const s=session;if(!s||s.starting||s.done)return;
  setOptionsOpen(false);
  if(await confirmDialog({title:'Сдаться?',message:'Партия завершится поражением и сохранится для разбора.',confirmText:'Сдаться',danger:true})&&session===s&&!s.done){
   tick();
   if(session===s&&!s.done)finish({result:resultFor(opposite(session.color)),reason:'Игрок сдался'});
  }
 };
 $('playReview').onclick=openReviewFromFinished;
 if($('playResultReview'))$('playResultReview').onclick=openReviewFromFinished;
 if($('playResultClose'))$('playResultClose').onclick=()=>{if($('playResultCard'))$('playResultCard').hidden=true;};
 if($('playResultRematch'))$('playResultRematch').onclick=()=>start();
 if($('playRematchSheet'))$('playRematchSheet').onclick=()=>{setOptionsOpen(false);start();};
 $('playOpenHistory').onclick=()=>{if(!session&&canStart()){const g=readHistory()[Number($('playHistory').value)];if(g)review(g.pgn,true,g.user);}};
 for(const p of ['q','r','b','n'])$('promote-'+p).onclick=()=>{const m=promotions.find(x=>x.promotion===p);if(m)human(m,'tap');};
 $('promote-cancel').onclick=()=>{promotions=[];draw();};
 document.addEventListener('visibilitychange',()=>{if(session&&!session.done)tick();});
 document.addEventListener('jc-play-view',e=>{if(!session)setView(e.detail?.view||'hub',e.detail?.from||'home');});
 for(const b of document.querySelectorAll('#playColorGroup button'))b.onclick=()=>{if(session)return;$('playColor').value=b.dataset.color;syncColorGroup();};
 $('playColor').onchange=syncColorGroup;
 syncColorGroup();syncLevelGrid();syncTimeLabels();setView('hub');
 historyList();
 return {
  active:()=>!!session&&!session.done,
  handleBack:()=>{
   if(optionsOpen){setOptionsOpen(false);return true;}
   if(chatOpen){setChatOpen(false);return true;}
   if(session){
    if(session.done){exitGame('');return true;}
    if(!$('playCancel').disabled)$('playCancel').click();
    return true;
   }
   if(document.body.dataset.activeScreen==='play'&&view==='bot'&&botReturnTo==='hub'){setView('hub');return true;}
   return false;
  },
  interrupt:()=>{if(session)cancel('Тренировка остановлена: онлайн-партия');},
  startReplay:(fen,color)=>{if((session&&!session.done)||!canStart())return; $('playFen').value=fen;return start({fen,color,replay:true});}
 };
}
