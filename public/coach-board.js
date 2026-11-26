import {Chess} from './chess.js';
import {pieceGraphic} from './piece-art.js';
import {resolveBoards} from './coach-board-core.js';
export const snapshotBoards=(answer,game)=>resolveBoards(answer,game,Chess);
const NS='http://www.w3.org/2000/svg';
function elem(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function point(sq,flip){const f='abcdefgh'.indexOf(sq[0]),r=8-Number(sq[1]);return [flip?7.5-f:f+.5,flip?7.5-r:r+.5];}
function arrow(svg,move,flip,color){
 const [x,y]=point(move.from,flip),[tx,ty]=point(move.to,flip);
 const dx=tx-x,dy=ty-y,len=Math.hypot(dx,dy);if(!len)return;
 const ux=dx/len,uy=dy/len,endX=tx-ux*.12,endY=ty-uy*.12,baseX=endX-ux*.38,baseY=endY-uy*.38;
 const line=document.createElementNS(NS,'line');for(const [k,v] of Object.entries({x1:x,y1:y,x2:baseX,y2:baseY,stroke:color,'stroke-width':.16,'stroke-linecap':'round'}))line.setAttribute(k,v);
 const tip=document.createElementNS(NS,'polygon');tip.setAttribute('points',endX+','+endY+' '+(baseX-uy*.20)+','+(baseY+ux*.20)+' '+(baseX+uy*.20)+','+(baseY-ux*.20));tip.setAttribute('fill',color);svg.append(line,tip);
}
export function renderMiniBoard(card){
 const root=elem('section','mini-position'),title=elem('h3',null,card.label+(card.classification?' · '+card.classification:'')),board=elem('div','mini-board'),controls=elem('div','mini-controls'),info=elem('div','mini-info');
 const modes=[['before','До хода'],['played','Твой ход'],['best','Лучший']],buttons=[];
 const flip=card.orientation==='b';
 function draw(mode){
  const fen=mode==='before'?card.fen:card[mode].fen;
  const c=new Chess(fen),rows=c.board(),order=Array.from({length:8},(_,i)=>flip?7-i:i);
  board.replaceChildren();board.setAttribute('aria-label','Шахматная позиция: '+modes.find(m=>m[0]===mode)[1]);
  const marked=mode==='before'?[]:[card[mode].from,card[mode].to];
  for(const [ri,r] of order.entries())for(const [fi,f] of order.entries()){
   const sq='abcdefgh'[f]+(8-r),p=rows[r][f],cell=elem('div','square '+((r+f)%2?'dark':'light')+(marked.includes(sq)?' mark':''));
   if(p)cell.append(pieceGraphic(p));if(fi===0)cell.append(elem('span','coord',8-r));if(ri===7)cell.append(elem('span','coord file','abcdefgh'[f]));board.append(cell);
  }
  if(mode==='before'){
   const overlay=document.createElementNS(NS,'svg');overlay.setAttribute('class','mini-arrows');overlay.setAttribute('viewBox','0 0 8 8');overlay.setAttribute('aria-hidden','true');
   if(card.played.from!==card.best.from||card.played.to!==card.best.to)arrow(overlay,card.played,flip,'#d84c43d9');
   arrow(overlay,card.best,flip,'#329e4ce6');board.append(overlay);
  }
  for(const [key,b] of buttons)b.setAttribute('aria-pressed',String(key===mode));
  info.textContent=mode==='before'?'Твой ход: '+card.played.san+' · лучший: '+card.best.san:mode==='played'?'Сыграно: '+card.played.san:'Stockfish: '+card.best.san;
 }
 for(const [key,label] of modes){const b=elem('button',null,label);b.type='button';b.onclick=()=>draw(key);buttons.push([key,b]);controls.append(b);}
 root.append(title,board,controls,info);draw('before');return root;
}
export function renderCoachContent(body,message){
 if(!Array.isArray(message.parts)){body.textContent=message.content;return;}
 for(const p of message.parts){if(p.board)body.append(renderMiniBoard(p.board));else if(p.text)body.append(elem('div','chat-text',p.text));}
}
