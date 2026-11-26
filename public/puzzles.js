import {loadMorePuzzles} from './puzzle-remote.js';
import {Chess} from './chess.js';
import {pieceGraphic} from './piece-art.js';
import {preparePuzzle,advancePuzzle,filterPuzzles,cleanProgress,finishAttempt} from './puzzle-core.js';
import {normalizeTraining,recordOutcome,summarizeTraining,selectTrainingPuzzle} from './puzzle-training.js';
import {parseUci} from './training-core.js';
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
 const status=(s,cls='')=>{$('puzzleStatus').textContent=s;$('puzzleStatus').className=cls;};
 const userNow=()=>String(getUser()||'').trim().toLowerCase();
 function stats(){
  $('puzzleSolved').textContent=String(progress.solved.length);
  $('puzzleStreak').textContent=String(progress.streak);
  const s=summarizeTraining(training);
  $('puzzleAccuracy').textContent=s.accuracy===null?'—':s.accuracy+'%';
  $('puzzleTarget').textContent=String(s.target);
  $('puzzleAttempts').textContent=String(s.attempts);
  $('puzzleStorage').hidden=!storageFailed;
 }
 function all(){const rows=[...new Map([...(pack||[]),...remotePacks.flatMap(p=>p.rows)].map(p=>[p.id,p])).values()];return filterPuzzles(rows,$('puzzleTheme').value,$('puzzleBand').value==='adaptive'?'400-2999':$('puzzleBand').value);}
 function unseen(p){return p&&!progress.solved.includes(p.id)&&!training.records.some(r=>r.id===p.id);}
 function validPick(){const list=all();let next=pick(list);while(next&&list.length){const p=preparePuzzle(next,Chess);if(p)return p;list.splice(list.indexOf(next),1);next=pick(list);}return null;}
 function record(outcome){if(!puzzle)return;training=recordOutcome(training,puzzle,outcome,progress.solved);if(!write('training',user,training))storageFailed=true;document.dispatchEvent(new CustomEvent('jc-puzzle-progress'));}
 function pick(list){return selectTrainingPuzzle(list,training,progress.solved,lastId,$('puzzleBand').value==='adaptive');}
 function save(){if(!write('progress',user,progress)){storageFailed=true;return false;}document.dispatchEvent(new CustomEvent('jc-puzzle-progress'));return true;}
 function draw(){
  const board=$('puzzleBoard');board.replaceChildren();
  $('puzzleArea').hidden=!game;
  $('puzzleHint').disabled=!game||done||!!promotion.length;
  $('puzzleReveal').disabled=!game||done||!!promotion.length;
  $('puzzlePromotion').hidden=!promotion.length;
  if(!game)return;
  const flip=puzzle.color==='b',order=Array.from({length:8},(_,i)=>flip?7-i:i);
  const moves=selected&&!done&&!promotion.length?game.moves({square:selected,verbose:true}):[];
  for(const [ri,r] of order.entries())for(const [fi,f] of order.entries()){
   const sq='abcdefgh'[f]+(8-r),piece=game.get(sq),cell=elem('button','square '+((r+f)%2?'dark':'light')+(sq===selected?' selected':'')+(moves.some(m=>m.to===sq)?' target':'')+(highlight?.includes(sq)?' puzzle-mark':''));
   cell.type='button';cell.disabled=starting||done||!!promotion.length;cell.setAttribute('aria-label',sq+(piece?' '+piece.color+piece.type:''));
   if(piece)cell.append(pieceGraphic(piece));
   if(fi===0)cell.append(elem('span','coord',String(8-r)));
   if(ri===7)cell.append(elem('span','coord file','abcdefgh'[f]));
   cell.onclick=()=>click(sq);board.append(cell);
  }
 }
 async function start({reset=false}={}){
  if(starting)return;starting=true;pendingTheme=false;
  $('puzzleNext').disabled=$('puzzleTheme').disabled=$('puzzleBand').disabled=true;
  if(!reset&&puzzle&&!done){record('skipped');progress={...progress,streak:0};save();}
  puzzle=null;game=null;step=0;selected=null;highlight=null;promotion=[];done=false;assisted=false;
  let notice='';puzzle=validPick();draw();
  try{
   const adaptive=$('puzzleBand').value==='adaptive';
   if(!unseen(puzzle)||(adaptive&&Math.abs(puzzle.rating-training.target)>200)){
    status('Подгружаю задачи Lichess с GitHub…');
    const extra=await loadMorePuzzles({theme:$('puzzleTheme').value,band:$('puzzleBand').value,target:training.target,excluded,seen:visited});
    if(extra){excluded.add(extra.key);visited.add(extra.key);write('visited',user,[...visited].slice(-20000));remotePacks=[...remotePacks,extra].slice(-4);if(!extra.persisted)notice=' · пакет не сохранён в офлайн-кэш';puzzle=validPick();}
   }
  }catch(e){notice=' · GitHub недоступен, используем локальные задачи';}
  finally{starting=false;$('puzzleNext').disabled=$('puzzleTheme').disabled=$('puzzleBand').disabled=false;if(pendingTheme)queueMicrotask(()=>{if(userNow()===user)start();else enter();});}
  $('puzzleCacheInfo').textContent='В памяти: '+new Set([...(pack||[]),...remotePacks.flatMap(p=>p.rows)].map(p=>p.id)).size+' задач · кэш до 50 МБ';
  if(!puzzle){$('puzzleTurn').textContent='';$('puzzleExplanation').hidden=true;$('puzzleTitle').textContent='Нет задач';$('puzzleNext').disabled=false;$('puzzleNext').textContent='Повторить загрузку';status('В этой категории пока нет доступных задач'+notice+'. Попробуй снова или выбери другую тему.');draw();stats();return;}
  lastId=puzzle.id;game=new Chess(puzzle.startFen);$('puzzleNext').disabled=false;$('puzzleNext').textContent='Пропустить';
  $('puzzleTitle').textContent='Lichess #'+puzzle.id+' · '+puzzle.rating;
  $('puzzleTurn').textContent=game.turn()==='w'?'Ход белых':'Ход чёрных';
  $('puzzleExplanation').hidden=true;$('puzzleExplanation').textContent='';
  status('Найди решение'+notice+'.');draw();stats();
 }
 function finish(reveal=false){
  if(done||!game)return;
  done=true;selected=null;promotion=[];
  if(!reveal){record(assisted?'assisted':'clean');progress=finishAttempt(progress,puzzle.id,assisted);status(save()?(assisted?'Верно! Решено с помощью.':'Верно! С первого раза.'):'Верно! Не удалось сохранить прогресс.','puzzle-success');}
  else{record('assisted');progress={...progress,streak:0};save();status('Решение показано · не засчитано','');}
  $('puzzleExplanation').textContent='Вариант из базы Lichess: '+puzzle.line.join(' ')+' · lichess.org/training/'+puzzle.id;
  $('puzzleExplanation').hidden=false;$('puzzleNext').textContent='Следующая задача';draw();stats();
 }
 function tryMove(m){
  if(done||!game)return;
  promotion=[];selected=null;highlight=null;
  const next=advancePuzzle(puzzle,game,step,m,Chess);
  if(next){game=next.game;step=next.index;const last=next.reply||next.played;highlight=[last.from,last.to];if(next.done){finish();return;}status('Верно! Соперник ответил '+next.reply.san+'. Продолжай.','puzzle-success');draw();return;}
  assisted=true;record('assisted');progress={...progress,streak:0};save();
  status('Не совпадает с решением Lichess. Попробуй ещё раз.','puzzle-wrong');draw();stats();
 }
 function click(sq){
  if(done||!game||promotion.length)return;
  if(selected){
   const moves=game.moves({square:selected,verbose:true}).filter(m=>m.to===sq);
   if(moves.length>1){promotion=moves;draw();return;}
   if(moves.length===1){tryMove(moves[0]);return;}
  }
  const p=game.get(sq);selected=p?.color===game.turn()&&selected!==sq?sq:null;highlight=null;draw();
 }
 $('puzzleNext').onclick=()=>start();
 $('puzzleTheme').onchange=$('puzzleBand').onchange=()=>{lastId=null;if(pack)start();};
 $('puzzleHint').onclick=()=>{if(done||!game)return;assisted=true;record('assisted');progress={...progress,streak:0};save();highlight=[puzzle.solution[step].slice(0,2)];selected=null;status('Подсказка: начни с выделенной фигуры.');draw();stats();};
 $('puzzleReveal').onclick=()=>{if(done||!game)return;while(step<puzzle.solution.length){const m=game.move(parseUci(puzzle.solution[step++]));highlight=[m.from,m.to];}finish(true);};
 for(const type of ['q','r','b','n'])$('puzzle-promote-'+type).onclick=()=>{const m=promotion.find(x=>x.promotion===type);if(m)tryMove(m);};
 $('puzzle-promote-cancel').onclick=()=>{promotion=[];draw();};
 async function enter(){
  try{if(!pack){status('Загружаю локальную базу Lichess…');await loadPack();}}catch(e){status(e.message);return;}
  const next=userNow();if(starting)return;
  if(next!==user||!puzzle||pendingTheme){if(next!==user){excluded=new Set();remotePacks=[];const oldVisited=read('visited',next,[]);visited=new Set(Array.isArray(oldVisited)?oldVisited:[]);}user=next;progress=getPuzzleProgress(user);training=normalizeTraining(read('training',user,{}));storageFailed=false;lastId=null;start({reset:true});}
  else stats();
 }
 document.addEventListener('jc-screen',e=>{if(e.detail==='puzzles')enter();});
 return {selectTheme(theme){if([...$('puzzleTheme').options].some(o=>o.value===theme)){$('puzzleTheme').value=theme;lastId=null;pendingTheme=true;}}};
}
