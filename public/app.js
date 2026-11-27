import {platformFetch} from './platform-api.js';
import {initStudyLibrary} from './study-library.js';
import {parseOpenings} from './study-core.js';
import {TOPICS} from './puzzle-training.js';
import {initPuzzles,getPuzzleProgress,getPuzzleTraining} from './puzzles.js';
import {displayName,profileStats} from './profile-core.js';
import {initProfileDashboard} from './profile-dashboard.js';
import {initThemes} from './piece-art.js';
import {renderBoardView,scrollBehavior,initBoardMotion,decoratePromotionButtons} from './board-view.js';
import {findKingSquare,renderMaterial} from './material.js';
import {initSoundSetting,playSound,soundForMove} from './sound.js';
import {initNavigation} from './navigation.js';
import {initTraining} from './training.js';
import {initOnline} from './online.js';
import {initGameShare,saveNativeFile} from './game-share.js';
import {hasOpenDialog,closeOpenDialog} from './dialog.js';
import {initCoach,rememberGame,coachBusy} from './android-coach.js';
import {Chess} from './chess.js';
import {normalizePgn,splitPgn,buildPgn} from './pgn.js';
import {Engine,setEngineOnlineLock,formatEngineProgress,warmEngineCache} from './engine.js';
import {enginePath} from './engine-path.js';
import {MOVE_CLASSES,classifyMove,isSacrificeMove,estimateGameRating,isKeyClass,winChance,displayScore,scoreValue} from './metrics.js';
const $=id=>document.getElementById(id), status=t=>{$('status').textContent=t;$('reviewBoardStatus').textContent=t;};
let training=null,onlineUI=null,importing=false,analysisDepth=null,game=null, moves=[], positions=[], results=[], cursor=0, flipped=false, engine=null, busy=false, runId=0, imported=[], startFen='', pgn='', historical=null,onlineLocked=false,onlineReviewName='',sideFilter='both';
let openingMap=null,openingPromise=null,detectedOpening=null;
let explore=null,exploreSelected=null,explorePromo=[],retryTarget=null,reviewHint=null,reviewHintBusy=false,hintEngine=null;
initThemes();initBoardMotion();initSoundSetting();
const navigation=initNavigation();
const isDesktop=()=>globalThis.matchMedia?.('(min-width: 900px)').matches===true;
let reviewFocus=false,reviewStripMoves=null;
function syncReviewFocus(){const visible=!document.querySelector('[data-screen="review"]').hidden;const focus=!!(visible&&reviewFocus&&game&&!onlineLocked&&!training?.active()&&!isDesktop());document.body.classList.toggle('review-board-focus',focus);$('reviewOpenBoard').hidden=!game||isDesktop();}
function openReviewBoard(value){reviewFocus=!!value;syncReviewFocus();if(!isDesktop())window.scrollTo({top:0,behavior:'auto'});}
document.addEventListener('jc-screen',syncReviewFocus);
globalThis.matchMedia?.('(min-width: 900px)').addEventListener?.('change',syncReviewFocus);
globalThis.JohanHandleBack=()=>{
 if(hasOpenDialog()){closeOpenDialog();return true;}
 if(onlineUI?.handleBack?.())return true;
 if(onlineLocked)return true;
 if(training?.handleBack?.())return true;
 if(document.body.classList.contains('review-board-focus')){openReviewBoard(false);return true;}
 const puzzlesScreen=document.querySelector('[data-screen="puzzles"]');
 if(puzzlesScreen&&!puzzlesScreen.hidden&&$('puzzleReview')&&!$('puzzleReview').hidden){$('reviewPuzzleClose')?.click();return true;}
 if(document.body.classList.contains('puzzle-focus')){$('journeyBack')?.click();return true;}
 const cur=navigation.current();
 if(cur==='account'){navigation.show('profile');return true;}
 if(cur==='library'&&globalThis.JohanNative){navigation.show('coach');return true;}
 if(cur!=='home'){navigation.show('home');return true;}
 return false;
};
$('reviewOpenBoard').onclick=()=>openReviewBoard(true);$('reviewCloseBoard').onclick=()=>openReviewBoard(false);$('reviewAnalyze').onclick=()=>{if(busy)$('stop').click();else $('analyze').click();};
const player=c=>game?.getHeaders()[c==='w'?'White':'Black']|| (c==='w'?'Белые':'Чёрные');
const matchedSide=()=>{const nick=(onlineReviewName||$('user').value.trim()).toLowerCase();if(!nick)return null;if(player('w').toLowerCase()===nick)return 'w';if(player('b').toLowerCase()===nick)return 'b';return null;};
const own=()=>matchedSide()||'w';
function matchesSideFilter(r){if(sideFilter==='both')return true;if(sideFilter==='w'||sideFilter==='b')return r.color===sideFilter;const m=matchedSide();return m?r.color===m:true;}
function syncSideFilterUI(){const box=$('reviewSideFilter');if(!box)return;for(const btn of box.querySelectorAll('button[data-side]'))btn.setAttribute('aria-pressed',String(btn.dataset.side===sideFilter));}
if($('reviewSideFilter'))for(const btn of $('reviewSideFilter').querySelectorAll('button[data-side]'))btn.onclick=()=>{sideFilter=btn.dataset.side;syncSideFilterUI();renderReport();renderBoard();};
const uci=m=>m.from+m.to+(m.promotion||'');

