// Model selects an index; the client owns all board data and validates moves.
export function boardSnapshots(game,Chess){
 const out=new Map();
 if(!game||!Array.isArray(game.moves)||!Array.isArray(game.analysis))return out;
 try{
  const c=new Chess(game.startFen);
  const byIndex=new Map(game.analysis.filter(r=>Number.isInteger(r.index)).map(r=>[r.index,r]));
  for(let i=0;i<game.moves.length;i++){
   const fen=c.fen(),actual=c.move(game.moves[i]),r=byIndex.get(i);
   if(!r||!actual||r.san!==actual.san||r.color!==actual.color)continue;
   const b=new Chess(fen),u=r.best;
   if(typeof u!=='string'||!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u))continue;
   let best;try{best=b.move({from:u.slice(0,2),to:u.slice(2,4),...(u.length===5?{promotion:u[4]}:{})});}catch{continue;}
   if(!best)continue;
   out.set(i,{fen,actual,best,orientation:game.color==='b'?'b':'w',label:r.label||'',title:fen.split(' ')[5]+(actual.color==='w'?'. ':'... ')+actual.san});
  }
 }catch{/* A malformed game cannot provide invented positions. */}
 return out;
}
export function splitBoardReply(text,snapshots){
 const parts=[],seen=new Set();let count=0;
 for(const line of String(text).split(/\r?\n/)){
  const m=line.trim().match(/^\[\[board:(\d+)\]\]$/);
  if(!m){const last=parts.at(-1);if(last?.type==='text')last.text+='\n'+line;else parts.push({type:'text',text:line});continue;}
  const index=Number(m[1]);
  if(count<3&&!seen.has(index)&&snapshots.has(index)){parts.push({type:'board',position:snapshots.get(index)});seen.add(index);count++;}
 }
 return parts;
}
