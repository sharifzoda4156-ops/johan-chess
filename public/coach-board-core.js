// Resolve model references exclusively against the game snapshot sent with this request.
export function resolveBoards(answer,game,Chess){
 const parts=[];let at=0,count=0;
 const regex=/\[\[board:(\d{1,5})\]\]/g;
 const records=new Map((game?.analysis||[]).map(r=>[r.index,r]));
 let positions=null;
 function getPositions(){
  if(positions)return positions;
  const c=new Chess(game.startFen);
  positions=[c.fen()];
  for(const san of game.moves){c.move(san);positions.push(c.fen());}
  return positions;
 }
 function legal(fen,uci){
  if(typeof uci!=='string'||!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))throw Error('Invalid move');
  const c=new Chess(fen);const move=c.move({from:uci.slice(0,2),to:uci.slice(2,4),...(uci.length===5?{promotion:uci[4]}:{})});
  return {fen:c.fen(),from:move.from,to:move.to,san:move.san};
 }
 for(const m of String(answer).matchAll(regex)){
  if(m.index>at)parts.push({text:answer.slice(at,m.index)});
  at=m.index+m[0].length;const index=Number(m[1]),r=records.get(index);
  try{
   if(!game||!['1-0','0-1','1/2-1/2'].includes(game.result)||!r||count>=3||index>=game.moves.length)throw Error('Unknown board');
   const fen=getPositions()[index],played=legal(fen,r.move),best=legal(fen,r.best);
   if(played.fen!==getPositions()[index+1])throw Error('Mismatched played move');
   const fields=fen.split(' ');parts.push({board:{fen,played,best,label:fields[5]+(fields[1]==='w'?'. ':'... ')+played.san,orientation:game.color==='b'?'b':'w',classification:r.label||'',historical:game.source==='historical'}});count++;
  }catch{parts.push({text:'[Позиция недоступна]'});}
 }
 if(at<answer.length)parts.push({text:answer.slice(at)});
 return parts;
}
