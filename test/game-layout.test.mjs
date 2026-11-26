import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../public/'+p,import.meta.url),'utf8'),html=read('index.html'),css=read('mobile-ui.css');
test('game workspace isolates stage from move strip, controls and page scrolling',()=>{
 for(const [shell,board,strip] of [['playArea','playBoard','playMoves'],['onlineGame','onlineBoard','onlineMoveStrip'],['reviewBoardShell','board','reviewMoveStrip']]){
  const start=html.indexOf('id="'+shell+'"'),move=html.indexOf('id="'+strip+'"',start),stage=html.indexOf('class="game-stage"',start),position=html.indexOf('id="'+board+'"',start),toolbar=html.indexOf('class="game-toolbar',position);
  assert.ok(start>=0&&start<move&&move<stage&&stage<position&&position<toolbar);
 }
 assert.match(css,/position:fixed;inset:0/);assert.match(css,/100cqh - 96px/);assert.match(css,/overflow-anchor:none/);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(ids.length,new Set(ids).size);
});
test('review mode keeps report accessible and online layout has no engine actions',()=>{
 assert.match(html,/id="reviewOpenBoard"/);assert.match(html,/id="reviewCloseBoard"/);assert.match(html,/id="reviewAnalyze"/);
 const online=html.slice(html.indexOf('id="onlineGame"'),html.indexOf('id="onlineSocial"'));
 assert.doesNotMatch(online,/id="[^"]*(?:Hint|Analyze|Coach|Stockfish)[^"]*"/i);
 assert.match(read('app.js'),/reviewCloseBoard'\)\.onclick=\(\)=>openReviewBoard\(false\)/);
 assert.match(read('training.js'),/list.scrollLeft=list.scrollWidth/);
});