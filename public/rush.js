import {Chess} from './chess.js';
import {preparePuzzle,advancePuzzle,buildPuzzleReview} from './puzzle-core.js';
import {renderBoardView,clearBoardView} from './board-view.js';
import {formatDuration} from './puzzle-journey.js';
import {MODES,validMode,pickRush,createRush,remainingRush,elapsedRush,pauseRush,resumeRush,checkRush,endRush,recordRush,normalizeRushHistory,saveRushHistory} from './rush-core.js';
const $=id=>document.getElementById(id);
const labels={'3':'3 минуты','5':'5 минут',survival:'Survival'};
const reasons={time:'Время вышло',mistakes:'Три ошибки',exhausted:'Офлайн-набор пройден',stopped:'Раунд остановлен'};
const storageKey=user=>'jc-rush-v1:'+user;
let packPromise=null;
function loadPack(){
 if(!packPromise)packPromise=fetch('./lichess-puzzles.json').then(r=>{if(!r.ok)throw Error('База недоступна');return r.json();}).then(d=>{if(d.license!=='CC0-1.0'||!Array.isArray(d.puzzles)||!d.puzzles.length)throw Error('Некорректная база');return d.puzzles;}).catch(e=>{packPromise=null;throw e;});
 return packPromise;
}
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
export function initRush({getUser,back}){
 let user='',history=normalizeRushHistory(null),rows=[],byId=new Map(),mode='3',run=null,puzzle=null,game=null,step=0,selected=null,promotion=[],seen=new Set(),frames=[],frame=0,active=false,loading=false,view='menu',generation=0,clock=null,result=null,lastError='';
 const now=()=>clock?clock.start+Math.max(0,Date.now()-clock.wall,performance.now()-clock.mono):Date.now();
 const read=()=>{try{return normalizeRushHistory(JSON.parse(localStorage.getItem(storageKey(user))||'null'));}catch{return normalizeRushHistory(null);}};
 function store(){try{localStorage.setItem(storageKey(user),JSON.stringify(history));return true;}catch{return false;}}
 function menu(){
  view='menu';sync();if(active)window.scrollTo(0,0);for(const m of Object.keys(labels))$('rushBest'+m).textContent=String(history.best[m]);
  for(const b of document.querySelectorAll('[data-rush-mode]'))b.setAttribute('aria-pressed',String(b.dataset.rushMode===mode));
  const list=$('rushHistory'),frag=document.createDocumentFragment();
  for(const r of history.runs.slice(0,20)){
   const b=el('button',undefined,'rush-history-row');b.type='button';
   b.append(el('strong',labels[r.mode]+' · '+r.score),el('small',new Date(r.date).toLocaleDateString('ru-RU')+' · '+reasons[r.reason]));b.onclick=()=>showResult(r,false);frag.append(b);
  }if(!frag.childNodes.length)frag.append(el('p','Пока нет результатов.','muted'));list.replaceChildren(frag);
 }
 function sync(){
  document.body.classList.toggle('rush-focus',active&&view!=='menu');
  $('rushMenu').hidden=view!=='menu';$('rushPlay').hidden=view!=='play';$('rushResult').hidden=view!=='result';$('rushReview').hidden=view!=='review';
  $('rushStart').disabled=loading;for(const b of document.querySelectorAll('[data-rush-mode]'))b.disabled=loading;
 }
 function draw(animateMoves=[]){
  if(!game){clearBoardView($('rushBoard'));return;}
  const waiting=run.pausedAt!==null;
  const targets=!waiting&&selected&&!promotion.length?game.moves({square:selected,verbose:true}).map(m=>m.to):[];
  renderBoardView($('rushBoard'),{rows:game.board(),flip:puzzle.color==='b',interactive:true,disabled:run.end!==null||waiting||!!promotion.length,onClick:click,selected,targets,animateMoves});
  $('rushNext').hidden=!waiting||run.end!==null;
  $('rushPromotion').hidden=!promotion.length;
 }
 function scoreboard(){
  if(!run)return;
  const time=remainingRush(run,now()),text=time===null?formatDuration(elapsedRush(run,now())/1000):formatDuration(Math.ceil(time/1000));
  if($('rushTime').textContent!==text)$('rushTime').textContent=text;
  $('rushScore').textContent=String(run.score);$('rushLives').textContent='●'.repeat(3-run.mistakes)+'×'.repeat(run.mistakes);$('rushLives').setAttribute('aria-label','Ошибок '+run.mistakes+' из 3');
 }
 function check(){
  if(view!=='play'||!run||run.end!==null)return false;
  const next=checkRush(run,now());if(next.end!==null){run=next;finish();return false;}return true;
 }
 function nextPuzzle(){
  if(!check()||run.pausedAt===null)return;
  let p;
  while((p=pickRush(rows,seen,run.score))){seen.add(p.id);puzzle=preparePuzzle(p,Chess);if(puzzle)break;}
  if(!p){run=endRush(run,now(),'exhausted');finish();return;}
  if(!check())return;
  game=new Chess(puzzle.startFen);step=0;selected=null;promotion=[];
  $('rushTurn').textContent=game.turn()==='w'?'Ход белых':'Ход чёрных';$('rushRating').textContent=String(puzzle.rating);
  $('rushFeedback').textContent='Найди лучший ход';$('rushFeedback').className='muted';
  // Render first, then begin charging the next puzzle. No next position is visible during rest.
  draw();run=resumeRush(run,now());draw();scoreboard();
 }
 function move(m){
  if(!check()||run.pausedAt!==null||!game)return;
  const n=advancePuzzle(puzzle,game,step,m,Chess);if(!check())return;
  selected=null;promotion=[];
  const animation=n?[n.played,...(n.reply?[n.reply]:[])]:[];
  if(n){game=n.game;step=n.index;if(!n.done){draw(animation);return;}}
  const completedAt=now();run=recordRush(run,puzzle,!!n,completedAt);
  $('rushFeedback').textContent=n?'Верно! · время остановлено':'Ошибка · время остановлено';$('rushFeedback').className=n?'puzzle-success':'puzzle-wrong';
  if(run.end!==null){finish();return;}
  run=pauseRush(run,completedAt);if(run.end!==null){finish();return;}
  draw(animation);scoreboard();
 }
 function click(sq){
  if(!check()||run.pausedAt!==null||!game||promotion.length)return;
  if(selected){const options=game.moves({square:selected,verbose:true}).filter(m=>m.to===sq);if(options.length>1){promotion=options;draw();return;}if(options.length===1){move(options[0]);return;}}
  const p=game.get(sq);selected=p?.color===game.turn()&&selected!==sq?sq:null;draw();
 }
 async function start(){
  if(loading||view!=='menu')return;
  loading=true;const token=++generation;sync();$('rushNotice').textContent='Подготавливаю офлайн-набор…';
  try{
   const source=await loadPack();if(token!==generation||!active)return;
   rows=source;byId=new Map(rows.map(p=>[p.id,p]));seen=new Set();game=null;puzzle=null;promotion=[];selected=null;
   clock={start:Date.now(),wall:Date.now(),mono:performance.now()};run=pauseRush(createRush(mode,clock.start),clock.start);view='play';$('rushFeedback').textContent='Найди лучший ход';$('rushFeedback').className='muted';$('rushNotice').textContent='';sync();nextPuzzle();window.scrollTo(0,0);
  }catch(e){if(token===generation)$('rushNotice').textContent=e.message;}
  finally{if(token===generation){loading=false;sync();}}
 }
 function finish(){
  if(!run||run.end===null)return;
  scoreboard();const before=history.best[run.mode];history=saveRushHistory(history,run,Date.now());
  const saved=store();lastError=saved?'':'Не удалось сохранить результат.';
  const r=history.runs[0];run=null;game=null;promotion=[];showResult(r,r.reason!=='stopped'&&r.score>before);
 }
 function showResult(r,newBest){
  if(!r)return;result=r;view='result';sync();
  $('rushResultTitle').textContent=newBest?'Новый рекорд!':reasons[r.reason];
  $('rushResultScore').textContent=String(r.score);$('rushResultMeta').textContent=labels[r.mode]+' · '+formatDuration(r.seconds)+' · ошибок '+r.mistakes+'/3';
  $('rushResultBest').textContent='Рекорд: '+history.best[r.mode];$('rushResultNotice').textContent=lastError;
  const list=$('rushResultRows'),frag=document.createDocumentFragment();
  for(const e of r.entries){const b=el('button',undefined,'rush-history-row');b.type='button';b.append(el('strong',(e.correct?'✓ ':'× ')+e.rating,e.correct?'puzzle-success':'puzzle-wrong'),el('small','Lichess #'+e.id+' · Разбор'));b.onclick=()=>review(e.id);frag.append(b);}
  if(!r.entries.length)frag.append(el('p','Нет завершённых задач.','muted'));list.replaceChildren(frag);if(active)window.scrollTo(0,0);
 }
 async function review(id){
  const token=generation,selectedResult=result;
  try{
   if(!byId.size){rows=await loadPack();if(token!==generation||!active||view!=='result'||result!==selectedResult)return;byId=new Map(rows.map(p=>[p.id,p]));}
   const p=preparePuzzle(byId.get(id),Chess);if(!p)throw Error('Задача отсутствует в текущем наборе');
   puzzle=p;frames=buildPuzzleReview(p,Chess);frame=0;view='review';sync();drawReview();window.scrollTo(0,0);
  }catch(e){if(token===generation&&view==='result'&&result===selectedResult)$('rushResultNotice').textContent=e.message;}
 }
 function drawReview(animate=false){
  const f=frames[frame];if(!f)return;renderBoardView($('rushReviewBoard'),{rows:new Chess(f.fen).board(),flip:puzzle.color==='b',last:f.move,animateMoves:animate&&f.move?[f.move]:[]});
  $('rushReviewMove').textContent=frame?f.move.san+' · '+frame+'/'+(frames.length-1):'Исходная позиция';$('rushReviewPrev').disabled=frame===0;$('rushReviewNext').disabled=frame===frames.length-1;
 }
 for(const b of document.querySelectorAll('[data-rush-mode]'))b.onclick=()=>{if(!loading&&validMode(b.dataset.rushMode)){mode=b.dataset.rushMode;menu();}};
 for(const type of ['q','r','b','n'])$('rushPromote'+type).onclick=()=>{if(!check())return;const m=promotion.find(x=>x.promotion===type);if(m)move(m);};
 $('rushPromoteCancel').onclick=()=>{if(!check()||run.pausedAt!==null)return;promotion=[];draw();};
 $('rushStart').onclick=start;
 $('rushNext').onclick=()=>{if(check()&&run.pausedAt!==null)nextPuzzle();};
 $('rushBack').onclick=()=>{generation++;loading=false;back();};
 $('rushStop').onclick=()=>{if(!check())return;if(confirm('Завершить раунд?')){if(!check())return;run=endRush(run,now(),'stopped');finish();}};
 $('rushAgain').onclick=()=>{mode=result?.mode||mode;menu();};
 $('rushResultBack').onclick=menu;
 $('rushReviewBack').onclick=()=>showResult(result,false);
 $('rushReviewPrev').onclick=()=>{if(frame>0){frame--;drawReview();}};
 $('rushReviewNext').onclick=()=>{if(frame<frames.length-1){frame++;drawReview(true);}};
 setInterval(()=>{if(active&&check())scoreboard();},150);
 document.addEventListener('visibilitychange',()=>{if(active&&check())scoreboard();});
 document.addEventListener('jc-screen',e=>{
  active=e.detail==='rush';
  if(!active){
   generation++;loading=false;if(run&&view==='play'){run=endRush(run,now(),'stopped');finish();}sync();return;
  }
  const next=String(getUser()||'').trim().toLowerCase();if(next!==user||!result){user=next;result=null;history=read();lastError='';menu();}else sync();
 });
}
