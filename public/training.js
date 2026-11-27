import {renderBoardView,clearBoardView,moveDuration,roundMotionFactor,decoratePromotionButtons} from './board-view.js';
import {findKingSquare,renderMaterial} from './material.js';
import {playSound,soundForMove} from './sound.js';
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
export function initTraining({canStart,lock,unlock,review,getUser,goHome,goOnline}){
 let session=null,serial=0,selected=null,promotions=[],timer=null,finished=null,view='hub',botReturnTo='home';
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
 function renderClock(){if(!session?.clock)return;const r=remaining(session.clock,performance.now());for(const [id,c] of [['playTopClock',opposite(session.color)],['playBottomClock',session.color]]){const el=$(id);const text=liveClockText(r[c]);if(el.textContent!==text)el.textContent=text;el.classList.toggle('running',session.clock.turn===c);el.classList.toggle('low-time',r[c]!==null&&r[c]<20000);}}
 function draw(animateMoves=[]){
  const s=session;if(!s)return;
  const rows=s.game.board();
  const checkSquare=s.game.isCheck()?findKingSquare(rows,s.game.turn()):null;
  const targets=selected&&!s.thinking&&!s.starting&&s.game.turn()===s.color?s.game.moves({square:selected,verbose:true}).map(m=>m.to):[];
  renderBoardView($('playBoard'),{rows,flip:s.color==='b',interactive:true,disabled:s.starting||s.thinking||s.game.turn()!==s.color||promotions.length>0,onClick:click,onDrop:drop,selected,targets,last:s.last,checkSquare,animateMoves,motionFactor:roundMotionFactor(CONTROLS[s.control]?.base,CONTROLS[s.control]?.increment)});
  renderMaterial($('playTopMat'),rows,opposite(s.color));
  renderMaterial($('playBottomMat'),rows,s.color);
  if(s.renderedPly!==s.sans.length){
   const list=$('playMoves');list.textContent=s.sans.map((m,i)=>i%2===0?Math.floor(i/2)+1+'. '+m:m).join(' ');
   list.scrollLeft=list.scrollWidth;s.renderedPly=s.sans.length;
  }
  if(promotions.length)decoratePromotionButtons($('playPromotion'),s.color,'promote-');
  $('playPromotion').hidden=!promotions.length;renderClock();
 }
 function stopEngine(s){if(timer!==null){clearInterval(timer);timer=null;}if(s?.engine){s.engine.close();s.engine=null;}}
 function finish(end){
  const s=session;if(!s)return;
  session=null;serial++;stopEngine(s);selected=null;promotions=[];
  s.game.setHeader('Result',end.result);s.game.setHeader('Termination',end.reason);
  const pgn=s.game.pgn(),hasMoves=s.game.history().length>0;
  finished=hasMoves?{pgn,user:s.user}:null;
  if(hasMoves){const record={pgn,result:end.result,date:new Date().toISOString().slice(0,10),level:s.level,user:s.user};
   if(!storeHistory(record))status('Партия завершена, но локальное сохранение не удалось.');
   if(s.adaptive&&s.standard&&!s.replay){try{localStorage.setItem('jc-bot-level:'+s.user.toLowerCase(),String(adaptiveLevel(s.levelIndex,end.result,s.color)));}catch{}}
  }
  $('playPromotion').hidden=true;for(const d of $('playBoard').children)d.disabled=true;
  $('playResign').disabled=true;$('playCancel').disabled=true;$('playReview').hidden=!hasMoves;$('playArea').hidden=true;settings(true);historyList();unlock();
  status(end.reason+' · '+end.result+(hasMoves?' · можно разобрать партию':' · нет ходов для анализа'));
  if(hasMoves)review(pgn,true,s.user);
 }
 function cancel(message){
  const s=session;session=null;serial++;stopEngine(s);selected=null;promotions=[];finished=null;
  $('playPromotion').hidden=true;for(const d of $('playBoard').children)d.disabled=true;
  $('playResign').disabled=true;$('playCancel').disabled=true;$('playReview').hidden=true;$('playArea').hidden=true;settings(true);historyList();unlock();status(message);
 }
 function tick(){const s=session;if(!s?.clock)return;renderClock();if(remaining(s.clock,performance.now())[s.clock.turn]===0)finish(flagResult(s.game,s.clock.turn));}
 function move(m,via='tap'){
  const s=session;if(!s||!s.clock)return false;
  const now=performance.now(),clock=nextClock(s.clock,now);
  if(!clock){finish(flagResult(s.game,s.clock.turn));return false;}
  try{s.last=s.game.move(m);s.sans.push(s.last.san);}catch{return false;}
  s.clock=clock;selected=null;promotions=[];draw([{...s.last,dragged:via==='drag'}]);
  playSound(soundForMove(s.last,s.game));
  const end=terminal(s.game);if(end){finish(end);return true;}
  return true;
 }
 async function bot(){
  const s=session;if(!s||s.starting||s.game.turn()===s.color)return;
  const id=s.id;s.thinking=true;status('Stockfish думает…');draw();
  try{
   const r=remaining(s.clock,performance.now())[s.game.turn()];
   const budget=r===null?800:Math.max(10,Math.min(800,r-50));
   const began=performance.now();const best=await s.engine.choose(s.startFen,s.game.history({verbose:true}).map(m=>m.from+m.to+(m.promotion||'')),budget);
   const minPace=r===null||r>15000?380:r>5000?180:0;
   const targetDelay=Math.max(minPace,moveDuration(roundMotionFactor(CONTROLS[s.control]?.base,CONTROLS[s.control]?.increment))+140);
   const wait=Math.max(0,targetDelay-(performance.now()-began));
   if(wait&&(r===null||r>1500))await new Promise(resolve=>setTimeout(resolve,wait));
   if(session!==s||id!==serial)return;
   s.thinking=false;
   if(!move(parseUci(best),'bot')&&session===s)throw Error('Stockfish вернул нелегальный ход.');
   if(session===s){status(s.game.isCheck()?'Твой ход · шах!':'Твой ход');draw();}
  }catch(e){if(session===s&&id===serial)cancel('Тренировка прервана: '+e.message);}
 }
 function human(m,via='tap'){const s=session;if(!s||s.starting||s.thinking||s.game.turn()!==s.color)return;if(move(m,via)&&session===s)bot();}
 function drop(from,to){
  const s=session;if(!s||s.starting||s.thinking||s.game.turn()!==s.color||promotions.length)return;
  const options=s.game.moves({square:from,verbose:true}).filter(m=>m.to===to);
  if(options.length>1){promotions=options;draw();return;}
  if(options.length===1){human(options[0],'drag');return;}
 }
 function click(square){
  const s=session;if(!s||s.starting||s.thinking||s.game.turn()!==s.color||promotions.length)return;
  if(selected){const options=s.game.moves({square:selected,verbose:true}).filter(m=>m.to===square);
   if(options.length>1){promotions=options;draw();return;}
   if(options.length===1){human(options[0],'tap');return;}}
  const p=s.game.get(square);selected=p?.color===s.color&&selected!==square?square:null;draw();
 }
 async function start(overrides={}){
  if(session||!canStart()){status('Дождись окончания импорта или анализа.');return false;}
  let game,fen=overrides.fen??$('playFen').value.trim();
  try{game=fen?new Chess(fen):new Chess();const end=terminal(game);if(end)throw Error('В этой позиции партия уже окончена.');}
  catch(e){status('Некорректная стартовая позиция: '+e.message);return false;}
  const user=getUser()||'Johan0456',choice=$('playLevel').value,adaptive=choice==='adaptive',levelIndex=adaptive?adaptiveIndex(user):LEVELS.indexOf(Number(choice));
  if(levelIndex<0)return false;
  const control=$('playTime').value;if(!CONTROLS[control])return false;
  const color=overrides.color??($('playColor').value==='random'?(Math.random()<.5?'w':'b'):$('playColor').value);
  const level=LEVELS[levelIndex],id=++serial,standard=game.fen()===new Chess().fen();
  const s={id,game,user,color,level,levelIndex,adaptive,standard,control,replay:!!overrides.replay,startFen:game.fen(),clock:null,engine:null,starting:true,thinking:false,last:null,sans:[],renderedPly:-1};
  game.setHeader('Event',overrides.replay?'Johan Chess · повтор позиции':'Johan Chess · тренировка');
  game.setHeader('Site','Johan Chess');game.setHeader('Date',new Date().toISOString().slice(0,10).replaceAll('-','.'));
  game.setHeader('White',color==='w'?user:'Stockfish '+level);game.setHeader('Black',color==='b'?user:'Stockfish '+level);
  game.setHeader('Result','*');game.setHeader('TimeControl',control==='free'?'-':String(CONTROLS[control].base/1000)+'+'+String(CONTROLS[control].increment/1000));
  session=s;finished=null;selected=null;promotions=[];clearBoardView($('playBoard'));lock();settings(false);
  $('playArea').hidden=false;$('playCancel').disabled=false;$('playResign').disabled=true;$('playReview').hidden=true;
  $('playTopName').textContent='Stockfish · уровень '+level;$('playBottomName').textContent=user;
  $('playTopClock').textContent=$('playBottomClock').textContent=clockText(CONTROLS[control].base);
  $('playTopClock').classList.remove('low-time');$('playBottomClock').classList.remove('low-time');
  status('Запускаю Stockfish…');draw();
  try{s.engine=new Engine(enginePath);await s.engine.init();if(session!==s)return false;await s.engine.setSkill(level);if(session!==s)return false;
   s.starting=false;s.clock=makeClock(control,game.turn(),performance.now());timer=setInterval(tick,100);$('playResign').disabled=false;
   if(game.turn()!==color)bot();else{status(game.isCheck()?'Твой ход · шах!':'Твой ход');draw();}
   return true;
  }catch(e){if(session===s)cancel('Не удалось запустить Stockfish: '+e.message);return false;}
 }
 $('playStart').onclick=()=>start();
 if($('playBotStart'))$('playBotStart').onclick=()=>start();
 if($('playBack'))$('playBack').onclick=()=>{if(session)return;if(view==='bot'&&botReturnTo==='hub'){setView('hub');return;}goHome?.();};
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
 $('playCancel').onclick=async()=>{const s=session;if(!s)return;if(await confirmDialog({title:'Прервать тренировку?',message:'Текущая партия завершится без результата и не попадёт в историю.',confirmText:'Прервать',danger:true})&&session===s)cancel('Тренировка отменена.');};
 $('playResign').onclick=async()=>{const s=session;if(!s||s.starting)return;if(await confirmDialog({title:'Сдаться?',message:'Партия завершится поражением и сохранится для разбора.',confirmText:'Сдаться',danger:true})&&session===s){tick();if(session===s)finish({result:resultFor(opposite(session.color)),reason:'Игрок сдался'});}};
 $('playReview').onclick=()=>{if(finished&&!session&&canStart())review(finished.pgn,true,finished.user);};
 $('playOpenHistory').onclick=()=>{if(!session&&canStart()){const g=readHistory()[Number($('playHistory').value)];if(g)review(g.pgn,true,g.user);}};
 for(const p of ['q','r','b','n'])$('promote-'+p).onclick=()=>{const m=promotions.find(x=>x.promotion===p);if(m)human(m);};
 $('promote-cancel').onclick=()=>{promotions=[];draw();};
 document.addEventListener('visibilitychange',()=>{if(session)tick();});
 document.addEventListener('jc-play-view',e=>{if(!session)setView(e.detail?.view||'hub',e.detail?.from||'home');});
 for(const b of document.querySelectorAll('#playColorGroup button'))b.onclick=()=>{if(session)return;$('playColor').value=b.dataset.color;syncColorGroup();};
 $('playColor').onchange=syncColorGroup;
 syncColorGroup();syncLevelGrid();syncTimeLabels();setView('hub');
 historyList();
 return {
  active:()=>!!session,
  handleBack:()=>{if(!session&&document.body.dataset.activeScreen==='play'&&view==='bot'&&botReturnTo==='hub'){setView('hub');return true;}return false;},
  interrupt:()=>{if(session)cancel('Тренировка остановлена: онлайн-партия');},
  startReplay:(fen,color)=>{if(session||!canStart())return; $('playFen').value=fen;return start({fen,color,replay:true});}
 };
}
