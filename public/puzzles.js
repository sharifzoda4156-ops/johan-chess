import {loadMorePuzzles} from './puzzle-remote.js';
import {Chess} from './chess.js';
import {renderBoardView,clearBoardView} from './board-view.js';
import {preparePuzzle,advancePuzzle,filterPuzzles,cleanProgress,finishAttempt,buildPuzzleReview} from './puzzle-core.js';
import {normalizeTraining,recordOutcome,summarizeTraining,selectTrainingPuzzle} from './puzzle-training.js';
import {parseUci} from './training-core.js';
import {dayKey,shiftDay,dailyOrder,normalizeDaily,completeDaily,dailyStreak,normalizeJourney,journeyLevel,levelCost,rewardJourney,breakJourney,targetSeconds,formatDuration,createPuzzleTimer,dailyPenalty} from './puzzle-journey.js';
let pack=null,loading=null;
async function loadPack(){if(pack)return pack;if(!loading)loading=fetch('./lichess-puzzles.json').then(r=>{if(!r.ok)throw Error('База задач недоступна');return r.json();}).then(d=>{if(d.license!=='CC0-1.0'||!Array.isArray(d.puzzles)||!d.puzzles.length)throw Error('Некорректная база Lichess');return pack=d.puzzles;}).finally(()=>{loading=null;});return loading;}
const $=id=>document.getElementById(id),key=(kind,user)=>'jc-lichess-v1-'+kind+':'+String(user||'').trim().toLowerCase();
function read(kind,user,fallback){try{return JSON.parse(localStorage.getItem(key(kind,user))||'null')??fallback;}catch{return fallback;}}
function write(kind,user,value){try{localStorage.setItem(key(kind,user),JSON.stringify(value));return true;}catch{return false;}}
export const getPuzzleProgress=user=>cleanProgress(read('progress',user,{}));
export const getPuzzleTraining=user=>summarizeTraining(read('training',user,{}));

