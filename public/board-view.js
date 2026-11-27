import {pieceGraphic} from './piece-art.js';

// Keep the squares (and their event handlers) for the lifetime of each board.
const boards=new WeakMap();
const key=p=>p?p.color+p.type.toUpperCase():'';
export const reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
export const scrollBehavior=()=>reducedMotion()?'auto':'smooth';
// Snappy Chess.com-like slide durations; durations below 55 ms snap immediately.
export const MOVE_SPEEDS=Object.freeze({slow:340,medium:180,fast:95,none:0});
const MOTION_KEY='jc-board-motion-v1';
let motionStyle='medium';
export const normalizeMotion=value=>Object.hasOwn(MOVE_SPEEDS,value)?value:'medium';
export function roundMotionFactor(initialMs,incrementMs,finished=false){
 if(finished)return 1;
 const total=Number.isFinite(initialMs)&&initialMs>=0&&Number.isFinite(incrementMs)&&incrementMs>=0?(initialMs+40*incrementMs)/1000:1200;
 return Math.max(0,Math.min(1.2,((total-60)/60)*0.2));
}
export function moveDuration(factor=1){
 const duration=reducedMotion()?0:Math.round(MOVE_SPEEDS[motionStyle]*factor);
 return duration>=55?duration:0;
}
// Puzzles wait briefly before auto-playing the opponent reply so the user registers their move.
export const replyDelay=()=>moveDuration()*1.5;
// Fast-out cubic ease-out: immediate takeoff with soft landing (no initial sluggishness).
export const motionProgress=t=>1-(1-t)**3;
export function motionFrames(dx,dy){
 return Array.from({length:61},(_,i)=>{
  const t=i/60,p=motionProgress(t);
  return {offset:t,transform:`translate3d(${dx*p}%,${dy*p}%,0)`};
 });
}
export function initBoardMotion(storage=globalThis.localStorage){
 const select=document.getElementById('boardMotion');
 if(!select)return;
 try{motionStyle=normalizeMotion(storage.getItem(MOTION_KEY));}catch{motionStyle='medium';}
 select.value=motionStyle;
 select.onchange=()=>{motionStyle=normalizeMotion(select.value);try{storage.setItem(MOTION_KEY,motionStyle);}catch{}};
}
export function setBoardMotion(value,storage=globalThis.localStorage){
 motionStyle=normalizeMotion(value);
 const select=globalThis.document?.getElementById('boardMotion');
 if(select)select.value=motionStyle;
 try{storage?.setItem(MOTION_KEY,motionStyle);}catch{}
 return motionStyle;
}
export function getBoardMotion(){return motionStyle;}
export function squareOrder(flip=false){
 const order=Array.from({length:8},(_,i)=>flip?7-i:i);
 return order.flatMap((r,ri)=>order.map((f,fi)=>({r,f,ri,fi,sq:'abcdefgh'[f]+(8-r)})));
}
export function positionKeys(rows){
 return new Map(squareOrder().map(({r,f,sq})=>[sq,key(rows[r][f])]));
}
// Simulate only the supplied, already-validated moves. Never guess animations
// for jumps, new positions, backwards navigation or changed orientation.
// Moves marked `{ dragged: true }` snap the moved piece immediately while still
// animating a castling rook so drag-and-drop never replays a double flight.
export function planMotion(before,after,moves){
 if(!before||!moves?.length)return [];
 const pos=new Map(before),motions=[];
 for(const m of moves){
  const {from,to,promotion,dragged}=m,p=pos.get(from);
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
  pos.set(from,'');pos.set(to,piece);
  if(!dragged)motions.push({from,to,piece});
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
 if(moves.length===1&&!moves[0].dragged){
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
const SVG_NS='http://www.w3.org/2000/svg';
const ARROW_COLORS={best:'rgba(34,197,94,.86)',hint:'rgba(56,189,248,.88)',threat:'rgba(239,68,68,.84)',alt:'rgba(250,204,21,.84)'};
function squareCenter(sq,flip){
 if(typeof sq!=='string'||sq.length!==2)return null;
 const f='abcdefgh'.indexOf(sq[0]),rank=Number(sq[1]);
 if(f<0||!(rank>=1&&rank<=8))return null;
 const r=8-rank;
 const fi=flip?7-f:f,ri=flip?7-r:r;
 return {x:fi*100+50,y:ri*100+50,fi,ri};
}
function syncArrows(board,state,arrows,flip){
 const list=Array.isArray(arrows)?arrows.filter(a=>a&&a.from&&a.to&&a.from!==a.to):[];
 const sig=list.length?JSON.stringify([flip,list]):'';
 if(state.arrowsSig===sig)return;
 state.arrowsSig=sig;
 if(state.arrowsLayer){state.arrowsLayer.remove();state.arrowsLayer=null;}
 if(!list.length)return;
 const doc=board.ownerDocument;
 if(typeof doc.createElementNS!=='function')return;
 const svg=doc.createElementNS(SVG_NS,'svg');
 svg.setAttribute('class','board-arrows-layer');
 svg.setAttribute('viewBox','0 0 800 800');
 svg.setAttribute('aria-hidden','true');
 for(const arrow of list){
  const a=squareCenter(arrow.from,flip),b=squareCenter(arrow.to,flip);
  if(!a||!b)continue;
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
  if(len<1)continue;
  const ux=dx/len,uy=dy/len,px=-uy,py=ux;
  const color=ARROW_COLORS[arrow.brush]||ARROW_COLORS.best;
  const startOff=22,headLen=34,headHalf=24,shaftHalf=10;
  const sx=a.x+ux*startOff,sy=a.y+uy*startOff;
  const ex=b.x-ux*10,ey=b.y-uy*10;
  const bx=ex-ux*headLen,by=ey-uy*headLen;
  const pts=[
   `${sx+px*shaftHalf},${sy+py*shaftHalf}`,
   `${bx+px*shaftHalf},${by+py*shaftHalf}`,
   `${bx+px*headHalf},${by+py*headHalf}`,
   `${ex},${ey}`,
   `${bx-px*headHalf},${by-py*headHalf}`,
   `${bx-px*shaftHalf},${by-py*shaftHalf}`,
   `${sx-px*shaftHalf},${sy-py*shaftHalf}`
  ].join(' ');
  const poly=doc.createElementNS(SVG_NS,'polygon');
  poly.setAttribute('points',pts);
  poly.setAttribute('fill',color);
  poly.setAttribute('stroke','rgba(11,14,20,.32)');
  poly.setAttribute('stroke-width','2.5');
  poly.setAttribute('stroke-linejoin','round');
  svg.append(poly);
 }
 board.append(svg);
 state.arrowsLayer=svg;
}
function syncBadge(board,state,badge,flip){
 const valid=badge&&badge.square&&badge.symbol?badge:null;
 const sig=valid?`${flip}:${valid.square}:${valid.symbol}:${valid.kind||''}`:'';
 if(state.badgeSig===sig)return;
 state.badgeSig=sig;
 if(state.badgeLayer){state.badgeLayer.remove();state.badgeLayer=null;}
 if(!valid)return;
 const pos=squareCenter(valid.square,flip);
 if(!pos)return;
 const doc=board.ownerDocument,layer=doc.createElement('div');
 layer.className='board-badge-layer';layer.setAttribute('aria-hidden','true');
 const pill=doc.createElement('span');
 pill.className='square-badge badge-'+(valid.kind||'best');
 pill.textContent=valid.symbol;
 pill.style.left=(pos.fi+1)*12.5+'%';
 pill.style.top=pos.ri*12.5+'%';
 layer.append(pill);
 board.append(layer);
 state.badgeLayer=layer;
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
  // Tapping an enemy piece on a legal target square should execute the capture immediately via click.
  if(state.targetSet?.has(sq))return;
  const wasSelected=state.selected===sq;
  if(!wasSelected)state.onClick?.(sq);
  // Only allow dragging if the square is now actually selected (i.e., player's own movable piece).
  const afterSelect=boards.get(board);
  if(!afterSelect||afterSelect.selected!==sq)return;
  const doc=board.ownerDocument,startX=e.clientX,startY=e.clientY,pointerId=e.pointerId,isTouch=e.pointerType==='touch';
  const d={sq,pointerId,startX,startY,isTouch,wasSelected,dragging:false,size:48,liftY:0,ghost:null,origImg:null,overCell:null,doc,onMove:null,onUp:null,onCancel:null};
  function moveGhost(cx,cy){
   if(!d.ghost)return;
   d.ghost.style.transform=`translate3d(${cx-d.size/2}px,${cy-d.size/2-d.liftY}px,0)`;
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
    if(Math.hypot(ev.clientX-startX,ev.clientY-startY)<5)return;
    d.dragging=true;
    const rect=cell.getBoundingClientRect();
    d.size=Math.max(40,rect.width*(d.isTouch?1.38:1.14));
    d.liftY=d.isTouch?rect.height*0.65:0;
    const liveEntry=live.cells.get(sq);
    if(liveEntry?.img){d.origImg=liveEntry.img;d.origImg.style.visibility='hidden';}
    const ghost=doc.createElement('div');
    ghost.className='board-drag-ghost'+(d.isTouch?' is-touch':'');
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
   if(!live)return;
   live.suppressClickSq=sq;
   live.suppressClickUntil=Date.now()+350;
   if(wasDragging){
    if(dropSq&&dropSq!==sq){
     if(live.onDrop)live.onDrop(sq,dropSq);
     else live.onClick?.(dropSq);
    }
   }else if(d.wasSelected){
    // Short tap on an already-selected piece toggles selection off cleanly.
    live.onClick?.(sq);
   }
  };
  d.onCancel=ev=>{if(ev.pointerId===pointerId)stopDrag(state);};
  state.drag=d;
  doc.addEventListener('pointermove',d.onMove,true);
  doc.addEventListener('pointerup',d.onUp,true);
  doc.addEventListener('pointercancel',d.onCancel,true);
 });
}
const PROMO_LABELS={q:'Ферзь',n:'Конь',r:'Ладья',b:'Слон'};
export function decoratePromotionButtons(container,color,prefix){
 if(!container)return;
 container.classList.add('promo-picker');
 for(const type of ['q','n','r','b']){
  const btn=container.querySelector('#'+prefix+type);
  if(!btn)continue;
  btn.classList.add('promo-piece-btn');
  btn.setAttribute('aria-label',PROMO_LABELS[type]);
  btn.setAttribute('title',PROMO_LABELS[type]);
  btn.replaceChildren(pieceGraphic({color,type}));
 }
}
export function clearBoardView(board){
 const state=boards.get(board);if(state){stopDrag(state);stop(state);}
 boards.delete(board);board.replaceChildren();
}
export function renderBoardView(board,{rows,flip=false,interactive=false,disabled=false,onClick=null,onDrop=null,selected=null,targets=[],last=null,marked=[],markClass='mark',checkSquare=null,hintSquare=null,hintTarget=null,arrows=[],badge=null,animateMoves=[],motionFactor=1}){
 const doc=board.ownerDocument,order=squareOrder(flip),next=positionKeys(rows);
 let state=boards.get(board);
 if(!state||state.flip!==flip||state.interactive!==interactive){
  if(state){stopDrag(state);stop(state);}
  state={flip,interactive,disabled,selected,targetSet:new Set(),cells:new Map(),positions:null,motion:null,drag:null,arrowsLayer:null,arrowsSig:'',badgeLayer:null,badgeSig:'',suppressClickSq:null,suppressClickUntil:0,onClick,onDrop};
  const frag=doc.createDocumentFragment();
  for(const {sq,r,f,ri,fi} of order){
   const cell=doc.createElement(interactive?'button':'div');
   if(interactive){cell.type='button';cell.onclick=()=>{if(state.suppressClickSq===sq&&Date.now()<state.suppressClickUntil){state.suppressClickSq=null;return;}state.onClick?.(sq);};}
   cell.className='square '+((r+f)%2?'dark':'light');
   cell.dataset.square=sq;
   if(fi===0)cell.append(coord(doc,'coord',String(8-r)));
   if(ri===7)cell.append(coord(doc,'coord file','abcdefgh'[f]));
   state.cells.set(sq,{cell,img:null,piece:''});frag.append(cell);
  }
  board.replaceChildren(frag);boards.set(board,state);
  if(interactive)attachDrag(board);
 }
 const targetSet=new Set(targets),markedSet=new Set(marked);
 state.onClick=onClick;state.onDrop=onDrop;state.disabled=disabled;state.selected=selected;state.targetSet=targetSet;
 const changed=!state.positions||[...next].some(([sq,p])=>state.positions.get(sq)!==p);
 const before=state.positions,duration=moveDuration(motionFactor);
 // Multi-ply jumps are immediate; callers showing replies render each ply separately.
 const motion=changed&&duration&&animateMoves.length===1?planMotion(before,next,animateMoves):[];
 if(changed){stopDrag(state);stop(state);}
 for(const {sq,r,f} of order){
  const entry=state.cells.get(sq),{cell}=entry,p=rows[r][f],piece=next.get(sq);
  if(entry.piece!==piece){
   entry.img?.remove();entry.img=p?pieceGraphic(p):null;
   if(entry.img)cell.prepend(entry.img);
   entry.piece=piece;
  }
  const cls='square '+((r+f)%2?'dark':'light')+(last&&(last.from===sq||last.to===sq)?' last':'')+(selected===sq?' selected':'')+(targetSet.has(sq)?' target':'')+(markedSet.has(sq)?' '+markClass:'')+(checkSquare===sq?' in-check':'')+(hintSquare===sq?' hint-piece':'')+(hintTarget===sq?' hint-target':'');
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
 syncArrows(board,state,arrows,flip);
 syncBadge(board,state,badge,flip);
 showMotion(board,state,order,before,animateMoves,motion,duration);
}
