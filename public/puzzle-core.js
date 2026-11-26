import {parseUci} from './training-core.js';
export const uci=m=>m.from+m.to+(m.promotion||'');
export function preparePuzzle(p,Chess){
 if(!p||!(/^[A-Za-z0-9]{5}$/.test(p.id))||!Number.isInteger(p.rating)||!Array.isArray(p.themes)||!Array.isArray(p.moves)||p.moves.length<2||p.moves.length%2!==0)return null;
 try{
  const g=new Chess(p.fen),first=g.move(parseUci(p.moves[0]));if(!first||g.isGameOver())return null;
  const fen=g.fen(),color=g.turn(),line=[];
  for(const m of p.moves.slice(1)){if(g.isGameOver())return null;const played=g.move(parseUci(m));if(!played)return null;line.push(played.san);}
  return {...p,startFen:fen,color,line,solution:p.moves.slice(1),mateOne:p.themes.includes('mateIn1')&&p.moves.length===2&&g.isCheckmate()};
 }catch{return null;}
}
// Correct user move advances the published solution and plays its recorded reply.
export function advancePuzzle(p,game,index,move,Chess){
 try{
  if(index<0||index%2||index>=p.solution.length||game.turn()!==p.color)return null;
  const candidate=new Chess(game.fen());const played=candidate.move(parseUci(uci(move)));
  if(uci(played)!==p.solution[index]&&!(p.mateOne&&index===0&&candidate.isCheckmate()))return null;
  const next=index+1;let reply=null;
  if(next<p.solution.length)reply=candidate.move(parseUci(p.solution[next]));
  return {game:candidate,index:next+(reply?1:0),done:next+(reply?1:0)===p.solution.length,played,reply};
 }catch{return null;}
}
export function filterPuzzles(rows,theme,band){
 const [min,max]=band.split('-').map(Number);
 return rows.filter(p=>p.rating>=min&&p.rating<=max&&(theme==='all'||p.themes.includes(theme)));
}
export function cleanProgress(raw){
 const p=raw&&typeof raw==='object'?raw:{};
 const nonneg=n=>Number.isSafeInteger(n)&&n>=0?n:0;
 const solved=Array.isArray(p.solved)?[...new Set(p.solved.filter(id=>typeof id==='string'))].slice(0,20000):[];
 return {completed:nonneg(p.completed),clean:nonneg(p.clean),streak:nonneg(p.streak),bestStreak:nonneg(p.bestStreak),solved};
}
export function finishAttempt(raw,id,assisted){
 const p=cleanProgress(raw),clean=!assisted,streak=clean?p.streak+1:0;
 return {completed:p.completed+1,clean:p.clean+(clean?1:0),streak,bestStreak:Math.max(streak,p.bestStreak),solved:[...new Set([...p.solved,id])].slice(-20000)};
}
export function choosePuzzle(items,progress,current){
 const index=items.findIndex(p=>p.id===current);
 const rotated=index<0?items:[...items.slice(index+1),...items.slice(0,index+1)];
 return rotated.find(p=>p.id!==current&&!progress.solved.includes(p.id))||rotated[0]||null;
}
