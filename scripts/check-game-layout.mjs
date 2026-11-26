import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
const read=p=>readFileSync(new URL('../public/'+p,import.meta.url),'utf8');
const html=read('index.html').replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
const css=read('style.css')+'\n'+read('mobile-ui.css');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try{
 for(const viewport of [{width:393,height:800},{width:360,height:640},{width:320,height:568},{width:800,height:400}]){
  const page=await browser.newPage({viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  for(const mode of ['play','online','review']){
   await page.setContent(html);await page.addStyleTag({content:css});
   await page.evaluate(mode=>{
    const $=id=>document.getElementById(id);
    for(const el of document.querySelectorAll('[data-screen]'))el.hidden=el.dataset.screen!==mode;
    document.body.className=mode==='play'?'is-playing':mode==='online'?'is-online-playing online-board-focus':'review-board-focus';
    const id=mode==='play'?'playBoard':mode==='online'?'onlineBoard':'board';
    $(mode==='play'?'playArea':mode==='online'?'onlineGame':'review').hidden=false;
    if(mode==='online'){$('onlineLogin').hidden=true;$('onlineAccount').hidden=true;}
    const board=$(id);for(let i=0;i<64;i++){const c=document.createElement('div');c.className='square '+((i+Math.floor(i/8))%2?'dark':'light');board.append(c);}
   },mode);
   const box=()=>page.evaluate(mode=>{
    const $=id=>document.getElementById(id),board=$(mode==='play'?'playBoard':mode==='online'?'onlineBoard':'board'),shell=$(mode==='play'?'playArea':mode==='online'?'onlineGame':'reviewBoardShell');
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
    return {board:rect(board),shell:rect(shell),toolbar:rect(shell.querySelector('.game-toolbar')),top:rect(shell.querySelector('.game-player-top')),bottom:rect(shell.querySelector('.game-player-bottom')),scroll:window.scrollY,width:innerWidth,height:innerHeight,nav:getComputedStyle(document.querySelector('.bottom-nav')).display};
   },mode);
   const initial=await box();
   assert.ok(initial.board.w>100,JSON.stringify({viewport,mode,initial}));
   assert.ok(Math.abs(initial.board.w-initial.board.h)<=1,JSON.stringify({viewport,mode,initial}));
   assert.ok(initial.board.x>=-.5&&initial.board.y>=-.5&&initial.board.x+initial.board.w<=initial.width+.5&&initial.board.y+initial.board.h<=initial.height+.5,JSON.stringify({viewport,mode,initial}));
   assert.ok(initial.toolbar.y+initial.toolbar.h<=initial.height+.5);
   assert.equal(initial.nav,'none');
   if(viewport.height>=800&&viewport.width<500)assert.ok(initial.board.w>=viewport.width-1,JSON.stringify({viewport,mode,initial}));
   await page.evaluate(mode=>{
    const $=id=>document.getElementById(id),strip=$(mode==='play'?'playMoves':mode==='online'?'onlineMoveStrip':'reviewMoveStrip');
    strip.textContent='1. e4 e5 2. Nf3 Nc6 '.repeat(150);strip.scrollLeft=strip.scrollWidth;
    if(mode==='play'){$('playTopName').textContent='A long opponent name '.repeat(10);$('playGameStatus').textContent='Stockfish думает '.repeat(20);$('playPromotion').hidden=false;}
    if(mode==='online'){$('onlineTop').textContent='A long opponent name '.repeat(10);$('onlineTurn').textContent='Соперник отключился '.repeat(20);$('onlineGameNotice').hidden=false;$('onlineGameNoticeText').textContent='Проверка связи';$('onlineOpponentGone').hidden=false;$('onlineClaimActions').hidden=false;}
    if(mode==='review'){$('top').textContent='A long opponent name '.repeat(10);$('coach').textContent='Длинный разбор '.repeat(200);$('reviewBoardStatus').textContent='Анализ '.repeat(20);}
    window.scrollTo(0,10000);
   },mode);
   const after=await box();
   assert.deepEqual(after.board,initial.board,JSON.stringify({viewport,mode,initial,after}));
   assert.deepEqual(after.toolbar,initial.toolbar);
   assert.equal(after.scroll,0);
   console.log('Fixed board:',mode,viewport.width+'x'+viewport.height,initial.board);
  }
  await page.close();
 }
}finally{await browser.close();}
