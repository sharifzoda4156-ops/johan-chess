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
 const games=new Map();let openings=null,history=null,calls=0,searches=0;
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
 async function analyze(ref,ply,depth){
  guard();const g=get(ref),{startFen,moves}=validatedGame(g,Chess);
  if(!Number.isInteger(ply)||ply<0||ply>=moves.length||![10,13,16].includes(depth))throw Error('Неверный индекс или глубина');
  const m=moves[ply],prefix=moves.slice(0,ply).map(uci),actual=uci(m);
  const key=JSON.stringify([enginePath,startFen,prefix,actual,depth]);
  if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return {...value,cacheHit:true};}
  const existing=g.analysis?.find(r=>r.index===ply&&r.move===actual);
  if(existing&&g.depth===depth&&existing.bestScore&&existing.playedScore)return {...existing,source:'saved Stockfish report',depth,cacheHit:true};
  if(++searches>4)throw Error('Лимит анализа за запрос: 4 позиции');
  const e=new Engine(enginePath);
  try{
   await e.init();guard();const best=await e.search(startFen,prefix,depth);guard();
   const played=best.best===actual?best:await e.search(startFen,prefix,depth,actual);guard();
   const pos=new Chess(m.before),pv=[];for(const u of best.pv.slice(0,8)){try{pv.push(pos.move({from:u.slice(0,2),to:u.slice(2,4),...(u.length>4?{promotion:u[4]}:{})}).san);}catch{break;}}
   const result={index:ply,san:m.san,color:m.color,move:actual,best:best.best,bestSan:pv[0]||best.best,pv,bestScore:best.score,playedScore:played.score,depth:Math.min(best.depth,played.depth),requestedDepth:depth,...evaluateMove(best.score,played.score,best.best===actual),source:'Stockfish'};
   cache.set(key,result);if(cache.size>128)cache.delete(cache.keys().next().value);return {...result,cacheHit:false};
  }finally{e.close();}
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