function elem(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
export function initPuzzles(getUser){
 let puzzle=null,game=null,step=0,selected=null,highlight=null,promotion=[],done=false,assisted=false,user='',progress=cleanProgress(null),lastId=null,training=normalizeTraining(null),storageFailed=false,starting=false,remotePacks=[],excluded=new Set(),visited=new Set(),pendingTheme=false;
 let mode='journey',map=true,active=false,journey=normalizeJourney(null),daily=normalizeDaily(null),date=dayKey(),calendarDay=date,hearts=5,attemptTarget=1100,view='solve',dailyOutcome=null,feedback=null,previousFeedback=null,reviewFrames=[],reviewAt=0,retryPractice=false;
 const timer=createPuzzleTimer(),modes={journey:'modeJourney',daily:'modeDaily',classic:'modeClassic'};
 const status=(s,cls='')=>{$('puzzleStatus').textContent=s;$('puzzleStatus').className=cls;};
 const userNow=()=>String(getUser()||'').trim().toLowerCase();
 function saveMode(kind,state){if(!write(kind,user,state))storageFailed=true;}
 function refreshClock(){const text=formatDuration(timer.seconds());if($('puzzleElapsed').textContent!==text)$('puzzleElapsed').textContent=text;}
 function syncTimer(){if(active&&!document.hidden&&mode!=='classic'&&!map&&view==='solve'&&game&&!done&&!starting)timer.resume();else timer.pause();refreshClock();}
 setInterval(()=>{if(active&&mode==='journey'&&!map&&!done)refreshClock();},250);
 document.addEventListener('visibilitychange',()=>{syncTimer();if(active&&!document.hidden)refreshDay();});
 setInterval(()=>{if(active&&!document.hidden)refreshDay();},15000);
 function modeControls(){
  for(const [name,id] of Object.entries(modes)){$(id).setAttribute('aria-pressed',String(name===mode));$(id).disabled=starting;}
  $('journeyStart').disabled=$('dailyStart').disabled=$('classicStart').disabled=starting||!pack;
  $('journeyBack').disabled=false;$('puzzleArchive').disabled=false;
  document.body.classList.toggle('puzzle-focus',active&&!map);
  $('puzzleMenuHeading').hidden=$('modeJourney').parentElement.hidden=$('rushLaunch').hidden=!map;
  $('journeyMap').hidden=mode!=='journey'||!map;$('dailyHeader').hidden=mode!=='daily'||!map;
  $('classicStats').hidden=$('classicFilters').hidden=mode!=='classic'||!map;
  $('puzzleSession').hidden=map;$('journeySession').hidden=mode!=='journey';
  $('puzzleWorkspace').hidden=view!=='solve';$('puzzleDailyResult').hidden=view!=='daily-result';$('puzzleReview').hidden=view!=='review';
  $('puzzleArchive').hidden=mode!=='daily'||view==='review';
  $('dailyHearts').hidden=mode!=='daily';
  $('sessionTitle').textContent=view==='review'?'Разбор':mode==='daily'?'Задача дня':mode==='journey'?'Путь шахматиста':'Классика';
  $('sessionKicker').textContent=mode==='daily'?new Date(date+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long'}):mode==='journey'?'РАНГ · '+journeyLevel(journey.xp).name.toUpperCase():'ТАКТИКА';
  syncTimer();
 }
 function journeyStats(){
  const l=journeyLevel(journey.xp),today=dayKey();
  $('journeyRank').textContent=l.name+' · '+l.position+'/20';
  $('journeyTotal').textContent=journey.xp.toLocaleString('ru-RU')+' XP';
  $('journeyProgress').max=l.cost;$('journeyProgress').value=l.progress;
  $('journeyProgressLabel').textContent=l.maxed?'Максимальный ранг':l.progress+' / '+l.cost+' XP';
  $('journeySeries').textContent='Серия: '+journey.streak+' · рекорд '+journey.bestStreak;
  $('journeyQuest').textContent='Сегодня: '+Math.min(3,journey.records.filter(r=>r.day===today).length)+'/3';
  $('journeySessionXP').textContent=journey.xp.toLocaleString('ru-RU')+' XP';$('journeySessionLevel').textContent='Ур. '+l.position+'/20';if(mode==='journey')$('sessionKicker').textContent='РАНГ · '+l.name.toUpperCase();$('journeyRun').textContent='↗ '+journey.streak;$('sessionProgress').max=l.cost;$('sessionProgress').value=l.progress;
  if(!$('journeyMap').hidden){
   const path=$('journeyPath'),key=l.rank+':'+l.position+':'+l.maxed;
   if(path.dataset.level!==key){
    path.dataset.level=key;const frag=document.createDocumentFragment(),start=Math.max(1,Math.min(14,l.position-3)),end=Math.min(20,start+6);
    for(let n=end;n>=start;n--){
     const current=n===l.position&&!l.maxed,complete=n<l.position||l.maxed;
     const node=elem('div','journey-node'+(current?' is-current':complete?' is-complete':''));
     const number=elem('span','node-number',complete?'✓':String(n));number.setAttribute('aria-hidden','true');
     const info=elem('span','node-info');info.append(elem('strong',null,'Уровень '+n),elem('small',null,complete?'Пройден':current?'Ты здесь':levelCost(l.rank*20+n)+' XP для прохождения'));
     if(current)node.setAttribute('aria-current','step');node.append(number,info);frag.append(node);
    }path.replaceChildren(frag);
    const current=path.querySelector('[aria-current=step]');if(current)path.scrollTop=Math.max(0,current.offsetTop-(path.clientHeight-current.offsetHeight)/2);
   }
  }
 }
 function refreshDay(){
  if(starting)return false;
  const today=dayKey();if(today===calendarDay)return false;
  const previous=calendarDay;calendarDay=today;
  if(mode==='daily'&&(date<shiftDay(today,-6)||(date===previous&&(!game||done)))){date=today;if(map){modeControls();stats();return false;}start({reset:true});return true;}
  stats();return false;
 }
 function dailyStats(){
  const today=dayKey();$('dailyDateLabel').textContent=new Date(date+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
  $('dailyStreak').textContent='Серия: '+dailyStreak(daily,today)+' дн.';
  $('dailyHearts').textContent='♥'.repeat(hearts)+'♡'.repeat(5-hearts);$('dailyHearts').setAttribute('aria-label','Сердец осталось: '+hearts+' из 5');
  const result=daily.records[date];$('dailyResult').textContent=result?'Решено · '+formatDuration(result.seconds)+' · '+result.hearts+'/5 сердец':'Пять сердец на попытку. Повторы бесплатны.';
  const cal=$('dailyCalendar'),key=today+':'+date+':'+Object.keys(daily.records).join(',')+':'+starting;
  if(cal.dataset.key!==key){
   cal.dataset.key=key;const frag=document.createDocumentFragment();
   for(let i=-6;i<=0;i++){
    const d=shiftDay(today,i),dt=new Date(d+'T12:00:00'),b=elem('button',daily.records[d]?'daily-done':'');
    b.type='button';b.disabled=starting;b.setAttribute('aria-pressed',String(d===date));b.setAttribute('aria-label',d+(daily.records[d]?' · решено':''));
    b.append(elem('small',null,dt.toLocaleDateString('ru-RU',{weekday:'short'})),elem('strong',null,dt.getDate()+(daily.records[d]?' ✓':'')));
    b.onclick=()=>{if(starting||d===date)return;date=d;abandon();modeControls();stats();};frag.append(b);
   }cal.replaceChildren(frag);
  }
 }
 function stats(){
  $('puzzleSolved').textContent=String(progress.solved.length);
  $('puzzleStreak').textContent=String(progress.streak);
  const s=summarizeTraining(training);
  $('puzzleAccuracy').textContent=s.accuracy===null?'—':s.accuracy+'%';
  $('puzzleTarget').textContent=String(s.target);
  $('puzzleAttempts').textContent=String(s.attempts);
  $('puzzleStorage').hidden=!storageFailed;
  journeyStats();if(mode==='daily')dailyStats();
 }
 function all(){const rows=[...new Map([...(pack||[]),...remotePacks.flatMap(p=>p.rows)].map(p=>[p.id,p])).values()];return filterPuzzles(rows,mode==='journey'?'all':$('puzzleTheme').value,mode==='journey'||$('puzzleBand').value==='adaptive'?'400-2999':$('puzzleBand').value);}
 function unseen(p){return p&&(mode==='journey'?!journey.records.some(r=>r.id===p.id):!progress.solved.includes(p.id)&&!training.records.some(r=>r.id===p.id));}
 function validPick(){const list=all();let next=pick(list);while(next&&list.length){const p=preparePuzzle(next,Chess);if(p)return p;list.splice(list.indexOf(next),1);next=pick(list);}return null;}
 function record(outcome){if(!puzzle||mode==='daily')return;training=recordOutcome(training,puzzle,outcome,progress.solved);if(!write('training',user,training))storageFailed=true;document.dispatchEvent(new CustomEvent('jc-puzzle-progress'));}
 function pick(list){
  if(mode==='journey'){
   const rewarded=new Set(journey.records.map(r=>r.id)),fresh=list.filter(p=>!rewarded.has(p.id)&&p.id!==lastId);
   if(fresh.length)return selectTrainingPuzzle(fresh,training,progress.solved,lastId,true);
   const single=list.filter(p=>!rewarded.has(p.id));if(single.length)return selectTrainingPuzzle(single,training,progress.solved,lastId,true);
  }
  return selectTrainingPuzzle(list,training,progress.solved,lastId,mode==='journey'||$('puzzleBand').value==='adaptive');
 }
 function save(){if(!write('progress',user,progress)){storageFailed=true;return false;}document.dispatchEvent(new CustomEvent('jc-puzzle-progress'));return true;}
 function draw(animateMoves=[]){
  const board=$('puzzleBoard');
  $('puzzleArea').hidden=!game;
  $('puzzleHint').disabled=!game||done||!!promotion.length;
  $('puzzleReveal').disabled=!game||done||!!promotion.length;
  $('puzzleHint').hidden=done;
  $('puzzleReveal').hidden=done||mode==='daily';
  $('puzzleRetry').hidden=!game||!done;
  $('puzzleReviewOpen').hidden=!game||!done;
  $('puzzleNext').hidden=mode==='daily'&&!!game&&!done;
  $('puzzlePromotion').hidden=!promotion.length;
  if(!game){clearBoardView(board);previousFeedback=null;return;}
  const targets=selected&&!done&&!promotion.length?game.moves({square:selected,verbose:true}).map(m=>m.to):[];
  renderBoardView(board,{rows:game.board(),flip:puzzle.color==='b',interactive:true,disabled:starting||done||!!promotion.length,onClick:click,selected,targets,marked:highlight||[],markClass:'puzzle-mark',animateMoves});
  if(previousFeedback)board.querySelector('[data-square="'+previousFeedback+'"]')?.removeAttribute('data-feedback');
  if(feedback)board.querySelector('[data-square="'+feedback.square+'"]')?.setAttribute('data-feedback',feedback.kind);
  previousFeedback=feedback?.square||null;
 }
 async function start({reset=false}={}){
  if(starting)return;starting=true;pendingTheme=false;timer.pause();const wasPractice=retryPractice;view='solve';dailyOutcome=null;feedback=null;retryPractice=false;$('journeyDelta').textContent='';$('dailyShareText').hidden=true;
  $('puzzleNext').disabled=$('puzzleTheme').disabled=$('puzzleBand').disabled=true;
  if(!reset&&puzzle&&!done&&mode!=='daily'&&!wasPractice){record('skipped');progress={...progress,streak:0};save();if(mode==='journey'){journey=breakJourney(journey);saveMode('journey',journey);}}
  puzzle=null;game=null;step=0;selected=null;highlight=null;promotion=[];done=false;assisted=false;hearts=5;timer.reset();attemptTarget=training.target;
  $('journeyReward').hidden=true;$('puzzleTitle').textContent='';$('puzzleTurn').textContent='Загрузка';status('Подготавливаю задачу…');modeControls();stats();
  let notice='';
  if(mode==='daily'){
   const ordered=dailyOrder(pack||[],date),previous=daily.records[date]?.id;
   if(previous){const i=ordered.findIndex(p=>p.id===previous);if(i>0)ordered.unshift(...ordered.splice(i,1));}
   for(const row of ordered){puzzle=preparePuzzle(row,Chess);if(puzzle)break;}
  }else puzzle=validPick();
  draw();
  try{
   const adaptive=mode==='journey'||$('puzzleBand').value==='adaptive';
   if(mode!=='daily'&&(!unseen(puzzle)||(adaptive&&Math.abs(puzzle.rating-training.target)>200))){
    status('Подгружаю задачи Lichess с GitHub…');
    const extra=await loadMorePuzzles({theme:mode==='journey'?'all':$('puzzleTheme').value,band:mode==='journey'?'adaptive':$('puzzleBand').value,target:training.target,excluded,seen:visited});
    if(extra){visited.add(extra.key);write('visited',user,[...visited].slice(-20000));remotePacks=[...remotePacks,extra].slice(-4);excluded=new Set(remotePacks.map(p=>p.key));if(!extra.persisted)notice=' · пакет не сохранён в офлайн-кэш';puzzle=validPick();}
   }
  }catch(e){notice=' · GitHub недоступен, используем локальные задачи';}
  finally{starting=false;$('puzzleNext').disabled=$('puzzleTheme').disabled=$('puzzleBand').disabled=false;modeControls();if(pendingTheme||userNow()!==user)queueMicrotask(()=>enter());}
  if(pendingTheme||userNow()!==user){puzzle=null;game=null;return;}
  $('puzzleCacheInfo').textContent='В памяти: '+new Set([...(pack||[]),...remotePacks.flatMap(p=>p.rows)].map(p=>p.id)).size+' задач · кэш до 50 МБ';
  if(!puzzle){$('puzzleTurn').textContent='';$('puzzleExplanation').textContent='';$('puzzleTitle').textContent='Нет задач';$('puzzleNext').disabled=false;$('puzzleNext').textContent='Повторить загрузку';status('В этой категории пока нет доступных задач'+notice+'. Попробуй снова или выбери другую тему.');draw();stats();return;}
  lastId=puzzle.id;game=new Chess(puzzle.startFen);$('puzzleNext').disabled=mode==='daily';$('puzzleNext').textContent=mode==='daily'?'Решай задачу':'Пропустить';
  $('puzzleTimeTarget').textContent=formatDuration(targetSeconds(puzzle,attemptTarget));$('journeyDifficulty').textContent=String(puzzle.rating);
  $('puzzleTitle').textContent='Lichess #'+puzzle.id+' · '+puzzle.rating;
  $('puzzleTurn').textContent=game.turn()==='w'?'Ход белых':'Ход чёрных';
  $('puzzleExplanation').textContent='';
  status('Найди решение'+notice+'.');draw();syncTimer();stats();
 }
 function finish(reveal=false,animateMoves=[]){
  if(done||!game)return;
  done=true;selected=null;promotion=[];timer.pause();refreshClock();
  if(mode==='daily'){
   if(!reveal){daily=completeDaily(daily,date,{id:puzzle.id,seconds:timer.seconds(),hearts});saveMode('daily',daily);status('Задача дня решена!','puzzle-success');dailyOutcome='solved';}
   else{status('Решение показано · серия не засчитана');dailyOutcome='failed';}
  }else if(retryPractice){status(reveal?'Решение показано':'Тренировочный повтор завершён',reveal?'':'puzzle-success');}
  else if(!reveal){record(assisted?'assisted':'clean');progress=finishAttempt(progress,puzzle.id,assisted);status(save()?(assisted?'Верно! Решено с помощью.':'Верно! С первого раза.'):'Верно! Не удалось сохранить прогресс.','puzzle-success');}
  else{record('assisted');progress={...progress,streak:0};save();status('Решение показано · не засчитано','');}
  if(mode==='journey'){
   const result=rewardJourney(journey,puzzle,{day:dayKey(),seconds:timer.seconds(),target:attemptTarget,clean:!reveal&&!assisted,practice:retryPractice});journey=result.state;saveMode('journey',journey);
   const r=result.reward;const details=r?[['База',r.base],['Скорость',r.speed],['Серия',r.series],['Дневной бонус',r.daily],['Рекорд',r.record],['Рубеж',r.milestone]].filter(x=>x[1]>0).map(x=>x[0]+' +'+x[1]).join(' · '):'';
   $('journeyDelta').textContent=r?'+'+r.points:'';
   $('journeyReward').textContent=r?'+'+r.points+' XP · '+formatDuration(timer.seconds())+' · '+details:'0 XP · '+formatDuration(timer.seconds())+(retryPractice?' · тренировочный повтор':reveal||assisted?' · нужна чистая попытка':' · эта задача уже принесла очки');$('journeyReward').hidden=false;
  }
  $('puzzleExplanation').textContent='Вариант из базы Lichess: '+puzzle.line.join(' ')+' · lichess.org/training/'+puzzle.id;
  $('puzzleNext').disabled=false;$('puzzleNext').textContent='Далее';$('puzzleTurn').textContent=reveal?'Решение':!assisted?'Отличный ход!':'Задача решена';draw(animateMoves);stats();if(mode==='daily')showDailyResult();
 }
 function tryMove(m){
  if(done||!game)return;
  promotion=[];selected=null;highlight=null;
  const next=advancePuzzle(puzzle,game,step,m,Chess);
  if(next){feedback={square:next.played.to,kind:'correct'};game=next.game;step=next.index;const last=next.reply||next.played;highlight=[last.from,last.to];const animation=[next.played,...(next.reply?[next.reply]:[])];if(next.done){finish(false,animation);return;}status('Верно! Соперник ответил '+next.reply.san+'. Продолжай.','puzzle-success');draw(animation);return;}
  assisted=true;feedback={square:m.to,kind:'wrong'};penalty();
  if(mode==='daily'&&hearts===0){failDaily();return;}
  status('Не совпадает с решением Lichess. Попробуй ещё раз.','puzzle-wrong');draw();stats();
 }
 function click(sq){
  if(done||!game||promotion.length)return;
  if(selected){
   const moves=game.moves({square:selected,verbose:true}).filter(m=>m.to===sq);
   if(moves.length>1){promotion=moves;draw();return;}
   if(moves.length===1){tryMove(moves[0]);return;}
  }
  feedback=null;const p=game.get(sq);selected=p?.color===game.turn()&&selected!==sq?sq:null;highlight=null;draw();
 }
 function penalty(){
  if(mode==='daily'){hearts=dailyPenalty(hearts);return;}
  if(retryPractice)return;
  record('assisted');progress={...progress,streak:0};save();
  if(mode==='journey'){journey=breakJourney(journey);saveMode('journey',journey);}
 }
 function abandon(){
  timer.pause();
  if(mode==='journey'&&puzzle&&!done&&!retryPractice){journey=breakJourney(journey);saveMode('journey',journey);record('skipped');progress={...progress,streak:0};save();}
  puzzle=null;game=null;promotion=[];selected=null;done=false;lastId=null;view='solve';dailyOutcome=null;feedback=null;draw();
 }
 function switchMode(next){
  if(starting||next===mode)return;
  abandon();mode=next;map=true;date=dayKey();calendarDay=date;hearts=5;modeControls();stats();
 }
 function openSession(){if(starting||!pack)return;map=false;modeControls();if(!puzzle)start({reset:true});else syncTimer();}
 function backToMenu(){if(view==='review'){closeReview();return;}map=true;modeControls();stats();window.scrollTo(0,0);}
 for(const [name,id] of Object.entries(modes))$(id).onclick=()=>switchMode(name);
 $('journeyStart').onclick=$('dailyStart').onclick=$('classicStart').onclick=openSession;
 $('journeyBack').onclick=backToMenu;
 $('puzzleArchive').onclick=()=>{map=true;modeControls();stats();};
 $('puzzleNext').onclick=()=>start({reset:mode==='daily'});
 $('puzzleTheme').onchange=$('puzzleBand').onchange=()=>{if(puzzle)abandon();lastId=null;modeControls();stats();};
 $('puzzleHint').onclick=()=>{if(done||!game)return;assisted=true;feedback=null;penalty();if(mode==='daily'&&hearts===0){failDaily();return;}highlight=[puzzle.solution[step].slice(0,2)];selected=null;status('Подсказка: начни с выделенной фигуры.');draw();stats();};
 $('puzzleReveal').onclick=()=>{if(done||!game)return;while(step<puzzle.solution.length){const m=game.move(parseUci(puzzle.solution[step++]));highlight=[m.from,m.to];}finish(true);};
 for(const type of ['q','r','b','n'])$('puzzle-promote-'+type).onclick=()=>{const m=promotion.find(x=>x.promotion===type);if(m)tryMove(m);};
 $('puzzle-promote-cancel').onclick=()=>{promotion=[];draw();};
 function failDaily(){
  if(done||!game||mode!=='daily')return;
  done=true;selected=null;promotion=[];timer.pause();dailyOutcome='failed';status('Попытки закончились. Разбери решение и попробуй снова.','puzzle-wrong');
  draw();stats();showDailyResult();
 }
 function showDailyResult(){
  view='daily-result';modeControls();
  const solved=dailyOutcome==='solved';
  $('dailyResultTitle').textContent=solved?'Отличная работа!':'Продолжай тренироваться!';
  $('dailyResultHearts').textContent='♥'.repeat(hearts)+'♡'.repeat(5-hearts);
  $('dailyResultHearts').setAttribute('aria-label',hearts+' из 5 сердец');
  $('dailyResultTime').textContent=(solved?'Задача дня решена':'Попытка не засчитана')+' · '+formatDuration(timer.seconds());
  $('dailyResultStreak').textContent=String(dailyStreak(daily,dayKey()));$('dailyResultCount').textContent=String(Object.keys(daily.records).length);
  $('dailyShareText').hidden=true;
  renderBoardView($('dailyResultBoard'),{rows:game.board(),flip:puzzle.color==='b',marked:highlight||[]});
  if(active)window.scrollTo(0,0);
 }
 function retryCurrent(){
  if(starting||!puzzle)return;
  view='solve';dailyOutcome=null;feedback=null;game=new Chess(puzzle.startFen);step=0;selected=null;highlight=null;promotion=[];done=false;hearts=5;
  retryPractice=mode==='journey';assisted=retryPractice;timer.reset();attemptTarget=training.target;
  $('journeyDelta').textContent='';$('journeyReward').hidden=true;$('puzzleExplanation').textContent='';$('puzzleNext').disabled=mode==='daily';$('puzzleNext').textContent=mode==='daily'?'Решай задачу':'Пропустить';
  $('puzzleTurn').textContent=game.turn()==='w'?'Ход белых':'Ход чёрных';status(retryPractice?'Тренировочный повтор · без XP':'Найди решение.');
  modeControls();draw();stats();syncTimer();if(active)window.scrollTo(0,0);
 }
 function drawReview(animate=false){
  const f=reviewFrames[reviewAt];if(!f)return;
  const c=new Chess(f.fen);
  renderBoardView($('puzzleReviewBoard'),{rows:c.board(),flip:puzzle.color==='b',last:f.move,animateMoves:animate&&f.move?[f.move]:[]});
  $('reviewPuzzleMove').textContent=reviewAt?f.move.san+' · '+reviewAt+'/'+(reviewFrames.length-1):'Начальная позиция';
  $('reviewPuzzlePrev').disabled=reviewAt===0;$('reviewPuzzleNext').disabled=reviewAt===reviewFrames.length-1;
 }
 function openReview(){
  if(!done||!puzzle)return;
  reviewFrames=buildPuzzleReview(puzzle,Chess);
  reviewAt=0;view='review';modeControls();$('puzzleExplanation').textContent='Опубликованное решение Lichess: '+puzzle.line.join(' ')+' · lichess.org/training/'+puzzle.id;drawReview();if(active)window.scrollTo(0,0);
 }
 function closeReview(){if(mode==='daily'){showDailyResult();return;}view='solve';modeControls();draw();}
 $('puzzleRetry').onclick=$('dailyRetry').onclick=$('reviewPuzzleRetry').onclick=retryCurrent;
 $('puzzleReviewOpen').onclick=$('dailyReview').onclick=openReview;
 $('reviewPuzzlePrev').onclick=()=>{if(reviewAt>0){reviewAt--;drawReview();}};
 $('reviewPuzzleNext').onclick=()=>{if(reviewAt<reviewFrames.length-1){reviewAt++;drawReview(true);}};
 $('reviewPuzzleClose').onclick=closeReview;
 $('dailyMore').onclick=()=>switchMode('journey');
 $('dailyShare').onclick=async()=>{
  const value='Johan Chess · Задача дня '+date+' · '+(dailyOutcome==='solved'?'решена':'попытка')+' · '+hearts+'/5 ♥ · '+formatDuration(timer.seconds());
  if(navigator.share){try{await navigator.share({text:value});return;}catch(e){if(e?.name==='AbortError')return;}}
  const field=$('dailyShareText');field.value=value;field.hidden=false;field.focus();field.select();
 };
 async function enter(){
  if(starting)return;
  const next=userNow();
  if(next!==user){
   timer.pause();puzzle=null;game=null;done=false;lastId=null;excluded=new Set();remotePacks=[];
   const oldVisited=read('visited',next,[]);visited=new Set(Array.isArray(oldVisited)?oldVisited:[]);
   user=next;progress=getPuzzleProgress(user);training=normalizeTraining(read('training',user,{}));journey=normalizeJourney(read('journey',user,{}));daily=normalizeDaily(read('daily',user,{}));storageFailed=false;map=true;date=dayKey();calendarDay=date;hearts=5;view='solve';dailyOutcome=null;feedback=null;draw();
  }
  if(!pack){
   starting=true;modeControls();$('journeyNotice').textContent='Загружаю локальную базу Lichess…';
   try{await loadPack();$('journeyNotice').textContent='';}
   catch(e){$('journeyNotice').textContent=e.message;status(e.message);return;}
   finally{starting=false;modeControls();}
  }
  if(userNow()!==user){queueMicrotask(()=>enter());return;}
  if(pendingTheme){abandon();mode='classic';map=false;pendingTheme=false;lastId=null;}
  if(refreshDay())return;
  modeControls();stats();
  if(!puzzle&&!map)start({reset:true});
 }
 document.addEventListener('jc-screen',e=>{active=e.detail==='puzzles';if(active)enter();else modeControls();});
 return {selectTheme(theme){if([...$('puzzleTheme').options].some(o=>o.value===theme)){$('puzzleTheme').value=theme;lastId=null;pendingTheme=true;}}};
}
