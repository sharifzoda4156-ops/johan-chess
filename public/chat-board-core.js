// Resolve model references only against the exact submitted game; never trust model FEN or moves.
export function splitBoardMarkers(text,boards){
 const result=[],used=new Set();let last=0;
 const re=/^[ \t]*\[\[board:(\d{1,6})\]\][ \t]*$/gm;
 for(const m of String(text).matchAll(re)){
  if(m.index>last)result.push({type:'text',text:text.slice(last,m.index)});
  const index=Number(m[1]);
  if(used.size<3&&!used.has(index)&&boards?.[index]){used.add(index);result.push({type:'board',board:boards[index]});}
  last=m.index+m[0].length;
 }
 if(last<text.length)result.push({type:'text',text:text.slice(last)});
 return result;
}
export function snapshotBoards(game,Chess){
 const out=Object.create(null);if(!game||!['1-0','0-1','1/2-1/2'].includes(game.result)||!Array.isArray(game.moves)||!Array.isArray(game.analysis))return out;
 const records=new Map(game.analysis.map(r=>[r.index,r]));let replay;
 try{replay=new Chess(game.startFen);}catch{return out;}
 for(let i=0;i<game.moves.length;i++){
  const before=replay.fen();let played;
  try{played=replay.move(game.moves[i]);}catch{break;}
  const r=records.get(i);
  if(!r||r.color!==played.color||r.move!==played.from+played.to+(played.promotion||''))continue;
  try{
   const best=new Chess(before),uci=r.best;
   if(typeof uci!=='string'||!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))continue;
   const bm=best.move({from:uci.slice(0,2),to:uci.slice(2,4),...(uci.length===5?{promotion:uci[4]}:{})});
   out[i]={index:i,before,playedFen:replay.fen(),bestFen:best.fen(),played:{from:played.from,to:played.to,san:played.san},best:{from:bm.from,to:bm.to,san:bm.san},color:played.color,orientation:game.color==='b'?'b':'w',label:String(r.label||''),number:before.split(' ')[5]+(played.color==='w'?'. ':'... ')};
  }catch{}
 }
 return out;
}
