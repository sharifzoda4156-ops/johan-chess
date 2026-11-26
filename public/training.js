import {renderBoardView,clearBoardView,scrollBehavior} from './board-view.js';
import {Chess} from './chess.js';
import {Engine} from './engine.js';
import {enginePath} from './engine-path.js';
import {LEVELS,DEFAULT_ADAPTIVE,CONTROLS,opposite,resultFor,clockText,makeClock,remaining,nextClock,terminal,flagResult,adaptiveLevel,parseUci} from './training-core.js';
const $=id=>document.getElementById(id);
const STORAGE='jc-training-history-v1';
function readHistory(){try{const data=JSON.parse(localStorage.getItem(STORAGE)||'[]');return Array.isArray(data)?data.filter(x=>x&&typeof x.pgn==='string'):[];}catch{return [];}}
function storeHistory(record){try{localStorage.setItem(STORAGE,JSON.stringify([record,...readHistory()].slice(0,30)));return true;}catch{return false;}}
function adaptiveIndex(user){try{const v=localStorage.getItem('jc-bot-level:'+user.toLowerCase());const n=v===null?DEFAULT_ADAPTIVE:Number(v);return Number.isInteger(n)&&n>=0&&n<LEVELS.length?n:DEFAULT_ADAPTIVE;}catch{return DEFAULT_ADAPTIVE;}}
export function initTraining({canStart,lock,unlock,review,getUser}){
 let session=null,serial=0,selected=null,promotions=[],timer=null,finished=null;
 const status=t=>$('playStatus').textContent=t;
 function historyList(){
  const select=$('playHistory');select.replaceChildren();
  const all=readHistory();
  all.forEach((g,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=g.date+' · '+g.result+' · SF '+g.level;select.append(o);});
  select.disabled=!all.length||!!session;$('playOpenHistory').disabled=select.disabled;
 }
 function settings(enabled){for(const id of ['playColor','playLevel','playTime','playFen','playStart','playHistory','playOpenHistory'])$(id).disabled=!enabled;}
 function renderClock(){if(!session?.clock)return;const r=remaining(session.clock,performance.now());for(const [id,c] of [['playTopClock',opposite(session.color)],['playBottomClock',session.color]]){const el=$(id);const text=clockText(r[c]);if(el.textContent!==text)el.textContent=text;el.classList.toggle('running',session.clock.turn===c);}}
 function draw(animateMoves=[]){
  const s=session;if(!s)return;
  const targets=selected&&!s.thinking&&!s.starting&&s.game.turn()===s.color?s.game.moves({square:selected,verbose:true}).map(m=>m.to):[];
  renderBoardView($('playBoard'),{rows:s.game.board(),flip:s.color==='b',interactive:true,disabled:s.starting||s.thinking||s.game.turn()!==s.color||promotions.length>0,onClick:click,selected,targets,last:s.last,animateMoves});
  if(s.renderedPly!==s.sans.length){
   const list=$('playMoves');list.textContent=s.sans.map((m,i)=>i%2===0?Math.floor(i/2)+1+'. '+m:m).join(' ');
   list.scrollTop=list.scrollHeight;s.renderedPly=s.sans.length;
  }
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
  $('playResign').disabled=true;$('playCancel').disabled=true;$('playReview').hidden=!hasMoves;settings(true);historyList();unlock();
  status(end.reason+' · '+end.result+(hasMoves?' · можно разобрать партию':' · нет ходов для анализа'));
  if(hasMoves)review(pgn,true,s.user);
 }
 function cancel(message){
  const s=session;session=null;serial++;stopEngine(s);selected=null;promotions=[];finished=null;
  $('playPromotion').hidden=true;for(const d of $('playBoard').children)d.disabled=true;
  $('playResign').disabled=true;$('playCancel').disabled=true;$('playReview').hidden=true;settings(true);historyList();unlock();status(message);
 }
 function tick(){const s=session;if(!s?.clock)return;renderClock();if(remaining(s.clock,performance.now())[s.clock.turn]===0)finish(flagResult(s.game,s.clock.turn));}
 function move(m){
  const s=session;if(!s||!s.clock)return false;
  const now=performance.now(),clock=nextClock(s.clock,now);
  if(!clock){finish(flagResult(s.game,s.clock.turn));return false;}
  try{s.last=s.game.move(m);s.sans.push(s.last.san);}catch{return false;}
  s.clock=clock;selected=null;promotions=[];draw([s.last]);
  const end=terminal(s.game);if(end){finish(end);return true;}
  return true;
 }
 async function bot(){
  const s=session;if(!s||s.starting||s.game.turn()===s.color)return;
  const id=s.id;s.thinking=true;status('Stockfish думает…');draw();
  try{
   const r=remaining(s.clock,performance.now())[s.game.turn()];
   const budget=r===null?1000:Math.max(10,Math.min(1000,r-50));
   const began=performance.now();const best=await s.engine.choose(s.startFen,s.game.history({verbose:true}).map(m=>m.from+m.to+(m.promotion||'')),budget);
   const wait=Math.max(0,450-(performance.now()-began));
   if(wait&& (r===null||r>700))await new Promise(resolve=>setTimeout(resolve,wait));
   if(session!==s||id!==serial)return;
   s.thinking=false;
   if(!move(parseUci(best))&&session===s)throw Error('Stockfish вернул нелегальный ход.');
   if(session===s){status(s.game.isCheck()?'Твой ход · шах!':'Твой ход');draw();}
  }catch(e){if(session===s&&id===serial)cancel('Тренировка прервана: '+e.message);}
 }
 function human(m){const s=session;if(!s||s.starting||s.thinking||s.game.turn()!==s.color)return;if(move(m)&&session===s)bot();}
 function click(square){
  const s=session;if(!s||s.starting||s.thinking||s.game.turn()!==s.color||promotions.length)return;
  if(selected){const options=s.game.moves({square:selected,verbose:true}).filter(m=>m.to===square);
   if(options.length>1){promotions=options;draw();return;}
   if(options.length===1){human(options[0]);return;}}
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
  const s={id,game,user,color,level,levelIndex,adaptive,standard,replay:!!overrides.replay,startFen:game.fen(),clock:null,engine:null,starting:true,thinking:false,last:null,sans:[],renderedPly:-1};
  game.setHeader('Event',overrides.replay?'Johan Chess · повтор позиции':'Johan Chess · тренировка');
  game.setHeader('Site','Johan Chess');game.setHeader('Date',new Date().toISOString().slice(0,10).replaceAll('-','.'));
  game.setHeader('White',color==='w'?user:'Stockfish '+level);game.setHeader('Black',color==='b'?user:'Stockfish '+level);
  game.setHeader('Result','*');game.setHeader('TimeControl',control==='free'?'-':String(CONTROLS[control].base/1000)+'+'+String(CONTROLS[control].increment/1000));
  session=s;finished=null;selected=null;promotions=[];clearBoardView($('playBoard'));lock();settings(false);
  $('playArea').hidden=false;$('playCancel').disabled=false;$('playResign').disabled=true;$('playReview').hidden=true;
  $('playTopName').textContent='Stockfish · уровень '+level;$('playBottomName').textContent=user;
  $('playTopClock').textContent=$('playBottomClock').textContent=clockText(CONTROLS[control].base);
  status('Запускаю Stockfish…');draw();
  try{s.engine=new Engine(enginePath);await s.engine.init();if(session!==s)return false;await s.engine.setSkill(level);if(session!==s)return false;
   s.starting=false;s.clock=makeClock(control,game.turn(),performance.now());timer=setInterval(tick,200);$('playResign').disabled=false;
   if(game.turn()!==color)bot();else{status(game.isCheck()?'Твой ход · шах!':'Твой ход');draw();}
   return true;
  }catch(e){if(session===s)cancel('Не удалось запустить Stockfish: '+e.message);return false;}
 }
 $('playStart').onclick=()=>start();
 $('playCancel').onclick=()=>{if(session&&confirm('Прервать тренировку без результата?'))cancel('Тренировка отменена.');};
 $('playResign').onclick=()=>{if(session&&!session.starting&&confirm('Сдаться?')){tick();if(session)finish({result:resultFor(opposite(session.color)),reason:'Игрок сдался'});}};
 $('playReview').onclick=()=>{if(finished&&!session&&canStart())review(finished.pgn,true,finished.user);};
 $('playOpenHistory').onclick=()=>{if(!session&&canStart()){const g=readHistory()[Number($('playHistory').value)];if(g)review(g.pgn,true,g.user);}};
 for(const p of ['q','r','b','n'])$('promote-'+p).onclick=()=>{const m=promotions.find(x=>x.promotion===p);if(m)human(m);};
 $('promote-cancel').onclick=()=>{promotions=[];draw();};
 document.addEventListener('visibilitychange',()=>{if(session)tick();});
 historyList();
 return {active:()=>!!session,interrupt:()=>{if(session)cancel('Тренировка остановлена: онлайн-партия');},startReplay:(fen,color)=>{if(session||!canStart())return; $('playFen').value=fen;$('playPanel').scrollIntoView({behavior:scrollBehavior()});return start({fen,color,replay:true});}};
}
