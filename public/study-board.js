import {Chess} from './chess.js';
import {renderBoardView} from './board-view.js';
export function renderMiniBoard(p){
 const el=document.createElement('section');el.className='mini-position';
 const title=document.createElement('h3');title.textContent=p.title+(p.label?' · '+p.label:'');el.append(title);
 const board=document.createElement('div');board.className='mini-board';board.setAttribute('aria-label','Позиция перед ходом '+p.title);el.append(board);
 const info=document.createElement('div');info.className='mini-info';
 const controls=document.createElement('div');controls.className='mini-controls';
 const actions=[['before','До хода'],['actual','Твой ход'],['best','Лучший ход']];
 const buttons=actions.map(([mode,label])=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>draw(mode);controls.append(b);return b;});
 el.append(controls,info);
 function draw(mode){
  const move=mode==='before'?null:p[mode],c=new Chess(p.fen);
  if(move)c.move({from:move.from,to:move.to,...(move.promotion?{promotion:move.promotion}:{})});
  const flip=p.orientation==='b';
  board.querySelector('.mini-arrows')?.remove();
  renderBoardView(board,{rows:c.board(),flip,marked:move?[move.from,move.to]:[],animateMoves:move?[move]:[]});
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 800 800');svg.setAttribute('class','mini-arrows');
  const xy=s=>{let x='abcdefgh'.indexOf(s[0]),y=8-Number(s[1]);if(flip){x=7-x;y=7-y;}return [x*100+50,y*100+50];};
  function arrow(m,color){
   const [x,y]=xy(m.from),[a,b]=xy(m.to),angle=Math.atan2(b-y,a-x),endX=a-15*Math.cos(angle),endY=b-15*Math.sin(angle),baseX=endX-25*Math.cos(angle),baseY=endY-25*Math.sin(angle);
   const path=document.createElementNS(ns,'path');path.setAttribute('d','M '+x+' '+y+' L '+baseX+' '+baseY);path.setAttribute('stroke',color);path.setAttribute('stroke-width','13');path.setAttribute('stroke-linecap','round');svg.append(path);
   const tip=document.createElementNS(ns,'path');tip.setAttribute('d','M '+endX+' '+endY+' L '+(baseX+15*Math.sin(angle))+' '+(baseY-15*Math.cos(angle))+' L '+(baseX-15*Math.sin(angle))+' '+(baseY+15*Math.cos(angle))+' Z');tip.setAttribute('fill',color);svg.append(tip);
  }
  if(mode==='before'){if(p.actual.san!==p.best.san)arrow(p.actual,'#d65b4dcc');arrow(p.best,'#4a9e3cdd');board.append(svg);}
  buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(actions[i][0]===mode)));
  info.textContent=mode==='before'?'Красный: '+p.actual.san+' · Зелёный: '+p.best.san:mode==='actual'?'Сыграно: '+p.actual.san:'Лучше по Stockfish: '+p.best.san;
 }
 draw('before');return el;
}
