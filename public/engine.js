import {parseInfo,parseMultiInfo} from './metrics.js';
const running=new Set();let onlineBlocked=false;
export function setEngineOnlineLock(value){onlineBlocked=!!value;if(onlineBlocked)for(const engine of [...running])engine.close();}
export class Engine{
 constructor(path){if(onlineBlocked)throw Error('Stockfish недоступен во время онлайн-партии');this.closed=false;this.multiPv=1;this.worker=new Worker(path);running.add(this);this.waiter=null;this.worker.onmessage=e=>{for(const l of String(e.data).split('\n'))this.waiter?.line(l.trim());};this.worker.onerror=e=>this.waiter?.fail(Error(e.message||'Ошибка запуска Stockfish'));}
 wait(command,predicate,ms=45000,onInfo=()=>{}){if(this.closed||onlineBlocked)throw Error('Stockfish отключён');if(this.waiter)throw Error('Stockfish занят');return new Promise((resolve,reject)=>{let timer;const end=(err,val)=>{clearTimeout(timer);this.waiter=null;err?reject(err):resolve(val);};this.waiter={line:l=>{onInfo(l);if(predicate(l))end(null,l);},fail:e=>end(e)};timer=setTimeout(()=>end(Error('Stockfish не ответил')),ms);try{this.worker.postMessage(command);}catch(e){end(e);}});}
 async init(){await this.wait('uci',l=>l==='uciok');this.worker.postMessage('setoption name Hash value 32');this.worker.postMessage('setoption name MultiPV value 1');this.multiPv=1;await this.wait('isready',l=>l==='readyok');}
 async setSkill(level){if(!Number.isInteger(level)||level<0||level>20)throw Error('Некорректная сложность');this.worker.postMessage('setoption name UCI_LimitStrength value false');this.worker.postMessage('setoption name Skill Level value '+level);await this.wait('isready',l=>l==='readyok');}
 async setMultiPv(count){const n=Math.max(1,Math.min(5,Number(count)||1));if(this.multiPv===n)return;this.worker.postMessage('setoption name MultiPV value '+n);this.multiPv=n;await this.wait('isready',l=>l==='readyok');}
 async choose(fen,moves,milliseconds){await this.setMultiPv(1);this.worker.postMessage('position fen '+fen+(moves.length?' moves '+moves.join(' '):''));const line=await this.wait('go movetime '+Math.max(1,Math.floor(milliseconds)),l=>l.startsWith('bestmove '),30000);return line.split(/\s+/)[1];}
 async search(fen,moves,depth,only){await this.setMultiPv(1);let info=null;this.worker.postMessage('position fen '+fen+(moves.length?' moves '+moves.join(' '):''));const line=await this.wait('go depth '+depth+(only?' searchmoves '+only:''),l=>l.startsWith('bestmove '),120000,l=>{const x=parseInfo(l);if(x&&(!info||x.depth>=info.depth))info=x;});if(!info)throw Error('Нет оценки движка: '+line);return {...info,best:line.split(/\s+/)[1]};}
 async searchMulti(fen,moves,depth,count=2){
  await this.setMultiPv(count);
  const byRank=new Map();
  this.worker.postMessage('position fen '+fen+(moves.length?' moves '+moves.join(' '):''));
  const line=await this.wait('go depth '+depth,l=>l.startsWith('bestmove '),120000,l=>{
   const x=parseMultiInfo(l);
   if(!x)return;
   const prev=byRank.get(x.multipv);
   if(!prev||x.depth>=prev.depth)byRank.set(x.multipv,x);
  });
  const lines=[...byRank.entries()].sort((a,b)=>a[0]-b[0]).map(([,v])=>({move:v.pv[0]||'',score:v.score,depth:v.depth,pv:v.pv}));
  if(!lines.length)throw Error('Нет оценки движка: '+line);
  const top=lines[0];
  return {...top,best:line.split(/\s+/)[1]||top.move,lines};
 }
 stopSearch(){if(this.closed||!this.waiter)return;try{this.worker.postMessage('stop');}catch{}}
 close(){if(this.closed)return;this.closed=true;running.delete(this);this.waiter?.fail(Error('Анализ остановлен'));this.worker.terminate();}
}
