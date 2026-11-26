import {pieceGraphic} from './piece-art.js';

// Keep the squares (and their event handlers) for the lifetime of each board.
const boards=new WeakMap();
const key=p=>p?p.color+p.type.toUpperCase():'';
export const reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
export const scrollBehavior=()=>reducedMotion()?'auto':'smooth';
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
function stop(state){for(const a of state.animations)a.cancel();state.animations=[];}
export function clearBoardView(board){
 const state=boards.get(board);if(state)stop(state);
 boards.delete(board);board.replaceChildren();
}
export function renderBoardView(board,{rows,flip=false,interactive=false,disabled=false,onClick=null,selected=null,targets=[],last=null,marked=[],markClass='mark',animateMoves=[]}){
 const doc=board.ownerDocument,order=squareOrder(flip),next=positionKeys(rows);
 let state=boards.get(board);
 if(!state||state.flip!==flip||state.interactive!==interactive){
  if(state)stop(state);
  state={flip,interactive,cells:new Map(),positions:null,animations:[],onClick};
  const frag=doc.createDocumentFragment();
  for(const {sq,r,f,ri,fi} of order){
   const cell=doc.createElement(interactive?'button':'div');
   if(interactive){cell.type='button';cell.onclick=()=>state.onClick?.(sq);}
   cell.className='square '+((r+f)%2?'dark':'light');
   cell.dataset.square=sq;
   if(fi===0)cell.append(coord(doc,'coord',String(8-r)));
   if(ri===7)cell.append(coord(doc,'coord file','abcdefgh'[f]));
   state.cells.set(sq,{cell,img:null,piece:''});frag.append(cell);
  }
  board.replaceChildren(frag);boards.set(board,state);
 }
 state.onClick=onClick;
 const changed=!state.positions||[...next].some(([sq,p])=>state.positions.get(sq)!==p);
 const motion=changed&&!reducedMotion()?planMotion(state.positions,next,animateMoves):[];
 if(changed)stop(state);
 const targetSet=new Set(targets),markedSet=new Set(marked);
 for(const {sq,r,f} of order){
  const entry=state.cells.get(sq),{cell}=entry,p=rows[r][f],piece=next.get(sq);
  if(entry.piece!==piece){
   entry.img?.remove();entry.img=p?pieceGraphic(p):null;
   if(entry.img)cell.prepend(entry.img);
   entry.piece=piece;
  }
  const cls='square '+((r+f)%2?'dark':'light')+(last&&(last.from===sq||last.to===sq)?' last':'')+(selected===sq?' selected':'')+(targetSet.has(sq)?' target':'')+(markedSet.has(sq)?' '+markClass:'');
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
 if(motion.length&&board.isConnected){
  const size=board.clientWidth/8;
  if(size>0)for(const m of motion){
   const img=state.cells.get(m.to)?.img;
   if(!img?.animate)continue;
   const a=order.find(x=>x.sq===m.from),b=order.find(x=>x.sq===m.to);
   const x=(a.fi-b.fi)*size,y=(a.ri-b.ri)*size;
   const animation=img.animate([{transform:'translate('+x+'px,'+y+'px)',zIndex:4},{transform:'translate(0,0)',zIndex:4}],{duration:135,easing:'cubic-bezier(.2,.75,.25,1)'});
   state.animations.push(animation);
  }
 }
}
