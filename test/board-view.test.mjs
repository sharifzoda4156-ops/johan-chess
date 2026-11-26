import test from 'node:test';
import assert from 'node:assert/strict';
import {squareOrder,positionKeys,planMotion,renderBoardView,clearBoardView} from '../public/board-view.js';
const empty=()=>Array.from({length:8},()=>Array(8).fill(null));
const rows=pieces=>{const b=empty();for(const [sq,p] of Object.entries(pieces))b[8-Number(sq[1])]['abcdefgh'.indexOf(sq[0])]={color:p[0],type:p[1].toLowerCase()};return b;};
const pos=pieces=>positionKeys(rows(pieces));
test('board orientation and unique squares',()=>{
 for(const flip of [false,true]){
  const order=squareOrder(flip);assert.equal(new Set(order.map(x=>x.sq)).size,64);
  assert.equal(order[0].sq,flip?'h1':'a8');assert.equal(order.at(-1).sq,flip?'a8':'h1');
 }
});
test('motion recognizes exact moves, captures, promotions and ignores jumps',()=>{
 assert.deepEqual(planMotion(pos({e2:'wP'}),pos({e4:'wP'}),[{from:'e2',to:'e4'}]),[{from:'e2',to:'e4',piece:'wP'}]);
 assert.equal(planMotion(pos({e2:'wP',a8:'bR'}),pos({e4:'wP'}),[{from:'e2',to:'e4'}]).length,0);
 assert.equal(planMotion(pos({e4:'wP',d5:'bP'}),pos({d5:'wP'}),[{from:'e4',to:'d5'}]).length,1);
 assert.equal(planMotion(pos({a7:'wP'}),pos({a8:'wN'}),[{from:'a7',to:'a8',promotion:'n'}])[0].piece,'wN');
 assert.equal(planMotion(pos({e5:'wP',d5:'bP'}),pos({d6:'wP'}),[{from:'e5',to:'d6'}]).length,1);
 assert.equal(planMotion(pos({e1:'wK',h1:'wR'}),pos({g1:'wK',f1:'wR'}),[{from:'e1',to:'g1'}]).length,2);
 assert.deepEqual(planMotion(pos({e2:'wP',d5:'bP'}),pos({e4:'bP'}),[{from:'e2',to:'e4'},{from:'d5',to:'e4'}]),[{from:'d5',to:'e4',piece:'bP'}]);
 assert.equal(planMotion(pos({e2:'wP',d7:'bP'}),pos({d4:'bP'}),[{from:'e2',to:'d4'},{from:'d7',to:'d4'}]).length,0);
});
class El{
 constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.dataset={};this.attrs={};this.disabled=false;this.className='';this.isConnected=false;}
 append(...els){for(const el of els){if(el.tag==='fragment'){this.append(...el.children);continue;}this.children.push(el);el.parent=this;}}
 prepend(el){this.children.unshift(el);el.parent=this;}
 remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}
 replaceChildren(...els){this.children=[];this.append(...els);}
 setAttribute(k,v){this.attrs[k]=String(v);}
 getAttribute(k){return this.attrs[k]??null;}
}
test('selection retains cells and piece nodes; moves only update changed squares',()=>{
 const doc={createElement(tag){return new El(tag,doc);},createDocumentFragment(){return new El('fragment',doc);}};
 const old=globalThis.document;globalThis.document=doc;
 try{
  const board=doc.createElement('div');let clicked;
  const r=rows({e2:'wP',a8:'bR'}),base={interactive:true,onClick:s=>clicked=s};
  renderBoardView(board,{...base,rows:r});
  const cells=board.children.slice(),e2=cells.find(c=>c.dataset.square==='e2'),a8=cells.find(c=>c.dataset.square==='a8'),img=e2.children.find(c=>c.tag==='img'),rook=a8.children.find(c=>c.tag==='img');
  renderBoardView(board,{...base,rows:r,selected:'e2',targets:['e4']});
  assert.deepEqual(board.children,cells);assert.equal(e2.children.find(c=>c.tag==='img'),img);
  assert.match(e2.className,/selected/);e2.onclick();assert.equal(clicked,'e2');
  renderBoardView(board,{...base,rows:rows({e4:'wP',a8:'bR'}),disabled:true});
  assert.deepEqual(board.children,cells);assert.equal(a8.children.find(c=>c.tag==='img'),rook);
  assert.equal(e2.children.some(c=>c.tag==='img'),false);assert.ok(cells.every(c=>c.disabled));
  renderBoardView(board,{...base,rows:r,flip:true});assert.equal(board.children[0].dataset.square,'h1');
  clearBoardView(board);assert.equal(board.children.length,0);
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});

import {MOVE_SPEEDS,normalizeMotion,moveDuration,replyDelay,roundMotionFactor,motionProgress,motionFrames} from '../public/board-view.js';
test('classic medium animation is consistent, configurable and respects accessibility',()=>{
 assert.equal(normalizeMotion('unknown'),'medium');assert.equal(normalizeMotion('none'),'none');assert.equal(moveDuration(),250);assert.deepEqual(MOVE_SPEEDS,{slow:500,medium:250,fast:120,none:0});assert.equal(replyDelay(),375);
 const previous=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:true});try{assert.equal(moveDuration(),0);assert.equal(replyDelay(),0);}finally{if(previous===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=previous;}
});

