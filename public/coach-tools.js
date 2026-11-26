import {parseOpenings,searchOpenings,historicalPgn} from './study-core.js';
import {evaluateMove} from './metrics.js';
const finished=r=>['1-0','0-1','1/2-1/2'].includes(r);
const uci=m=>m.from+m.to+(m.promotion||'');
const local=(storage,key)=>{try{const a=JSON.parse(storage.getItem(key)||'[]');return Array.isArray(a)?a:[];}catch{return [];}};
const clip=(v,n=160)=>typeof v==='string'?v.slice(0,n):'';
export function readFinishedGame(pgn,Chess){
 if(typeof pgn!=='string'||pgn.length>100000)throw Error('PGN недоступен');
 const c=new Chess();c.loadPgn(pgn);const h=c.getHeaders(),moves=c.history({verbose:true});
 if(!finished(h.Result)||!moves.length||moves.length>800)throw Error('Нужна завершённая партия');
 return {white:clip(h.White),black:clip(h.Black),date:clip(h.Date,30),result:h.Result,startFen:moves[0].before,moves:moves.map(m=>m.san)};
}
export function validatedGame(g,Chess){
 if(!g||!finished(g.result)||!Array.isArray(g.moves)||!g.moves.length||g.moves.length>800)throw Error('Нужна завершённая партия');
 const c=new Chess(g.startFen),moves=[];
 for(const san of g.moves){if(typeof san!=='string'||san.length>16)throw Error('Неверный ход');moves.push(c.move(san));}
 return {startFen:g.startFen,moves};
}
const cache=new Map();
export function createCoachTools({Chess,Engine,enginePath,storage,fetcher=fetch,user,game,allow,canAnalyze=()=>true,stats}){
 const games=new Map();let openings=null,history=null,puzzles=null,calls=0,searches=0,engineTime=0;
 if(allow&&game&&finished(game.result)){try{validatedGame(game,Chess);games.set('current',game);}catch{}}
 const guard=()=>{if(!allow||!canAnalyze())throw Error('Доступ к инструментам не разрешён или идёт игра');};
 const get=ref=>{const g=games.get(ref);if(!g)throw Error('Сначала запроси список партий');return g;};
 const json=async path=>{const r=await fetcher(path);if(!r.ok)throw Error('Источник недоступен');return r.json();};
 const metadata=(id,g)=>({id,white:clip(g.white),black:clip(g.black),date:clip(g.date,30),result:g.result,plies:g.moves.length,source:g.source||'import'});
 async function list(source){
  if(source==='current')return games.has('current')?[metadata('current',get('current'))]:[];
  let rows=[];
  if(source==='local')rows=local(storage,'jc-training-history-v1').filter(r=>String(r.user||'').trim().toLowerCase()===user.toLowerCase()).slice(0,15);
  else if(source==='chesscom'){
   if(!user||!/^[A-Za-z0-9_-]{1,80}$/.test(user))throw Error('Укажи ник Chess.com');
   if(!history)history=(await json('/api/games?user='+encodeURIComponent(user))).games||[];rows=history.slice(0,15);
  }else if(source==='historical'){
   rows=(await json('./historical-games.json')).games.slice(0,20).map(r=>({pgn:historicalPgn(r,Chess)}));
  }else throw Error('Неизвестный источник');
  const out=[];for(const [i,r] of rows.entries()){try{const g={...readFinishedGame(r.pgn,Chess),source},id=source+':'+i;games.set(id,g);out.push(metadata(id,g));}catch{}}
  return out;
 }
 async function analyze(ref,ply,depth,session=null){
  guard();const g=get(ref),{startFen,moves}=session?.validated||validatedGame(g,Chess);
  if(!Number.isInteger(ply)||ply<0||ply>=moves.length||![10,13,16].includes(depth))throw Error('Неверный индекс или глубина');
  const m=moves[ply],prefix=moves.slice(0,ply).map(uci),actual=uci(m);
  const key=JSON.stringify([enginePath,startFen,prefix,actual,depth]);
  if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return {...value,cacheHit:true};}
  const existing=g.analysis?.find(r=>r.index===ply&&r.move===actual);
  if(existing&&g.depth===depth&&existing.bestScore&&existing.playedScore)return {...existing,source:'saved Stockfish report',depth,cacheHit:true};
  if(++searches>48)throw Error('Лимит анализа за запрос: 48 позиций');
  if(engineTime>=90000)throw Error('Лимит времени анализа');
  const e=session?.engine||new Engine(enginePath),started=performance.now();
  let deadline;
  try{
   deadline=setTimeout(()=>e.close(),Math.max(1,Math.min(45000,90000-engineTime,session?session.deadline-performance.now():45000)));
   if(!session?.engine){if(session)session.engine=e;await e.init();}guard();const best=await e.search(startFen,prefix,depth);guard();
   const played=best.best===actual?best:await e.search(startFen,prefix,depth,actual);guard();
   const pos=new Chess(m.before),pv=[];for(const u of best.pv.slice(0,8)){try{pv.push(pos.move({from:u.slice(0,2),to:u.slice(2,4),...(u.length>4?{promotion:u[4]}:{})}).san);}catch{break;}}
   const result={index:ply,san:m.san,color:m.color,move:actual,best:best.best,bestSan:pv[0]||best.best,pv,bestScore:best.score,playedScore:played.score,depth:Math.min(best.depth,played.depth),requestedDepth:depth,...evaluateMove(best.score,played.score,best.best===actual),source:'Stockfish'};
   cache.set(key,result);if(cache.size>128)cache.delete(cache.keys().next().value);return {...result,cacheHit:false};
  }finally{clearTimeout(deadline);engineTime+=performance.now()-started;if(!session)e.close();}
 }
 async function report(ref,from,count,depth){
  guard();const g=get(ref),validated=validatedGame(g,Chess),n=validated.moves.length;
  if(!Number.isInteger(from)||from<0||from>=n||!Number.isInteger(count)||count<1||count>24||![10,13,16].includes(depth))throw Error('Неверный диапазон');
  // An already-complete local report is cheap to retrieve in its entirety.
  const completeSaved=g.complete&&g.depth===depth&&g.analysis?.length===n&&g.analysis.every((r,i)=>r.index===i&&r.move===uci(validated.moves[i]));
  const entries=[];let reason=null,next=from;const session={validated,engine:null,deadline:performance.now()+45000};
  try{
   if(completeSaved){entries.push(...g.analysis);next=n;from=0;}
   else for(let i=from;i<Math.min(n,from+count);i++){
    if(performance.now()>=session.deadline){reason='Лимит времени';break;}
    try{entries.push(await analyze(ref,i,depth,session));next=i+1;}catch(e){reason=clip(e.message,180);break;}
   }
  }finally{session.engine?.close();}
  guard();const summarize=color=>{const a=entries.filter(r=>r.color===color);return {moves:a.length,accuracy:a.length?a.reduce((sum,r)=>sum+r.accuracy,0)/a.length:null,errors:a.filter(r=>r.loss>=5).length};};
  return {game:metadata(ref,g),requestedDepth:depth,from,next:next<n?next:null,covered:entries.length,total:n,complete:from===0&&next===n,reason,white:summarize('w'),black:summarize('b'),critical:entries.filter(r=>r.loss>=5).sort((a,b)=>b.loss-a.loss).slice(0,8),evaluations:entries.slice(0,24).map(r=>({index:r.index,san:r.san,loss:r.loss,bestSan:r.bestSan,bestScore:r.bestScore,playedScore:r.playedScore}))};
 }
 return async function execute(name,args){
  try{
   guard();if(++calls>12)throw Error('Лимит инструментов');
   if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Неверные аргументы');
   let value;
   switch(name){
    case 'game_list':value=await list(args.source);break;
    case 'game_moves':{const g=get(args.game_id);value={...metadata(args.game_id,g),startFen:g.startFen,moves:g.moves};break;}
    case 'stockfish_move':value=await analyze(args.game_id,args.ply,args.depth);break;
    case 'game_report':value=await report(args.game_id,args.from,args.count,args.depth);break;
    case 'puzzle_search':{
     if(typeof args.theme!=='string'||!/^([A-Za-z][A-Za-z0-9]{0,39}|all)$/.test(args.theme)||!Number.isInteger(args.min)||!Number.isInteger(args.max)||args.min<0||args.max>9999||args.min>args.max)throw Error('Неверный фильтр задач');
     if(!puzzles){const p=await json('./lichess-puzzles.json');if(p.license!=='CC0-1.0'||!Array.isArray(p.puzzles))throw Error('База недоступна');puzzles=p.puzzles;}
     value=puzzles.filter(p=>p.rating>=args.min&&p.rating<=args.max&&(args.theme==='all'||p.themes.includes(args.theme))).slice(0,8).map(p=>({id:p.id,rating:p.rating,themes:p.themes,url:'https://lichess.org/training/'+p.id}));break;
    }
    case 'training_stats':value=stats();break;
    case 'opening_search':{
     if(typeof args.query!=='string'||!args.query.trim()||args.query.length>120)throw Error('Уточни запрос');
     if(!openings)openings=(await Promise.all(['a','b','c','d','e'].map(async a=>{const r=await fetcher('./openings/'+a+'.tsv');if(!r.ok)throw Error('Библиотека недоступна');return parseOpenings(await r.text());}))).flat();
     value=searchOpenings(openings,args.query,8);break;
    }
    default:throw Error('Неизвестный инструмент');
   }
   guard();return {ok:true,data:value};
  }catch(e){return {ok:false,error:clip(e?.message,300)||'Инструмент недоступен'};}
 };
}
