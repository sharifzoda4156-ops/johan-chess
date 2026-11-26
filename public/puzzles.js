import {Chess} from './chess.js';
import {pieceGraphic} from './piece-art.js';
import {PACK,THEMES,solutions,uci,personalPuzzles,mergePersonal,cleanProgress,finishAttempt,choosePuzzle} from './puzzle-core.js';
const $=id=>document.getElementById(id),key=(kind,user)=>'jc-puzzle-'+kind+':'+String(user||'').trim().toLowerCase();
function read(kind,user,fallback){try{return JSON.parse(localStorage.getItem(key(kind,user))||'null')??fallback;}catch{return fallback;}}
function write(kind,user,value){try{localStorage.setItem(key(kind,user),JSON.stringify(value));return true;}catch{return false;}}
export const getPuzzleProgress=user=>cleanProgress(read('progress',user,{}));
export function rememberPersonal(context){
 if(!context?.user)return false;
 const next=personalPuzzles(context,Chess);
 if(!next.length)return true;
 const stored=read('personal',context.user,[]);
 return write('personal',context.user,mergePersonal(Array.isArray(stored)?stored:[],next));
}
function elem(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
export function initPuzzles(getUser){
 let puzzle=null,game=null,answer=[],selected=null,highlight=null,promotion=[],done=false,assisted=false,user='',progress=cleanProgress(null),lastId=null;
 const status=(s,cls='')=>{$('puzzleStatus').textContent=s;$('puzzleStatus').className=cls;};
 const userNow=()=>String(getUser()||'').trim().toLowerCase();
 function stats(){
  $('puzzleSolved').textContent=String(progress.solved.length);
  $('puzzleStreak').textContent=String(progress.streak);
  $('puzzleAccuracy').textContent=progress.completed?Math.round(100*progress.clean/progress.completed)+'%':'—';
 }
 function all(){
  const stored=read('personal',user,[]);
  const personal=Array.isArray(stored)?stored.filter(p=>p?.theme==='personal'&&p.goal==='best'):[];
  return [...PACK,...personal].filter(p=>($('puzzleTheme').value==='all'||p.theme===$('puzzleTheme').value));
 }
 function save(){if(!write('progress',user,progress))return false;document.dispatchEvent(new CustomEvent('jc-puzzle-progress'));return true;}
 function draw(){
  const board=$('puzzleBoard');board.replaceChildren();
  $('puzzleArea').hidden=!game;
  $('puzzleHint').disabled=!game||done||!!promotion.length;
  $('puzzleReveal').disabled=!game||done||!!promotion.length;
  $('puzzlePromotion').hidden=!promotion.length;
  if(!game)return;
  const flip=puzzle.fen.split(' ')[1]==='b',order=Array.from({length:8},(_,i)=>flip?7-i:i);
  const moves=selected&&!done&&!promotion.length?game.moves({square:selected,verbose:true}):[];
  for(const [ri,r] of order.entries())for(const [fi,f] of order.entries()){
   const sq='abcdefgh'[f]+(8-r),piece=game.get(sq),cell=elem('button','square '+((r+f)%2?'dark':'light')+(sq===selected?' selected':'')+(moves.some(m=>m.to===sq)?' target':'')+(highlight?.includes(sq)?' puzzle-mark':''));
   cell.type='button';cell.disabled=done||!!promotion.length;cell.setAttribute('aria-label',sq+(piece?' '+piece.color+piece.type:''));
   if(piece)cell.append(pieceGraphic(piece));
   if(fi===0)cell.append(elem('span','coord',String(8-r)));
   if(ri===7)cell.append(elem('span','coord file','abcdefgh'[f]));
   cell.onclick=()=>click(sq);board.append(cell);
  }
 }
 function start({reset=false}={}){
  if(!reset&&puzzle&&!done){progress={...progress,streak:0};save();}
  puzzle=null;game=null;answer=[];selected=null;highlight=null;promotion=[];done=false;assisted=false;
  const list=all();let next=choosePuzzle(list,progress,lastId);
  while(next&&list.length){
   answer=solutions(next,Chess);if(answer.length){puzzle=next;break;}
   list.splice(list.indexOf(next),1);next=choosePuzzle(list,progress,lastId);
  }
  if(!puzzle){$('puzzleTurn').textContent='';$('puzzleExplanation').hidden=true;$('puzzleTitle').textContent='Нет задач';$('puzzleNext').disabled=true;status('Сначала проанализируй завершённую партию, чтобы получить персональные задачи.');draw();stats();return;}
  lastId=puzzle.id;game=new Chess(puzzle.fen);$('puzzleNext').disabled=false;$('puzzleNext').textContent='Пропустить';
  $('puzzleTitle').textContent=puzzle.title;
  $('puzzleTurn').textContent=game.turn()==='w'?'Ход белых':'Ход чёрных';
  $('puzzleExplanation').hidden=true;$('puzzleExplanation').textContent='';
  status('Найди решение.');draw();stats();
 }
 function finish(move,reveal=false){
  if(done||!game)return;
  game.move({from:move.from,to:move.to,...(move.promotion?{promotion:move.promotion}:{})});
  done=true;selected=null;promotion=[];highlight=[move.from,move.to];
  if(!reveal){progress=finishAttempt(progress,puzzle.id,assisted);status(save()?(assisted?'Верно! Решено с помощью.':'Верно! С первого раза.'):'Верно! Не удалось сохранить прогресс.','puzzle-success');}
  else{progress={...progress,streak:0};save();status('Решение: '+move.san+' · не засчитано','');}
  $('puzzleExplanation').textContent=puzzle.explanation+' Ход: '+move.san+'.';
  $('puzzleExplanation').hidden=false;$('puzzleNext').textContent='Следующая задача';draw();stats();
 }
 function tryMove(m){
  if(done||!game)return;
  promotion=[];selected=null;highlight=null;
  if(answer.some(x=>uci(x)===uci(m))){finish(m);return;}
  assisted=true;progress={...progress,streak:0};save();
  status(puzzle.goal==='best'?'Это другой легальный ход. Попробуй найти рекомендацию Stockfish.':'Не решает поставленную задачу. Попробуй ещё раз.','puzzle-wrong');draw();stats();
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
 $('puzzleTheme').onchange=()=>{lastId=null;start();};
 $('puzzleHint').onclick=()=>{if(done||!answer.length)return;assisted=true;progress={...progress,streak:0};save();highlight=[answer[0].from];selected=null;status('Подсказка: начни с выделенной фигуры.');draw();stats();};
 $('puzzleReveal').onclick=()=>{if(!done&&answer.length)finish(answer[0],true);};
 for(const type of ['q','r','b','n'])$('puzzle-promote-'+type).onclick=()=>{const m=promotion.find(x=>x.promotion===type);if(m)tryMove(m);};
 $('puzzle-promote-cancel').onclick=()=>{promotion=[];draw();};
 function enter(){
  const next=userNow();if(next!==user||!puzzle){user=next;progress=getPuzzleProgress(user);lastId=null;start({reset:true});}
  else stats();
 }
 document.addEventListener('jc-screen',e=>{if(e.detail==='puzzles')enter();});
}