function stripMoveNumbers(text){return String(text||'').replace(/\d+\.+/g,'').trim().replace(/\s+/g,' ');}
function loadOpeningBook(){
 if(openingMap)return Promise.resolve(openingMap);
 if(!openingPromise){
  openingPromise=Promise.all(['a','b','c','d','e'].map(k=>fetch('./openings/'+k+'.tsv').then(r=>r.ok?r.text():'').catch(()=>'')))
   .then(texts=>{
    const map=new Map();
    for(const row of texts.flatMap(parseOpenings)){
     const seq=stripMoveNumbers(row.pgn);
     if(seq&&!map.has(seq))map.set(seq,{eco:row.eco,name:row.name,ply:seq.split(' ').length});
    }
    openingMap=map;
    return map;
   }).catch(()=>new Map());
 }
 return openingPromise;
}
function matchOpening(moveList){
 if(!openingMap||!moveList.length)return null;
 let found=null,seq='';
 const limit=Math.min(moveList.length,16);
 for(let i=0;i<limit;i++){
  seq=i?seq+' '+moveList[i].san:moveList[i].san;
  const hit=openingMap.get(seq);
  if(hit)found=hit;
 }
 return found;
}
function clearExplore(keepRetry=false){
 if(hintEngine){hintEngine.close();hintEngine=null;}
 explore=null;exploreSelected=null;explorePromo=[];reviewHint=null;reviewHintBusy=false;
 if(!keepRetry)retryTarget=null;
}
function currentDisplayChess(){
 if(explore)return explore.chess;
 return game?new Chess(positions[cursor]):null;
}
function renderEvalBar(){
 const fill=$('reviewEvalFill'),txt=$('reviewEvalText');
 if(!fill||!txt)return;
 let whiteScore=null;
 if(!explore&&results.length){
  if(cursor>0&&results[cursor-1]){
   const r=results[cursor-1];
   whiteScore={kind:r.playedScore.kind,value:r.playedScore.value*(r.color==='w'?1:-1)};
  }else if(cursor===0&&results[0]){
   const r=results[0];
   whiteScore={kind:r.bestScore.kind,value:r.bestScore.value*(r.color==='w'?1:-1)};
  }
 }
 if(!whiteScore){fill.style.width='50%';txt.textContent='0.00';return;}
 const pct=Math.max(4,Math.min(96,Math.round(winChance(whiteScore))));
 fill.style.width=pct+'%';
 txt.textContent=displayScore(whiteScore);
}
function load(text,study=null){
 if(busy||onlineLocked||training?.active())return false;
 try{const c=new Chess();c.loadPgn(normalizePgn(text));const h=c.history({verbose:true});if(!h.length)throw Error('В PGN нет ходов. Экспортируй полную партию.');
 clearExplore();historical=study;onlineReviewName='';game=c;moves=h;startFen=h[0].before;positions=[startFen,...h.map(m=>m.after)];pgn=text;results=[];analysisDepth=null;cursor=0;
 detectedOpening=matchOpening(moves);
 if(!openingMap)loadOpeningBook().then(()=>{if(game===c){detectedOpening=matchOpening(moves);renderCoach();renderReport();}});
 const mine=historical?null:matchedSide();sideFilter=mine?'mine':'both';syncSideFilterUI();flipped=historical?historical.result==='0-1':mine==='b';$('review').hidden=false;$('analyze').disabled=false;$('export').disabled=true;$('progress').hidden=true;if(isDesktop()&&$('importSource'))$('importSource').open=false;openReviewBoard(true);render();if(isDesktop())$('review').scrollIntoView({behavior:'auto',block:'start'});status((historical?historical.title+' · '+historical.year:'Партия загружена')+': '+h.length+' полуходов.');return true;
 }catch(e){status('Не удалось прочитать PGN: '+e.message);return false;}
}
function loadText(text){
  if(importing)return false;
  const list=splitPgn(text);
  if(list.length>1){
    imported=list.map(g=>({pgn:g}));const select=$('games');select.replaceChildren();
    list.forEach((g,i)=>{const t=n=>(g.match(new RegExp('\\[' +n+ '\\s+"([^"]*)"'))||[])[1]||'?';const o=document.createElement('option');o.value=i;o.textContent=`${i+1}. ${t('White')} — ${t('Black')} · ${t('Date')}`;select.append(o);});
    select.value='0';select.hidden=false;
    if(!load(list[0]))return false;
    status(`Найдено партий: ${list.length}. Выбери партию в списке.`);return true;
  }
  imported=[];$('games').hidden=true;return load(text);
}
$('pgnFile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f||importing)return;if(f.size>5*1024*1024){status('Файл больше 5 МБ.');return;}try{loadText(await f.text());}catch(err){status('Не удалось прочитать файл: '+err.message);}};
function currentPgn(){return buildPgn({headers:game.getHeaders(),moves,results,depth:analysisDepth??Number($('depth').value)});}
function syncPgnButtons(){$('exportPgn').disabled=!results.length;$('copyPgn').disabled=!game;for(const id of ['sharePgnFile','sharePgnText'])$(id).disabled=!game||onlineLocked||!['1-0','0-1','1/2-1/2'].includes(game.getHeaders().Result);}
async function downloadOrSave(filename,mime,content){
 if(globalThis.JohanShare){
  try{const r=await saveNativeFile({filename,mime,content});if(r?.saved)status('Файл сохранён: '+filename);}catch(e){status(e.message||'Не удалось сохранить файл');}
  return;
 }
 const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('exportPgn').onclick=()=>{if(!game||!results.length)return;downloadOrSave('johan-chess-analysis.pgn','application/x-chess-pgn',currentPgn());};
$('copyPgn').onclick=async()=>{if(!game)return;const text=currentPgn();try{await navigator.clipboard.writeText(text);status('PGN скопирован.');}catch{$('pgn').value=text;$('importSource').open=true;status('Буфер обмена недоступен: PGN помещён в поле ввода.');}};
$('fetch').onclick=async()=>{if(busy||importing||training?.active())return;importing=true;for(const id of ['fetch','load','games','user'])$(id).disabled=true;status('Загружаю завершённые партии…');try{const r=await platformFetch('/api/games?user='+encodeURIComponent($('user').value.trim()));const data=await r.json();if(!r.ok)throw Error(data.error);imported=data.games||[];if(!imported.length)throw Error('Партии не найдены');const select=$('games');select.replaceChildren();imported.forEach((g,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${g.white} — ${g.black} · ${g.timeClass||''} · ${new Date(g.ended*1000).toLocaleDateString('ru')}`;select.append(o);});select.hidden=false;load(imported[0].pgn);}catch(e){status(e.message);$('importSource').open=true;}finally{importing=false;for(const id of ['fetch','load','games','user'])$(id).disabled=busy||!!training?.active();}};
$('games').onchange=()=>{if(importing)return;const g=imported[Number($('games').value)];if(g)load(g.pgn);};
function setBusy(v){busy=v;for(const id of ['fetch','load','games','user','depth'])$(id).disabled=v;$('analyze').disabled=v||!game;$('stop').hidden=!v;$('reviewAnalyze').setAttribute('aria-label',v?'Остановить анализ':'Анализ партии');$('reviewAnalyze').classList.toggle('running',v);}
$('analyze').onclick=async()=>{
 if(busy||onlineLocked||!game||training?.active()||importing)return;
 const id=++runId,depth=Number($('depth').value);analysisDepth=depth;clearExplore();setBusy(true);results=[];render();$('export').disabled=true;const progress=$('progress');progress.hidden=false;progress.max=moves.length;progress.value=0;let local;
 try{
  await loadOpeningBook();
  if(id!==runId)return;
  detectedOpening=matchOpening(moves);
  const bookPlies=detectedOpening?Math.min(detectedOpening.ply,12):0;
  status('Запускаю Stockfish…');local=new Engine(enginePath,{onProgress:p=>{if(id===runId)status(formatEngineProgress(p));}});engine=local;await local.init();const prefix=[];
  for(let i=0;i<moves.length;i++){
   if(id!==runId)return;
   const m=moves[i],actualMove=uci(m);
   status(`Анализ ${i+1} / ${moves.length} · ${m.san}`);
   const multi=await local.searchMulti(startFen,prefix,depth,2);
   if(id!==runId)return;
   const isBest=multi.best===actualMove;
   const secondLine=multi.lines.find(l=>l.move&&l.move!==multi.best)||null;
   const played=isBest?multi:(secondLine&&secondLine.move===actualMove?secondLine:await local.search(startFen,prefix,depth,actualMove));
   if(id!==runId)return;
   const isBook=i<bookPlies;
   const sacrifice=!isBook&&isSacrificeMove({beforeFen:m.before,move:m,pv:played.pv,Chess});
   const metrics=classifyMove({best:multi.score,actual:played.score,second:secondLine?.score||null,isBest,isBook,isSacrifice:sacrifice});
   const c=new Chess(m.before);let bestSan=multi.best;try{bestSan=c.move({from:multi.best.slice(0,2),to:multi.best.slice(2,4),...(multi.best.length>4?{promotion:multi.best[4]}:{})}).san;}catch{}
   const continuation=new Chess(m.before),pv=[];for(const u of multi.pv.slice(0,6)){try{pv.push(continuation.move({from:u.slice(0,2),to:u.slice(2,4),...(u.length>4?{promotion:u[4]}:{})}).san);}catch{break;}}
   results.push({index:i,color:m.color,san:m.san,move:actualMove,best:multi.best,bestSan,pv,bestScore:multi.score,playedScore:played.score,...metrics});
   prefix.push(actualMove);progress.value=i+1;renderReport();renderCoach();renderBoard();
  }
  const completedContext=coachContext();if(!historical){rememberGame(completedContext);refreshProfile();}
  status('Анализ завершён · выбери ключевой момент.');$('export').disabled=false;
 }catch(e){if(id===runId)status('Анализ прерван: '+e.message);}
 finally{if(id===runId){local?.close();engine=null;setBusy(false);render();$('export').disabled=!results.length;}}
};
$('stop').onclick=()=>{runId++;engine?.close();engine=null;setBusy(false);status('Анализ остановлен. Частичный отчёт сохранён на экране.');$('export').disabled=!results.length;render();};
function render(){if(!game)return;syncPgnButtons();renderBoard();renderCoach();renderReport();}
function applyExploreMove(move,via='tap'){
 if(!game)return;
 const base=explore?explore.chess:new Chess(positions[cursor]);
 const next=new Chess(base.fen());
 const played=next.move({from:move.from,to:move.to,...(move.promotion?{promotion:move.promotion}:{})});
 if(!played)return;
 if(!explore)explore={baseCursor:cursor,chess:next,frames:[{fen:positions[cursor],last:moves[cursor-1]||null},{fen:next.fen(),last:played}]};
 else{explore.chess=next;explore.frames.push({fen:next.fen(),last:played});}
 exploreSelected=null;explorePromo=[];reviewHint=null;
 playSound(soundForMove(played,next));
 // Check if user was retrying a mistake from this position
 if(retryTarget&&retryTarget.ply===explore.baseCursor&&explore.frames.length===2){
  const playedUci=uci(played);
  if(playedUci===retryTarget.best){
   retryTarget={...retryTarget,solved:true};
   playSound('end');
  }else{
   retryTarget={...retryTarget,tried:played.san};
  }
 }
 renderBoard([{...played,dragged:via==='drag'}]);
 renderCoach();
}
function reviewBoardDrop(from,to){
 if(!game||explorePromo.length)return;
 const c=currentDisplayChess();if(!c)return;
 const options=c.moves({square:from,verbose:true}).filter(m=>m.to===to);
 if(options.length>1){explorePromo=options;renderBoard();return;}
 if(options.length===1){applyExploreMove(options[0],'drag');}
}
function reviewBoardClick(sq){
 if(!game||explorePromo.length)return;
 const c=currentDisplayChess();if(!c)return;
 if(exploreSelected){
  const options=c.moves({square:exploreSelected,verbose:true}).filter(m=>m.to===sq);
  if(options.length>1){explorePromo=options;renderBoard();return;}
  if(options.length===1){applyExploreMove(options[0],'tap');return;}
 }
 const p=c.get(sq);
 exploreSelected=p&&p.color===c.turn()&&exploreSelected!==sq?sq:null;
 renderBoard();
}
async function requestReviewHint(){
 if(!game||reviewHintBusy||onlineLocked||explorePromo.length)return;
 const c=currentDisplayChess();if(!c||c.isGameOver())return;
 const fen=c.fen();
 if(reviewHint&&reviewHint.fen===fen){
  if(reviewHint.step===1){reviewHint={...reviewHint,step:2};renderBoard();renderCoach();}
  return;
 }
 // Fast path: if on main line and move at `cursor` was already analyzed, use its top Stockfish move immediately.
 if(!explore&&results[cursor]?.best){
  const u=results[cursor].best;
  reviewHint={fen,from:u.slice(0,2),to:u.slice(2,4),step:1};
  renderBoard();renderCoach();
  return;
 }
 if(busy)return;
 reviewHintBusy=true;exploreSelected=null;
 status('Stockfish ищет лучшую подсказку…');renderBoard();
 try{
  if(hintEngine){hintEngine.close();hintEngine=null;}
  const local=new Engine(enginePath,{onProgress:p=>{if(hintEngine===local)status(formatEngineProgress(p));}});hintEngine=local;
  await local.init();
  await local.setSkill(20);
  const best=await local.choose(fen,[],550);
  if(hintEngine===local){local.close();hintEngine=null;}
  if(currentDisplayChess()?.fen()===fen&&/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(best)){
   reviewHint={fen,from:best.slice(0,2),to:best.slice(2,4),step:1};
   status('Подсказка: ходи подсвеченной фигурой (нажми ещё раз для хода)');
  }
 }catch(e){
  status('Не удалось получить подсказку');
 }finally{
  reviewHintBusy=false;renderBoard();renderCoach();
 }
}
function undoReviewExplore(){
 if(!explore)return;
 reviewHint=null;exploreSelected=null;explorePromo=[];
 if(explore.frames.length>2){
  explore.frames.pop();
  explore.chess=new Chess(explore.frames.at(-1).fen);
 }else{
  explore=null;
  if(retryTarget)retryTarget={...retryTarget,solved:false,tried:null};
 }
 renderBoard();renderCoach();
}
function jumpNextKeyMove(){
 if(!results.length)return;
 const keyPlies=results.filter(r=>matchesSideFilter(r)&&isKeyClass(r.kind)).map(r=>r.index+1);
 if(!keyPlies.length)return;
 const nextPly=keyPlies.find(p=>p>cursor)??keyPlies[0];
 go(nextPly);
}
function renderBoard(animateMoves=[]){
 const c=currentDisplayChess();if(!c)return;
 const rows=c.board();
 const targets=exploreSelected&&!explorePromo.length?c.moves({square:exploreSelected,verbose:true}).map(m=>m.to):[];
 const lastMove=explore?explore.frames.at(-1).last:moves[cursor-1]||null;
 const curResult=!explore&&cursor>0?results[cursor-1]:null;
 const activeHint=reviewHint&&reviewHint.fen===c.fen()?reviewHint:null;
 const hintSquare=activeHint?activeHint.from:null;
 const hintTarget=activeHint&&activeHint.step>=2?activeHint.to:null;
 let arrows=[];
 if(activeHint&&activeHint.step>=2){
  arrows=[{from:activeHint.from,to:activeHint.to,brush:'hint'}];
 }else if(curResult&&curResult.best&&curResult.best!==curResult.move&&curResult.loss>=2&&!retryTarget){
  arrows=[{from:curResult.best.slice(0,2),to:curResult.best.slice(2,4),brush:'best'}];
 }
 const badge=curResult&&lastMove?{square:lastMove.to,symbol:curResult.symbol,kind:curResult.kind}:null;
 renderBoardView($('board'),{
  rows,flip:flipped,interactive:true,disabled:explorePromo.length>0,
  onClick:reviewBoardClick,onDrop:reviewBoardDrop,
  selected:exploreSelected,targets,last:lastMove,
  checkSquare:c.isCheck()?findKingSquare(rows,c.turn()):null,
  hintSquare,hintTarget,arrows,badge,animateMoves
 });
 if(explorePromo.length)decoratePromotionButtons($('reviewPromotion'),c.turn(),'reviewPromote');
 if($('reviewPromotion'))$('reviewPromotion').hidden=!explorePromo.length;
 if($('reviewExplorePill'))$('reviewExplorePill').hidden=!explore;
 $('top').textContent=player(flipped?'w':'b');$('bottom').textContent=player(flipped?'b':'w');
 renderMaterial($('reviewTopMat'),rows,flipped?'w':'b');renderMaterial($('reviewBottomMat'),rows,flipped?'b':'w');
 $('moveNumber').textContent=explore?'Пробный вариант':cursor?label(cursor-1):'Старт';
 syncReviewStrip();
 renderEvalBar();
 $('first').disabled=!explore&&cursor===0;$('back').disabled=!explore&&cursor===0;
 $('next').disabled=!explore&&cursor===moves.length;$('last').disabled=!explore&&cursor===moves.length;
 if($('reviewUndo'))$('reviewUndo').disabled=!explore;
 if($('reviewHint')){
  $('reviewHint').disabled=reviewHintBusy||onlineLocked||c.isGameOver()||(busy&&(!results[cursor]||!!explore));
  $('reviewHint').classList.toggle('is-active',!!activeHint);
 }
 if($('reviewKeyMove'))$('reviewKeyMove').disabled=!results.some(r=>matchesSideFilter(r)&&isKeyClass(r.kind));
}
function syncReviewStrip(){
 const strip=$('reviewMoveStrip');
 if(reviewStripMoves!==moves){reviewStripMoves=moves;const frag=document.createDocumentFragment();for(let i=0;i<moves.length;i++){const b=document.createElement('button');b.type='button';b.textContent=label(i);b.dataset.ply=String(i+1);b.onclick=()=>go(i+1);frag.append(b);}strip.replaceChildren(frag);}
 const previous=strip.querySelector('[aria-current="step"]');if(previous)previous.removeAttribute('aria-current');const current=cursor>0?strip.children[cursor-1]:null;
 if(current){current.setAttribute('aria-current','step');strip.scrollLeft=Math.max(0,current.offsetLeft-strip.offsetLeft-(strip.clientWidth-current.offsetWidth)/2);}else strip.scrollLeft=0;
}
function label(i){const m=moves[i];return m.before.split(' ')[5]+(m.color==='w'?'. ':'... ')+m.san;}
function go(n){
 const previous=cursor,wasExploring=!!explore;
 clearExplore();
 cursor=Math.max(0,Math.min(n,moves.length));
 if(cursor===previous&&!wasExploring)return;
 const step=!wasExploring&&cursor===previous+1?[moves[previous]]:[];
 renderBoard(step);if(step.length)playSound(soundForMove(step[0]));renderCoach();updateActiveMove();chart();
}
$('first').onclick=()=>go(0);$('back').onclick=()=>explore?undoReviewExplore():go(cursor-1);$('next').onclick=()=>explore?(clearExplore(),renderBoard(),renderCoach()):go(cursor+1);$('last').onclick=()=>go(moves.length);$('flip').onclick=()=>{flipped=!flipped;renderBoard();};
if($('reviewHint'))$('reviewHint').onclick=()=>requestReviewHint();
if($('reviewUndo'))$('reviewUndo').onclick=()=>undoReviewExplore();
if($('reviewKeyMove'))$('reviewKeyMove').onclick=()=>jumpNextKeyMove();
if($('reviewExplorePill'))$('reviewExplorePill').onclick=()=>{clearExplore();renderBoard();renderCoach();};
for(const type of ['q','r','b','n']){const b=$('reviewPromote'+type);if(b)b.onclick=()=>{const m=explorePromo.find(x=>x.promotion===type);if(m)applyExploreMove(m,'tap');};}
if($('reviewPromotionCancel'))$('reviewPromotionCancel').onclick=()=>{explorePromo=[];renderBoard();};

function elem(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function badgePill(kind,symbol){return elem('span',symbol,'gr-badge-pill badge-'+kind);}
function explainMove(r){
 if(r.kind==='brilliant')return 'Эффектная жертва, которая сохраняет или усиливает инициативу!';
 if(r.kind==='great')return 'Ключевой единственный сильный ход в острой позиции!';
 if(r.kind==='book')return detectedOpening?`Теория дебюта: ${detectedOpening.eco} · ${detectedOpening.name}.`:'Классический дебютный ход по теории.';
 if(r.kind==='best')return 'Точный лучший выбор Stockfish.';
 if(r.kind==='excellent')return `Почти идеально · лучший ход был ${r.bestSan}.`;
 if(r.kind==='good')return `Крепкий ход · немного точнее было ${r.bestSan}.`;
 if(r.kind==='inaccuracy')return `Небольшая неточность · лучше ${r.bestSan} (${displayScore(r.bestScore)} вместо ${displayScore(r.playedScore)}).`;
 if(r.kind==='miss')return `Упущенный тактический шанс! Ход ${r.bestSan} давал ${displayScore(r.bestScore)}.`;
 if(r.kind==='mistake')return `Ошибка · лучше было ${r.bestSan} (${displayScore(r.bestScore)} вместо ${displayScore(r.playedScore)}).`;
 return `Грубая ошибка · лучше было ${r.bestSan} (${displayScore(r.bestScore)} вместо ${displayScore(r.playedScore)}).`;
}
function renderCoach(){
 const el=$('coach');el.replaceChildren();
 if(retryTarget){
  if(retryTarget.solved){
   const head=elem('div',undefined,'coach-head');
   head.append(badgePill('best','★'),elem('b','Отлично! Лучший ход найден: '+retryTarget.bestSan));
   el.append(head,elem('div','Ты исправил ошибку прямо на доске. Нажми «Вперёд» или «Момент», чтобы продолжить разбор.','coach-sub'));
   return;
  }
  const head=elem('div',undefined,'coach-head');
  head.append(badgePill('mistake','?'),elem('b','Попробуй исправить ошибку'));
  const msg=retryTarget.tried?`Ход ${retryTarget.tried} не лучший. Нажми «Отменить» и попробуй ещё раз (или нажми «Подсказка»).`:'Сделай более сильный ход прямо на доске (или нажми «Подсказка»).';
  el.append(head,elem('div',msg,'coach-sub'));
  return;
 }
 if(explore){
  const head=elem('div',undefined,'coach-head');
  head.append(badgePill('great','★'),elem('b','Пробный вариант ('+(explore.frames.length-1)+' ход.)'));
  el.append(head,elem('div','Двигай фигуры для проверки идей, нажми «Подсказка» для оценки Stockfish или «Отменить» для возврата.','coach-sub'));
  return;
 }
 const r=results[cursor-1];
 if(!cursor){
  el.append(elem('div',detectedOpening?`📖 ${detectedOpening.eco} · ${detectedOpening.name} — нажми «Вперёд» или «Анализ».`:'Начальная позиция. Листай ходы или запусти анализ Stockfish.','coach-sub'));
  return;
 }
 if(!r){
  el.append(elem('div',label(cursor-1)+' · запусти анализ, чтобы увидеть классификацию (!! / ★ / ??) и оценку.','coach-sub'));
  return;
 }
 const head=elem('div',undefined,'coach-head');
 head.append(badgePill(r.kind,r.symbol),elem('b',label(cursor-1)+' · '+r.label));
 el.append(head,elem('div',explainMove(r),'coach-sub'));
 if(r.pv?.length)el.append(elem('div','Линия: '+r.pv.join(' '),'coach-pv'));
 if(['mistake','miss','blunder'].includes(r.kind)){
  const actions=elem('div',undefined,'coach-actions');
  const retryBtn=elem('button','Попробовать исправить','primary');
  retryBtn.type='button';
  retryBtn.onclick=()=>{
   const targetPly=r.index;
   go(targetPly);
   retryTarget={ply:targetPly,best:r.best,bestSan:r.bestSan,solved:false,tried:null};
   renderBoard();renderCoach();
  };
  actions.append(retryBtn);
  el.append(actions);
 }
}
let renderedMoves=null,moveRows=[];
function updateActiveMove(){
 const list=$('moves'),active=list.querySelector('.move.active'),next=cursor?moveRows[cursor-1]?.button:null;
 if(active&&active!==next){active.classList.remove('active');active.removeAttribute('aria-current');}
 if(next&&active!==next){next.classList.add('active');next.setAttribute('aria-current','step');}
}
function renderMoveList(){
 const list=$('moves');
 if(renderedMoves!==moves){
  renderedMoves=moves;moveRows=[];const frag=document.createDocumentFragment();
  moves.forEach((m,i)=>{
   const button=elem('button',undefined,'move'),kindCell=elem('span',undefined,'move-class-cell'),score=elem('span','—');
   kindCell.append(elem('span','—','neutral'));
   button.append(elem('span',label(i)),kindCell,score);button.onclick=()=>{go(i+1);openReviewBoard(true);};
   moveRows.push({button,kindCell,score,result:undefined});frag.append(button);
  });list.replaceChildren(frag);
 }
 for(const [i,row] of moveRows.entries()){
  const r=results[i];if(row.result===r)continue;row.result=r;
  row.kindCell.replaceChildren();
  if(r){
   row.kindCell.append(badgePill(r.kind,r.symbol),elem('span',r.label,r.kind));
   row.score.textContent=displayScore(r.playedScore);
  }else{
   row.kindCell.append(elem('span','—','neutral'));
   row.score.textContent='—';
  }
 }
 updateActiveMove();
}
function renderReport(){
 const sum=$('summary');sum.replaceChildren();
 if(detectedOpening){
  sum.append(elem('div',`📖 ${detectedOpening.eco} · ${detectedOpening.name}`,'gr-opening-pill'));
 }
 const scores=elem('div',undefined,'scores');
 const resTag=game?.getHeaders().Result;
 for(const c of ['w','b']){
  const rs=results.filter(r=>r.color===c),box=elem('div',undefined,'score');
  const avg=rs.length?rs.reduce((a,r)=>a+r.accuracy,0)/rs.length:null;
  const outcome=resTag==='1-0'?(c==='w'?1:-1):resTag==='0-1'?(c==='b'?1:-1):0;
  const elo=avg!==null?estimateGameRating(avg,outcome):null;
  box.append(elem('span',player(c)),elem('strong',avg!==null?avg.toFixed(1)+'%':'—'),elem('span','Точность · '+rs.length+' ходов'));
  if(elo!==null)box.append(elem('span','Оценка игры ~'+elo,'gr-elo'));
  scores.append(box);
 }
 sum.append(scores);
 if(results.length){
  const table=elem('div',undefined,'gr-table');
  for(const cls of MOVE_CLASSES){
   const wList=results.filter(r=>r.color==='w'&&r.kind===cls.kind);
   const bList=results.filter(r=>r.color==='b'&&r.kind===cls.kind);
   const alwaysShow=['brilliant','great','best','inaccuracy','mistake','miss','blunder'].includes(cls.kind);
   if(!alwaysShow&&!wList.length&&!bList.length)continue;
   const row=elem('button',undefined,'gr-row');
   row.type='button';
   row.disabled=!wList.length&&!bList.length;
   const mid=elem('span',undefined,'gr-row-mid');
   mid.append(badgePill(cls.kind,cls.symbol),elem('span',cls.label));
   row.append(
    elem('span',String(wList.length),'gr-count'+(wList.length?' '+cls.kind:' zero')),
    mid,
    elem('span',String(bList.length),'gr-count'+(bList.length?' '+cls.kind:' zero'))
   );
   row.onclick=()=>{
    const pool=results.filter(r=>matchesSideFilter(r)&&r.kind===cls.kind);
    const list=pool.length?pool:[...wList,...bList].sort((a,b)=>a.index-b.index);
    if(!list.length)return;
    const target=list.find(r=>r.index+1>cursor)||list[0];
    go(target.index+1);openReviewBoard(true);
   };
   table.append(row);
  }
  sum.append(table);
 }
 renderMoveList();chart();
 $('askReview').hidden=!globalThis.JohanNative;$('askReview').disabled=!results.length;
 const t=$('training');t.replaceChildren();
 const errors=results.filter(r=>matchesSideFilter(r)&&r.loss>=5).sort((a,b)=>b.loss-a.loss).slice(0,5);
 if(!errors.length)t.textContent=results.length?'Существенных ошибок в выбранной стороне не найдено!':'После анализа здесь появятся самые важные ошибки.';
 else for(const r of errors){
  const d=elem('div',undefined,'training-row');
  const titleRow=elem('div',undefined,'coach-head');
  titleRow.append(badgePill(r.kind,r.symbol),elem('b',label(r.index)+' · '+r.label),elem('span','−'+r.loss.toFixed(1)+' п.п.','muted'));
  d.append(titleRow);
  const b=elem('button','Исправить на доске','primary');
  b.onclick=()=>{go(r.index);retryTarget={ply:r.index,best:r.best,bestSan:r.bestSan,solved:false,tried:null};renderBoard();renderCoach();openReviewBoard(true);};
  d.append(b);
  const replay=elem('button','Переиграть со Stockfish');
  replay.onclick=()=>{if(!busy&&!importing&&!training?.active())training.startReplay(positions[r.index],r.color);};
  replay.disabled=busy;d.append(replay);t.append(d);
 }
}
const CHART_MARKER_COLORS={brilliant:'#1bada6',great:'#3b82f6',inaccuracy:'#eab308',mistake:'#f97316',miss:'#fb7185',blunder:'#ef4444'};
function chart(){
 const canvas=$('chart'),ctx=canvas.getContext('2d');
 const rect=canvas.getBoundingClientRect(),dpr=Math.min(globalThis.devicePixelRatio||1,2);
 const w=Math.max(240,Math.round(rect.width||680)),h=Math.max(100,Math.round(rect.height||128));
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const mid=h/2,padX=8,padY=10;
 ctx.strokeStyle='rgba(148,163,184,.28)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,mid);ctx.lineTo(w,mid);ctx.stroke();
 if(!results.length)return;
 const y=s=>mid-Math.max(-1,Math.min(1,s/600))*(mid-padY);
 const x=i=>padX+(i/Math.max(1,moves.length))*(w-padX*2);
 const vals=[scoreValue(results[0].bestScore)*(results[0].color==='w'?1:-1),...results.map(r=>scoreValue(r.playedScore)*(r.color==='w'?1:-1))];
 ctx.save();
 ctx.beginPath();ctx.moveTo(x(0),mid);vals.forEach((v,i)=>ctx.lineTo(x(i),y(v)));ctx.lineTo(x(vals.length-1),mid);ctx.closePath();
 const grad=ctx.createLinearGradient(0,0,0,h);
 grad.addColorStop(0,'rgba(248,250,252,.22)');grad.addColorStop(.5,'rgba(248,250,252,.04)');
 grad.addColorStop(.5,'rgba(15,23,42,.42)');grad.addColorStop(1,'rgba(2,6,23,.65)');
 ctx.fillStyle=grad;ctx.fill();ctx.restore();
 ctx.strokeStyle='#22c55e';ctx.lineWidth=2.25;ctx.lineJoin='round';ctx.beginPath();
 vals.forEach((v,i)=>i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v)));ctx.stroke();
 for(const r of results){
  const col=CHART_MARKER_COLORS[r.kind];
  if(!col)continue;
  const px=x(r.index+1),py=y(vals[r.index+1]);
  ctx.fillStyle=col;
  ctx.beginPath();ctx.arc(px,py,['brilliant','blunder'].includes(r.kind)?4.5:3.3,0,Math.PI*2);ctx.fill();
 }
 const cx=x(Math.min(cursor,vals.length-1)),cy=y(vals[Math.min(cursor,vals.length-1)]);
 ctx.strokeStyle='rgba(248,250,252,.75)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(cx,0);ctx.lineTo(cx,h);ctx.stroke();
 ctx.fillStyle='#f8fafc';ctx.beginPath();ctx.arc(cx,cy,4,0,Math.PI*2);ctx.fill();
}
if(typeof ResizeObserver==='function')new ResizeObserver(()=>{if(game)chart();}).observe($('chart'));
$('chart').onclick=e=>{const r=$('chart').getBoundingClientRect();go(Math.round((e.clientX-r.left)/r.width*moves.length));openReviewBoard(true);};
$('export').onclick=()=>{downloadOrSave('johan-chess-review.json','application/json',JSON.stringify({version:'0.3.0',opening:detectedOpening,pgn,user:$('user').value,depth:analysisDepth??Number($('depth').value),complete:results.length===moves.length,results},null,2));};
document.addEventListener('keydown',e=>{
 if(e.metaKey||e.ctrlKey||e.altKey||hasOpenDialog())return;
 const tag=e.target?.tagName;if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||e.target?.isContentEditable)return;
 const reviewVisible=!document.querySelector('[data-screen="review"]').hidden;
 if(reviewVisible&&game){
  if(e.key==='ArrowLeft'){e.preventDefault();explore?undoReviewExplore():go(cursor-1);}
  else if(e.key==='ArrowRight'){e.preventDefault();explore?(clearExplore(),renderBoard(),renderCoach()):go(cursor+1);}
  else if(e.key==='Home'){e.preventDefault();go(0);}
  else if(e.key==='End'){e.preventDefault();go(moves.length);}
  else if(e.key==='f'||e.key==='F'){e.preventDefault();flipped=!flipped;renderBoard();}
  return;
 }
 const puzzleReviewVisible=!document.querySelector('[data-screen="puzzles"]').hidden&&!$('puzzleReview').hidden;
 if(puzzleReviewVisible){
  if(e.key==='ArrowLeft'){e.preventDefault();$('reviewPuzzlePrev').click();}
  else if(e.key==='ArrowRight'){e.preventDefault();$('reviewPuzzleNext').click();}
  return;
 }
 const libraryVisible=!document.querySelector('[data-screen="library"]').hidden&&!$('studyOpeningArea').hidden;
 if(libraryVisible){
  if(e.key==='ArrowLeft'){e.preventDefault();$('studyPrevious').click();}
  else if(e.key==='ArrowRight'){e.preventDefault();$('studyNext').click();}
  else if(e.key==='f'||e.key==='F'){e.preventDefault();$('studyFlip').click();}
 }
});

function coachContext(){
 const user=$('user').value.trim();
 if(!game||onlineLocked||training?.active())return {user,game:null};
 const h=game.getHeaders();
 const playerName=(onlineReviewName||user).toLowerCase();
 const color=historical?null:h.White?.toLowerCase()===playerName?'w':h.Black?.toLowerCase()===playerName?'b':null;
 return {user,game:{source:historical?'historical':onlineReviewName?'lichess':h.Site==='Johan Chess'?'training':'import',historical:historical?{id:historical.id,title:historical.title,year:historical.year,source:historical.source}:null,termination:h.Termination||'',timeControl:h.TimeControl||'',white:player('w'),black:player('b'),date:h.Date||'',result:h.Result||'*',color,startFen,position:positions[cursor],cursor,moves:moves.map(m=>m.san),depth:analysisDepth??Number($('depth').value),complete:results.length===moves.length,analysis:results}};
}
$('coachUnavailable').hidden=!!globalThis.JohanNative;
if($('libraryCoachNote'))$('libraryCoachNote').hidden=!!globalThis.JohanNative;
if($('libraryBack'))$('libraryBack').hidden=!globalThis.JohanNative;
let accountStatus=null;
try{const nick=localStorage.getItem('jc-profile-nick');if(/^[a-zA-Z0-9_-]{1,40}$/.test(nick||''))$('user').value=nick;}catch{}
const dashboard=initProfileDashboard({Chess,getUser:()=>$('user').value.trim(),setUser:nick=>{if(busy||importing||training?.active())return false;$('user').value=nick;imported=[];$('games').hidden=true;$('review').hidden=true;game=null;pgn='';historical=null;results=[];clearExplore();openReviewBoard(false);$('analyze').disabled=true;try{localStorage.setItem('jc-profile-nick',nick);}catch{}refreshProfile();document.dispatchEvent(new CustomEvent('jc-profile-user',{detail:nick}));return true;},openGame:text=>{if(busy||importing||training?.active())return false;navigation.show('review');if(!load(text))return false;$('games').hidden=true;openReviewBoard(true);return true;},canSync:()=>!busy&&!importing&&!training?.active()});
function readLocal(key){try{const rows=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(rows)?rows:[];}catch{return [];}}
function refreshProfile(){
 const user=$('user').value.trim(),nick=user.toLowerCase();
 const local=readLocal('jc-training-history-v1'),reviews=readLocal('jc-coach-games:'+nick);
 const s=profileStats(local,reviews,user,Chess);
 const tactics=getPuzzleTraining(user);
 $('profilePuzzleTarget').textContent=String(tactics.target);$('profilePuzzleAttempts').textContent=String(tactics.attempts);$('profilePuzzleSkipped').textContent=String(tactics.skipped);$('profilePuzzleAccuracy').textContent=tactics.accuracy===null?'—':tactics.accuracy+'%';
 const topicList=$('profilePuzzleTopics');topicList.replaceChildren();
 for(const [tag,label] of Object.entries(TOPICS)){const stat=tactics.topics[tag],row=elem('div',undefined,'topic-row');row.append(elem('span',label),elem('strong',stat.attempts?stat.clean+'/'+stat.attempts+(stat.attempts<5?' · мало данных':''):'—'));topicList.append(row);}
 const puzzles=getPuzzleProgress(user);$('profilePuzzleSolved').textContent=String(puzzles.solved.length);$('profilePuzzleStreak').textContent=String(puzzles.bestStreak);
 $('homePlayed').textContent=String(s.played);$('homeReviewed').textContent=String(s.reviewed);
 const name=displayName(accountStatus,user);
 $('profileName').textContent=name;$('profileAvatar').textContent=Array.from(name.trim())[0]?.toUpperCase()||'♟';
 $('profileNick').textContent=user?'Chess.com · '+user:'';
 $('profileConnection').textContent=accountStatus?.connected?(accountStatus.sharing?'ChatGPT подключён':'ChatGPT · требуется разрешение плана'):'ChatGPT не подключён';
 $('profileChatLink').textContent=accountStatus?.connected?(accountStatus.sharing?'Подключён':'Нужно разрешение'):'Подключить';
 $('profileConnect').hidden=!globalThis.JohanNative;
 if(!globalThis.JohanNative)$('profileConnection').textContent='ChatGPT доступен в Android';
 $('profilePlayed').textContent=String(s.played);$('profileReviewed').textContent=String(s.reviewed);
 $('profileAccuracy').textContent=s.accuracy===null?'—':s.accuracy.toFixed(1)+'%';
 for(const [id,n] of [['Wins',s.wins],['Draws',s.draws],['Losses',s.losses]])$('profile'+id).textContent=String(n);
 for(const [id,n] of [['Win',s.wins],['Draw',s.draws],['Loss',s.losses]])$('profile'+id+'Bar').style.width=(s.played?100*n/s.played:0)+'%';
 dashboard.update({local,reviews,stats:s,puzzles});
}
document.addEventListener('jc-screen',e=>{if(['home','profile'].includes(e.detail))refreshProfile();});
document.addEventListener('jc-puzzle-progress',refreshProfile);
document.addEventListener('jc-account',e=>{accountStatus=e.detail;refreshProfile();});
$('profileConnect').onclick=()=>{if(onlineLocked)return;navigation.show('account');if(!accountStatus?.connected&&!coachBusy())$('aiLogin').click();};
refreshProfile();
const puzzleUI=initPuzzles(()=>$('user').value.trim());
initCoach(coachContext,{Engine,enginePath,onlineLocked:()=>onlineLocked,canAnalyze:()=>!onlineLocked&&!busy&&!importing&&!training?.active()});
training=initTraining({
 canStart:()=>!onlineLocked&&!busy&&!importing,
 getUser:()=>$('user').value.trim(),
 lock:()=>{navigation.setPlaying(true);$('importPanel').hidden=true;$('review').hidden=true;$('aiPanel').hidden=true;},
 unlock:()=>{navigation.setPlaying(false);$('importPanel').hidden=false;$('review').hidden=!game;$('aiPanel').hidden=!globalThis.JohanNative;},
 review:(text,auto,user)=>{navigation.show('review');if(user)$('user').value=user;if(pgn!==text||!game){if(!load(text))return;}openReviewBoard(true);if(auto&&results.length!==moves.length)$('analyze').click();},
 goHome:()=>navigation.show('home'),
 goOnline:({friend}={})=>{navigation.show('online');if(friend&&$('onlineFriendNick')&&!$('onlineSocial').hidden){$('onlineFriendNick').scrollIntoView({behavior:scrollBehavior(),block:'center'});$('onlineFriendNick').focus();}}
});
onlineUI=initOnline({
 canStart:()=>!onlineLocked&&!busy&&!importing&&!training?.active()&&!coachBusy(),
 lock:value=>{onlineLocked=value;setEngineOnlineLock(value);if(value){if(busy)$('stop').click();training?.interrupt();}navigation.setOnline(value);},
 review:(text,nick)=>{if(onlineLocked||busy||importing||training?.active())return;navigation.show('review');if(load(text)){onlineReviewName=nick;flipped=own()==='b';render();$('games').hidden=true;$('analyze').click();}},
 openOnline:()=>navigation.show('online')
});
initGameShare({Chess,canUse:()=>!onlineLocked&&!busy&&!importing&&!training?.active()&&!coachBusy(),user:()=>$('user').value,open:text=>{navigation.show('review');return loadText(text);},exportPgn:()=>game?currentPgn():null,notice:t=>{navigation.show('review');status(t);}});
initStudyLibrary({
 openGame:(pgn,row)=>{if(busy||importing||training?.active()){$('studyLibraryStatus').textContent='Дождись завершения текущей игры или анализа.';return;}navigation.show('review');if(load(pgn,row))openReviewBoard(true);},
 practiceEndgame:theme=>{puzzleUI.selectTheme(theme);navigation.show('puzzles');},
 askOpening:row=>{navigation.show('coach');if(!globalThis.JohanNative)return;$('aiQuestion').value='Объясни идеи и типичные планы дебютной линии Lichess '+row.eco+' '+row.name+': '+row.pgn+'. Не придумывай дополнительные проверенные варианты.';$('aiQuestion').focus();},
 playOpening:(fen,color)=>{if(!busy&&!importing&&!training?.active())training.startReplay(fen,color);else $('studyLibraryStatus').textContent='Дождись окончания текущей работы.';}
});
$('askReview').onclick=()=>{
 if(onlineLocked||!game||training.active()||!results.length||!globalThis.JohanNative)return;
 navigation.show('coach');
 $('aiQuestion').value=historical?'Разбери историческую партию '+historical.title+'. Объясни ключевые идеи, сильные ходы и критические ошибки обеих сторон по анализу Stockfish. Покажи мини-доски и выводы для моей игры.':'Разбери мою партию по данным Stockfish. Выдели главные ошибки, объясни их причины и предложи конкретную тренировку. Задай мне вопрос о том, что я рассчитывал в критической позиции.';
 $('aiPanel').scrollIntoView({behavior:scrollBehavior()});$('aiQuestion').focus();
};
if(!globalThis.JohanNative)setTimeout(()=>{if(!onlineLocked)warmEngineCache(enginePath);},1500);