test('capture and castle animation overlay is removed on completion or interrupted move',async()=>{
 const doc={createElement(tag){const el=new El(tag,doc);el.style={};el.classList={add(c){el.className+=' '+c;}};el.animate=(frames,options)=>{let resolve,reject;const finished=new Promise((a,b)=>{resolve=a;reject=b;});const anim={frames,options,finished,resolve,cancel(){reject(Error('cancelled'));}};animations.push(anim);return anim;};return el;},createDocumentFragment(){return new El('fragment',doc);}};
 const old=globalThis.document,animations=[];globalThis.document=doc;
 try{
  const board=doc.createElement('div');board.isConnected=true;board.clientWidth=400;
  renderBoardView(board,{rows:rows({e4:'wP',d5:'bP'})});
  renderBoardView(board,{rows:rows({d5:'wP'}),animateMoves:[{from:'e4',to:'d5'}]});
  const layer=board.children.at(-1);assert.equal(layer.className,'board-motion-layer');assert.equal(layer.children.length,2);
  const img=board.children.find(c=>c.dataset.square==='d5').children.find(c=>c.tag==='img');
  assert.equal(img.style.visibility,'hidden');assert.equal(animations[0].options.duration,250);
  animations[0].resolve();await Promise.resolve();await Promise.resolve();assert.equal(board.children.length,64);assert.equal(img.style.visibility,'');
  renderBoardView(board,{rows:rows({e1:'wK',h1:'wR'})});
  renderBoardView(board,{rows:rows({g1:'wK',f1:'wR'}),animateMoves:[{from:'e1',to:'g1'}]});
  assert.equal(board.children.at(-1).children.length,2);assert.equal(animations[1].options.duration,animations[2].options.duration);
  clearBoardView(board);assert.equal(board.children.length,0);await Promise.resolve();
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});

test('Lichess cubic interpolation, speed threshold and clock scaling',()=>{
 assert.equal(motionProgress(0),0);assert.equal(motionProgress(.25),.0625);assert.equal(motionProgress(.5),.5);assert.equal(motionProgress(.75),.9375);assert.equal(motionProgress(1),1);
 const frames=motionFrames(200,-100);assert.equal(frames.length,121);assert.deepEqual(frames[30],{offset:.25,transform:'translate(12.5%,-6.25%)'});assert.equal(frames.at(-1).transform,'translate(200%,-100%)');
 assert.equal(roundMotionFactor(600000,0),1.2);assert.equal(roundMotionFactor(180000,0),.4);assert.equal(roundMotionFactor(60000,0),0);assert.equal(roundMotionFactor(180000,2000,true),1);assert.equal(moveDuration(.2),0);assert.equal(moveDuration(1.2),300);
});
