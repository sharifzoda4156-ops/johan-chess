import {initStudyLibrary} from './study-library.js';
import {TOPICS} from './puzzle-training.js';
import {initPuzzles,getPuzzleProgress,getPuzzleTraining} from './puzzles.js';
import {displayName,profileStats} from './profile-core.js';
import {initProfileDashboard} from './profile-dashboard.js';
import {initThemes} from './piece-art.js';
import {renderBoardView,scrollBehavior,initBoardMotion} from './board-view.js';
import {initNavigation} from './navigation.js';
import {initTraining} from './training.js';
import {initOnline} from './online.js';
import {initGameShare} from './game-share.js';
import {initCoach,rememberGame,coachBusy} from './android-coach.js';
import {Chess} from './chess.js';
import {normalizePgn,splitPgn,buildPgn} from './pgn.js';
import {Engine,setEngineOnlineLock} from './engine.js';
import {enginePath} from './engine-path.js';
import {evaluateMove,displayScore,scoreValue} from './metrics.js';
const $=id=>document.getElementById(id), status=t=>$('status').textContent=t;
let training=null,importing=false,analysisDepth=null,game=null, moves=[], positions=[], results=[], cursor=0, flipped=false, engine=null, busy=false, runId=0, imported=[], startFen='', pgn='', historical=null,onlineLocked=false,onlineReviewName='';
initThemes();initBoardMotion();
const navigation=initNavigation();
const player=c=>game?.getHeaders()[c==='w'?'White':'Black']|| (c==='w'?'Белые':'Чёрные');
const own=()=>player('b').toLowerCase()===(onlineReviewName||$('user').value.trim()).toLowerCase()?'b':'w';
const uci=m=>m.from+m.to+(m.promotion||'');
function load(text,study=null){
 if(busy||onlineLocked||training?.active())return false;
 try{const c=new Chess();c.loadPgn(normalizePgn(text));const h=c.history({verbose:true});if(!h.length)throw Error('В PGN нет ходов. Экспортируй полную партию.');
 historical=study;onlineReviewName='';game=c;moves=h;startFen=h[0].before;positions=[startFen,...h.map(m=>m.after)];pgn=text;results=[];analysisDepth=null;cursor=0;flipped=historical?historical.result==='0-1':own()==='b';$('review').hidden=false;$('analyze').disabled=false;$('export').disabled=true;$('progress').hidden=true;render();status((historical?historical.title+' · '+historical.year:'Партия загружена')+': '+h.length+' полуходов.');return true;
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
$('load').onclick=()=>{loadText($('pgn').value);};
$('pgnFile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f||importing)return;if(f.size>5*1024*1024){status('Файл больше 5 МБ.');return;}try{loadText(await f.text());}catch(err){status('Не удалось прочитать файл: '+err.message);}};
function currentPgn(){return buildPgn({headers:game.getHeaders(),moves,results,depth:analysisDepth??Number($('depth').value)});}
function syncPgnButtons(){$('exportPgn').disabled=!results.length;$('copyPgn').disabled=!game;for(const id of ['sharePgnFile','sharePgnText'])$(id).disabled=!game||onlineLocked||!['1-0','0-1','1/2-1/2'].includes(game.getHeaders().Result);}
$('exportPgn').onclick=()=>{if(!game||!results.length)return;const url=URL.createObjectURL(new Blob([currentPgn()],{type:'application/x-chess-pgn'}));const a=document.createElement('a');a.href=url;a.download='johan-chess-analysis.pgn';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('copyPgn').onclick=async()=>{if(!game)return;const text=currentPgn();try{await navigator.clipboard.writeText(text);status('PGN скопирован.');}catch{$('pgn').value=text;$('manual').open=true;status('Буфер обмена недоступен: PGN помещён в поле ввода.');}};
$('fetch').onclick=async()=>{if(busy||importing||training?.active())return;importing=true;const b=$('fetch');for(const id of ['fetch','load','games','user'])$(id).disabled=true;status('Загружаю завершённые партии…');try{const r=await fetch('/api/games?user='+encodeURIComponent($('user').value.trim()));const data=await r.json();if(!r.ok)throw Error(data.error);imported=data.games||[];if(!imported.length)throw Error('Партии не найдены');const select=$('games');select.replaceChildren();imported.forEach((g,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${g.white} — ${g.black} · ${g.timeClass||''} · ${new Date(g.ended*1000).toLocaleDateString('ru')}`;select.append(o);});select.hidden=false;load(imported[0].pgn);}catch(e){status(e.message);$('manual').open=true;}finally{importing=false;for(const id of ['fetch','load','games','user'])$(id).disabled=busy||!!training?.active();}};
$('games').onchange=()=>{if(importing)return;const g=imported[Number($('games').value)];if(g)load(g.pgn);};
function setBusy(v){busy=v;for(const id of ['fetch','load','games','user','depth'])$(id).disabled=v;$('analyze').disabled=v||!game;$('stop').hidden=!v;}
$('analyze').onclick=async()=>{
 if(busy||onlineLocked||!game||training?.active()||importing)return;const id=++runId,depth=Number($('depth').value);analysisDepth=depth;setBusy(true);results=[];render();$('export').disabled=true;const progress=$('progress');progress.hidden=false;progress.max=moves.length;progress.value=0;let local;
 try{status('Запускаю Stockfish…');local=new Engine(enginePath);engine=local;await local.init();const prefix=[];
 for(let i=0;i<moves.length;i++){if(id!==runId)return;const m=moves[i],actualMove=uci(m);status(`Анализ ${i+1} / ${moves.length} · ${m.san}`);const best=await local.search(startFen,prefix,depth);const isBest=best.best===actualMove;const played=isBest?best:await local.search(startFen,prefix,depth,actualMove);if(id!==runId)return;
 const metrics=evaluateMove(best.score,played.score,isBest);const c=new Chess(m.before);let bestSan=best.best;try{bestSan=c.move({from:best.best.slice(0,2),to:best.best.slice(2,4),...(best.best.length>4?{promotion:best.best[4]}:{})}).san;}catch{};
 const continuation=new Chess(m.before),pv=[];for(const u of best.pv.slice(0,6)){try{pv.push(continuation.move({from:u.slice(0,2),to:u.slice(2,4),...(u.length>4?{promotion:u[4]}:{})}).san);}catch{break;}}
 results.push({index:i,color:m.color,san:m.san,move:actualMove,best:best.best,bestSan,pv,bestScore:best.score,playedScore:played.score,...metrics});prefix.push(actualMove);progress.value=i+1;renderReport();renderCoach();}
 const completedContext=coachContext();if(!historical){rememberGame(completedContext);refreshProfile();}status('Анализ завершён. Выбери ошибку для разбора.');$('export').disabled=false;
 }catch(e){if(id===runId)status('Анализ прерван: '+e.message);}finally{if(id===runId){local?.close();engine=null;setBusy(false);render();$('export').disabled=!results.length;}}
};
$('stop').onclick=()=>{runId++;engine?.close();engine=null;setBusy(false);status('Анализ остановлен. Частичный отчёт сохранён на экране.');$('export').disabled=!results.length;render();};
function render(){if(!game)return;syncPgnButtons();renderBoard();renderCoach();renderReport();}
function renderBoard(animateMoves=[]){const c=new Chess(positions[cursor]);renderBoardView($('board'),{rows:c.board(),flip:flipped,last:moves[cursor-1],animateMoves});
 $('top').textContent=player(flipped?'w':'b');$('bottom').textContent=player(flipped?'b':'w');$('moveNumber').textContent=cursor?label(cursor-1):'Старт';$('first').disabled=$('back').disabled=cursor===0;$('next').disabled=$('last').disabled=cursor===moves.length;
}
function label(i){const m=moves[i];return m.before.split(' ')[5]+(m.color==='w'?'. ':'... ')+m.san;}
function go(n){const previous=cursor;cursor=Math.max(0,Math.min(n,moves.length));if(cursor===previous)return;renderBoard(cursor===previous+1?[moves[previous]]:[]);renderCoach();updateActiveMove();chart();}
$('first').onclick=()=>go(0);$('back').onclick=()=>go(cursor-1);$('next').onclick=()=>go(cursor+1);$('last').onclick=()=>go(moves.length);$('flip').onclick=()=>{flipped=!flipped;renderBoard();};
function elem(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function renderCoach(){const el=$('coach');el.replaceChildren();const r=results[cursor-1];if(!cursor){el.textContent='Начальная позиция. Выбери ход или запусти анализ.';return;}if(!r){el.textContent=label(cursor-1)+' · оценка пока отсутствует';return;}
 el.append(elem('b',label(cursor-1)+' · '+r.label),elem('div',`Лучше: ${r.bestSan} · оценка ${displayScore(r.bestScore)} вместо ${displayScore(r.playedScore)} (со стороны ходившего).`),elem('div','Вариант: '+r.pv.join(' ')));
 if(r.loss>=5)el.append(elem('div','Задание: вернись на один ход назад и найди сильный ответ на сыгранный ход.'));
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
   const button=elem('button',undefined,'move'),kind=elem('span','—','neutral'),score=elem('span','—');
   button.append(elem('span',label(i)),kind,score);button.onclick=()=>go(i+1);
   moveRows.push({button,kind,score,result:undefined});frag.append(button);
  });list.replaceChildren(frag);
 }
 for(const [i,row] of moveRows.entries()){
  const r=results[i];if(row.result===r)continue;row.result=r;
  row.kind.textContent=r?.label||'—';row.kind.className=r?.loss>=20?'blunder':r?.loss>=5?'bad':r?.label==='Лучший'?'best':'neutral';row.score.textContent=r?displayScore(r.playedScore):'—';
 }
 updateActiveMove();
}
function renderReport(){const sum=$('summary');sum.replaceChildren();const scores=elem('div',undefined,'scores');for(const c of ['w','b']){const rs=results.filter(r=>r.color===c),box=elem('div',undefined,'score');box.append(elem('span',player(c)),elem('strong',rs.length?(rs.reduce((a,r)=>a+r.accuracy,0)/rs.length).toFixed(1)+'%':'—'),elem('span','Точность JC · '+rs.length+' ходов'));scores.append(box);}sum.append(scores);if(results.length){const stats=elem('div',undefined,'muted');stats.textContent=['Лучший','Отличный','Хороший','Неточность','Ошибка','Грубая ошибка'].map(l=>l+': '+results.filter(r=>(historical||r.color===own())&&r.label===l).length).join(' · ');sum.append(stats);}
 renderMoveList();chart();
 $('askReview').hidden=!globalThis.JohanNative;$('askReview').disabled=!results.length;const t=$('training');t.replaceChildren();const errors=results.filter(r=>(historical||r.color===own())&&r.loss>=5).sort((a,b)=>b.loss-a.loss).slice(0,5);if(!errors.length)t.textContent=results.length?'Пока существенных ошибок по нашей шкале нет.':'После анализа здесь появятся самые важные ошибки.';else for(const r of errors){const d=elem('div',undefined,'training-row');d.append(elem('div',label(r.index)+' · '+r.label+' · потеря '+r.loss.toFixed(1)+' п.п. шанса на победу (модель)'));const b=elem('button','Открыть позицию до ошибки');b.onclick=()=>{go(r.index);$('board').scrollIntoView({behavior:scrollBehavior(),block:'center'});};d.append(b);const replay=elem('button','Переиграть со Stockfish');replay.onclick=()=>{if(!busy&&!importing&&!training?.active())training.startReplay(positions[r.index],r.color);};replay.disabled=busy;d.append(replay);t.append(d);}
}
function chart(){const canvas=$('chart'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.strokeStyle='#75869b';ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();if(!results.length)return;const y=s=>h/2-Math.max(-1,Math.min(1,s/600))*(h/2-8);const x=i=>i/Math.max(1,moves.length)*(w-12)+6;const vals=[scoreValue(results[0].bestScore)*(results[0].color==='w'?1:-1),...results.map(r=>scoreValue(r.playedScore)*(r.color==='w'?1:-1))];ctx.strokeStyle='#d8b77d';ctx.lineWidth=3;ctx.beginPath();vals.forEach((v,i)=>i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v)));ctx.stroke();ctx.strokeStyle='#e6e7e7';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x(cursor),0);ctx.lineTo(x(cursor),h);ctx.stroke();}
$('chart').onclick=e=>{const r=$('chart').getBoundingClientRect();go(Math.round((e.clientX-r.left)/r.width*moves.length));};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({version:'0.1.0',pgn,user:$('user').value,depth:analysisDepth??Number($('depth').value),complete:results.length===moves.length,results},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='johan-chess-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

function coachContext(){
 const user=$('user').value.trim();
 if(!game||onlineLocked||training?.active())return {user,game:null};
 const h=game.getHeaders();
 const playerName=(onlineReviewName||user).toLowerCase();
 const color=historical?null:h.White?.toLowerCase()===playerName?'w':h.Black?.toLowerCase()===playerName?'b':null;
 return {user,game:{source:historical?'historical':onlineReviewName?'lichess':h.Site==='Johan Chess'?'training':'import',historical:historical?{id:historical.id,title:historical.title,year:historical.year,source:historical.source}:null,termination:h.Termination||'',timeControl:h.TimeControl||'',white:player('w'),black:player('b'),date:h.Date||'',result:h.Result||'*',color,startFen,position:positions[cursor],cursor,moves:moves.map(m=>m.san),depth:analysisDepth??Number($('depth').value),complete:results.length===moves.length,analysis:results}};
}
$('coachUnavailable').hidden=!!globalThis.JohanNative;
let accountStatus=null;
try{const nick=localStorage.getItem('jc-profile-nick');if(/^[a-zA-Z0-9_-]{1,40}$/.test(nick||''))$('user').value=nick;}catch{}
const dashboard=initProfileDashboard({Chess,getUser:()=>$('user').value.trim(),setUser:nick=>{if(busy||importing||training?.active())return false;$('user').value=nick;imported=[];$('games').hidden=true;$('review').hidden=true;game=null;pgn='';historical=null;results=[];$('analyze').disabled=true;try{localStorage.setItem('jc-profile-nick',nick);}catch{}refreshProfile();document.dispatchEvent(new CustomEvent('jc-profile-user',{detail:nick}));return true;},openGame:text=>{if(busy||importing||training?.active())return false;navigation.show('review');if(!load(text))return false;$('games').hidden=true;$('review').scrollIntoView({behavior:scrollBehavior()});return true;},canSync:()=>!busy&&!importing&&!training?.active()});
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
 review:(text,auto,user)=>{navigation.show('review');if(user)$('user').value=user;if(pgn!==text||!game){if(!load(text))return;}$('review').scrollIntoView({behavior:scrollBehavior()});if(auto&&results.length!==moves.length)$('analyze').click();}
});
initOnline({
 canStart:()=>!onlineLocked&&!busy&&!importing&&!training?.active()&&!coachBusy(),
 lock:value=>{onlineLocked=value;setEngineOnlineLock(value);if(value){if(busy)$('stop').click();training?.interrupt();}navigation.setOnline(value);},
 review:(text,nick)=>{if(onlineLocked||busy||importing||training?.active())return;navigation.show('review');if(load(text)){onlineReviewName=nick;flipped=own()==='b';render();$('games').hidden=true;$('analyze').click();}}
});
initGameShare({Chess,canUse:()=>!onlineLocked&&!busy&&!importing&&!training?.active()&&!coachBusy(),user:()=>$('user').value,open:text=>{navigation.show('review');return loadText(text);},exportPgn:()=>game?currentPgn():null,notice:t=>{navigation.show('review');status(t);}});
initStudyLibrary({
 openGame:(pgn,row)=>{if(busy||importing||training?.active()){$('studyLibraryStatus').textContent='Дождись завершения текущей игры или анализа.';return;}navigation.show('review');if(load(pgn,row))$('review').scrollIntoView({behavior:scrollBehavior()});},
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
