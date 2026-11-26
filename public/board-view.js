import {pieceGraphic} from './piece-art.js';

// Keep the squares (and their event handlers) for the lifetime of each board.
const boards=new WeakMap();
const key=p=>p?p.color+p.type.toUpperCase():'';
export const reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
export const scrollBehavior=()=>reducedMotion()?'auto':'smooth';
// Lichess user preferences (lila Pref.animationMillis); Chessground disables durations below 70 ms.
export const MOVE_SPEEDS=Object.freeze({slow:500,medium:250,fast:120,none:0});
const MOTION_KEY='jc-board-motion-v1';
let motionStyle='medium';
export const normalizeMotion=value=>Object.hasOwn(MOVE_SPEEDS,value)?value:'medium';
export function roundMotionFactor(initialMs,incrementMs,finished=false){
 if(finished)return 1;
 const total=Number.isFinite(initialMs)&&initialMs>=0&&Number.isFinite(incrementMs)&&incrementMs>=0?(initialMs+40*incrementMs)/1000:1200;
 return Math.max(0,Math.min(1.2,((total-60)/60)*0.2));
}
export function moveDuration(factor=1){
 const duration=reducedMotion()?0:MOVE_SPEEDS[motionStyle]*factor;
 return duration>=70?duration:0;
}
// Lichess puzzles with manual next use 1.5 times the selected animation duration.
export const replyDelay=()=>moveDuration()*1.5;
// Sample the cubic ease-in-out curve at 120 uniform intervals for compositor animation.
// This is the same mathematical curve used by Chessground, not a CSS Bezier approximation.
export const motionProgress=t=>t<0.5?4*t*t*t:1-4*(1-t)**3;
export function motionFrames(dx,dy){
 return Array.from({length:121},(_,i)=>{
  const t=i/120,p=motionProgress(t);
  return {offset:t,transform:'translate('+(dx*p)+'%,'+(dy*p)+'%)'};
 });
}
export function initBoardMotion(storage=globalThis.localStorage){
 const select=document.getElementById('boardMotion');
 if(!select)return;
 try{motionStyle=normalizeMotion(storage.getItem(MOTION_KEY));}catch{motionStyle='medium';}
 select.value=motionStyle;
 select.onchange=()=>{motionStyle=normalizeMotion(select.value);try{storage.setItem(MOTION_KEY,motionStyle);}catch{}};
}
export function squareOrder(flip=false){
 const order=Array.from({length:8},(_,i)=>flip?7-i:i);
 return order.flatMap((r,ri)=>order.map((f,fi)=>({r,f,ri,fi,sq:'abcdefgh'[f]+(8-r)})));
}
export function positionKeys(rows){
 return new Map(squareOrder().map(({r,f,sq})=>[sq,key(rows[r][f])]));
}
// Simulate only the supplied, already-validated moves. Never guess animations
// for jumps, new positions, backwards navigation or changed orientation.
export function planMotion(before,after,moves){
 if(!before||!moves?.length)return [];
 const pos=new Map(before),motions=[];
 for(const m of moves){
  const {from,to,promotion}=m,p=pos.get(from);
  if(!p||!pos.has(to)||from===to)return [];
  const oldTarget=pos.get(to),color=p[0],type=p[1];
  if(type==='K'&&Math.abs(from.charCodeAt(0)-to.charCodeAt(0))===2){
   const kingside=to>from,rf=(kingside?'h':'a')+from[1],rt=(kingside?'f':'d')+from[1];
   if(pos.get(rf)!==color+'R'||pos.get(rt))return [];
   pos.set(rf,'');pos.set(rt,color+'R');motions.push({from:rf,to:rt,piece:color+'R'});
  }
  if(type==='P'&&from[0]!==to[0]&&!oldTarget){
   const victim=to[0]+from[1];
   if(pos.get(victim)!==(color==='w'?'b':'w')+'P')return [];
   pos.set(victim,'');
  }
  const piece=promotion?color+promotion.toUpperCase():p;
  pos.set(from,'');pos.set(to,piece);motions.push({from,to,piece});
 }
 if([...after].some(([sq,p])=>pos.get(sq)!==p))return [];
 // A reply can capture the first moving piece. Only animate surviving pieces.
 return motions.filter((m,i)=>after.get(m.to)===m.piece&&!motions.slice(i+1).some(n=>n.to===m.to||n.from===m.to));
}
function coord(doc,cls,value){
 const el=doc.createElement('span');el.className=cls;el.textContent=value;return el;
}
function stop(state){
 const run=state.motion;if(!run)return;
 state.motion=null;
 for(const a of run.animations)a.cancel();
 for(const img of run.hidden)img.style.visibility='';
 run.layer.remove();
}
function showMotion(board,state,order,before,moves,motion,duration){
 if(!motion.length||!duration||!board.isConnected||board.clientWidth<=0)return;
 const doc=board.ownerDocument,layer=doc.createElement('div');
 layer.className='board-motion-layer';layer.setAttribute('aria-hidden','true');
 const run={layer,hidden:[],animations:[]};state.motion=run;board.append(layer);
 function sprite(square,piece){
  const pos=order.find(x=>x.sq===square),holder=doc.createElement('div');
  holder.className='board-motion-piece';holder.style.left=pos.fi*12.5+'%';holder.style.top=pos.ri*12.5+'%';
  holder.append(pieceGraphic({color:piece[0],type:piece[1].toLowerCase()}));layer.append(holder);return holder;
 }
 // Keep a captured piece visible until the mover arrives. En passant uses its actual square.
 if(moves.length===1){
  const m=moves[0],source=before.get(m.from);
  const victim=before.get(m.to)?m.to:source?.[1]==='P'&&m.from[0]!==m.to[0]?m.to[0]+m.from[1]:null;
  const captured=victim&&before.get(victim);
  if(captured&&captured[0]!==source[0])sprite(victim,captured);
 }
 try{
  for(const m of motion){
   const img=state.cells.get(m.to)?.img;if(!img)continue;
   const a=order.find(x=>x.sq===m.from),b=order.find(x=>x.sq===m.to);
   // The pawn travels as a pawn; the chosen piece appears on arrival.
   const holder=sprite(m.from,before.get(m.from)||m.piece);
   holder.classList.add('board-motion-moving');
   if(!holder.animate){stop(state);return;}
   img.style.visibility='hidden';run.hidden.push(img);
   const anim=holder.animate(motionFrames((b.fi-a.fi)*100,(b.ri-a.ri)*100),{duration,easing:'linear',fill:'forwards'});
   run.animations.push(anim);
  }
  if(!run.animations.length){stop(state);return;}
  Promise.all(run.animations.map(a=>a.finished)).then(()=>{if(state.motion===run)stop(state);},()=>{if(state.motion===run)stop(state);});
 }catch{if(state.motion===run)stop(state);}
}
export function squareAtPoint(rect,clientX,clientY,flip=false){
 if(!rect||rect.width<=0||rect.height<=0)return null;
 const x=clientX-rect.left,y=clientY-rect.top;
 if(x<0||y<0||x>=rect.width||y>=rect.height)return null;
 const fi=Math.min(7,Math.max(0,Math.floor(x/(rect.width/8))));
 const ri=Math.min(7,Math.max(0,Math.floor(y/(rect.height/8))));
 const f=flip?7-fi:fi,r=flip?7-ri:ri;
 return 'abcdefgh'[f]+(8-r);
}
function stopDrag(state){
 const d=state.drag;if(!d)return;
 state.drag=null;
 d.doc.removeEventListener('pointermove',d.onMove,true);
 d.doc.removeEventListener('pointerup',d.onUp,true);
 d.doc.removeEventListener('pointercancel',d.onCancel,true);
 if(d.overCell)d.overCell.classList.remove('drag-over');
 if(d.origImg)d.origImg.style.visibility='';
 if(d.ghost)d.ghost.remove();
}
const dragBoundBoards=new WeakSet();
function attachDrag(board){
 if(typeof board.addEventListener!=='function'||dragBoundBoards.has(board))return;
 dragBoundBoards.add(board);
 board.addEventListener('pointerdown',e=>{
  const state=boards.get(board);
  if(!state||!state.interactive||state.disabled||e.button>0||state.drag)return;
  const cell=e.target?.closest?.('[data-square]');
  if(!cell||cell.disabled)return;
  const sq=cell.dataset.square,entry=state.cells.get(sq);
  if(!entry||!entry.piece)return;
  const doc=board.ownerDocument,startX=e.clientX,startY=e.clientY,pointerId=e.pointerId;
  const d={sq,pointerId,startX,startY,dragging:false,ghost:null,origImg:null,overCell:null,doc,onMove:null,onUp:null,onCancel:null};
  function moveGhost(cx,cy){
   if(!d.ghost)return;
   d.ghost.style.transform=`translate3d(${cx-d.size/2}px,${cy-d.size/2}px,0)`;
   const live=boards.get(board);if(!live)return;
   const overSq=squareAtPoint(board.getBoundingClientRect(),cx,cy,live.flip);
   const nextCell=overSq?live.cells.get(overSq)?.cell:null;
   if(d.overCell!==nextCell){
    if(d.overCell)d.overCell.classList.remove('drag-over');
    d.overCell=nextCell||null;
    if(d.overCell)d.overCell.classList.add('drag-over');
   }
  }
  d.onMove=ev=>{
   if(ev.pointerId!==pointerId)return;
   const live=boards.get(board);if(!live){stopDrag(state);return;}
   if(!d.dragging){
    if(Math.hypot(ev.clientX-startX,ev.clientY-startY)<6)return;
    d.dragging=true;
    const rect=cell.getBoundingClientRect();
    d.size=Math.max(36,rect.width*1.12);
    if(live.selected!==sq)live.onClick?.(sq);
    const liveEntry=live.cells.get(sq);
    if(liveEntry?.img){d.origImg=liveEntry.img;d.origImg.style.visibility='hidden';}
    const ghost=doc.createElement('div');
    ghost.className='board-drag-ghost';
    ghost.style.width=d.size+'px';ghost.style.height=d.size+'px';
    const piece=liveEntry?.piece||entry.piece;
    ghost.append(pieceGraphic({color:piece[0],type:piece[1].toLowerCase()}));
    doc.body.append(ghost);
    d.ghost=ghost;
   }
   ev.preventDefault();
   moveGhost(ev.clientX,ev.clientY);
  };
  d.onUp=ev=>{
   if(ev.pointerId!==pointerId)return;
   const live=boards.get(board);
   const wasDragging=d.dragging;
   const dropSq=wasDragging&&live?squareAtPoint(board.getBoundingClientRect(),ev.clientX,ev.clientY,live.flip):null;
   stopDrag(state);
   if(wasDragging&&live){
    live.suppressClickUntil=Date.now()+250;
    if(dropSq&&dropSq!==sq){
     if(live.onDrop)live.onDrop(sq,dropSq);
     else live.onClick?.(dropSq);
    }
   }
  };
  d.onCancel=ev=>{if(ev.pointerId===pointerId)stopDrag(state);};
  state.drag=d;
  doc.addEventListener('pointermove',d.onMove,true);
  doc.addEventListener('pointerup',d.onUp,true);
  doc.addEventListener('pointercancel',d.onCancel,true);
 });
}
export function clearBoardView(board){
 const state=boards.get(board);if(state){stopDrag(state);stop(state);}
 boards.delete(board);board.replaceChildren();
}
export function renderBoardView(board,{rows,flip=false,interactive=false,disabled=false,onClick=null,onDrop=null,selected=null,targets=[],last=null,marked=[],markClass='mark',checkSquare=null,animateMoves=[],motionFactor=1}){
 const doc=board.ownerDocument,order=squareOrder(flip),next=positionKeys(rows);
 let state=boards.get(board);
 if(!state||state.flip!==flip||state.interactive!==interactive){
  if(state){stopDrag(state);stop(state);}
  state={flip,interactive,disabled,selected,cells:new Map(),positions:null,motion:null,drag:null,suppressClickUntil:0,onClick,onDrop};
  const frag=doc.createDocumentFragment();
  for(const {sq,r,f,ri,fi} of order){
   const cell=doc.createElement(interactive?'button':'div');
   if(interactive){cell.type='button';cell.onclick=()=>{if(Date.now()<state.suppressClickUntil)return;state.onClick?.(sq);};}
   cell.className='square '+((r+f)%2?'dark':'light');
   cell.dataset.square=sq;
   if(fi===0)cell.append(coord(doc,'coord',String(8-r)));
   if(ri===7)cell.append(coord(doc,'coord file','abcdefgh'[f]));
   state.cells.set(sq,{cell,img:null,piece:''});frag.append(cell);
  }
  board.replaceChildren(frag);boards.set(board,state);
  if(interactive)attachDrag(board);
 }
 state.onClick=onClick;state.onDrop=onDrop;state.disabled=disabled;state.selected=selected;
 const changed=!state.positions||[...next].some(([sq,p])=>state.positions.get(sq)!==p);
 const before=state.positions,duration=moveDuration(motionFactor);
 // Multi-ply jumps are immediate; callers showing replies render each ply separately.
 const motion=changed&&duration&&animateMoves.length===1?planMotion(before,next,animateMoves):[];
 if(changed){stopDrag(state);stop(state);}
 const targetSet=new Set(targets),markedSet=new Set(marked);
 for(const {sq,r,f} of order){
  const entry=state.cells.get(sq),{cell}=entry,p=rows[r][f],piece=next.get(sq);
  if(entry.piece!==piece){
   entry.img?.remove();entry.img=p?pieceGraphic(p):null;
   if(entry.img)cell.prepend(entry.img);
   entry.piece=piece;
  }
  const cls='square '+((r+f)%2?'dark':'light')+(last&&(last.from===sq||last.to===sq)?' last':'')+(selected===sq?' selected':'')+(targetSet.has(sq)?' target':'')+(markedSet.has(sq)?' '+markClass:'')+(checkSquare===sq?' in-check':'');
  if(cell.className!==cls)cell.className=cls;
  const label=sq+(p?' '+p.color+p.type:'');
  if(cell.getAttribute('aria-label')!==label)cell.setAttribute('aria-label',label);
  if(interactive){
   if(cell.disabled!==disabled)cell.disabled=disabled;
   const pressed=String(selected===sq);
   if(cell.getAttribute('aria-pressed')!==pressed)cell.setAttribute('aria-pressed',pressed);
  }
 }
 state.positions=next;
 showMotion(board,state,order,before,animateMoves,motion,duration);
}

