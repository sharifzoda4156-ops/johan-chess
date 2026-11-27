import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.WEB_URL||'http://127.0.0.1:4174/johan-chess/';
const browser=await chromium.launch({headless:true});
async function boardBox(page,selector){
 const b=await page.locator(selector).boundingBox();assert.ok(b,'Board visible: '+selector);
 const v=page.viewportSize();
 assert.ok(b.width>120&&Math.abs(b.width-b.height)<2,'Board is square');
 assert.ok(b.x>=-1&&b.y>=-1&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1,'Board stays within viewport');
 return b;
}
function stable(a,b){for(const k of ['x','y','width','height'])assert.ok(Math.abs(a[k]-b[k])<=1,'Board moved: '+k+' '+a[k]+' → '+b[k]);}
const pgn='[White "Test"]\n[Black "Opponent"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0';
try{
 for(const viewport of [{width:390,height:844},{width:1280,height:800},{width:844,height:390}]){
  const page=await browser.newPage({viewport});
  const errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().startsWith(url)&&r.status()>=400)failed.push(r.status()+' '+r.url());});
  // Keep smoke tests independent of upstream availability.
  await page.route('https://raw.githubusercontent.com/**',r=>r.abort());
  await page.route('https://github.com/**',r=>r.abort());
  let lichessCalls=0;
  await page.route('https://lichess.org/game/export/**',async route=>{
   assert.equal(route.request().url(),'https://lichess.org/game/export/Ab12Cd34');
   lichessCalls++;
   await route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/x-chess-pgn'},body:lichessCalls===1?'[Result "*"]\n\n1. e4 *':pgn});
  });
  await page.goto(url,{waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelector('#homePlayed').textContent!=='—');
  assert.equal(await page.locator('html').getAttribute('data-hosting'),'pages');
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('img.brand-logo,img.hero-knight')].every(img=>img.complete&&img.naturalWidth>0)),'Brand & knight SVGs loaded');

  // Home Dashboard geometry check: 50/50 Hero CTAs + 2x2 Bento Grid
  const homeGeom=await page.evaluate(()=>{
   const btns=[...document.querySelectorAll('.home-hero-actions button')].map(e=>e.getBoundingClientRect());
   const cards=[...document.querySelectorAll('.home-bento .bento-card')].map(e=>e.getBoundingClientRect());
   const stats=document.querySelector('.home-stats').getBoundingClientRect();
   const nav=document.querySelector('.bottom-nav').getBoundingClientRect();
   return {btns,cards,statsBottom:stats.bottom,navTop:nav.top};
  });
  assert.equal(homeGeom.btns.length,2);
  assert.ok(Math.abs(homeGeom.btns[0].y-homeGeom.btns[1].y)<=1,'Hero CTAs aligned on one row');
  assert.ok(Math.abs(homeGeom.btns[0].width-homeGeom.btns[1].width)<=2,'Hero CTAs equal 50/50 width');
  assert.equal(homeGeom.cards.length,4);
  assert.ok(Math.abs(homeGeom.cards[0].y-homeGeom.cards[1].y)<=1&&Math.abs(homeGeom.cards[2].y-homeGeom.cards[3].y)<=1,'Bento cards form 2x2 grid');
  if(viewport.height>=800)assert.ok(homeGeom.statsBottom<=homeGeom.navTop+2,'Home dashboard fits above bottom nav');

  // Online Lichess screen must be enabled on Web (not Android-only stub)
  await page.locator('[data-go="online"]').first().click();
  assert.equal(await page.locator('#onlineLogin').isDisabled(),false,'Web Lichess login button must be enabled');
  assert.equal((await page.locator('#onlineStatus').textContent()).includes('Android-сборка'),false,'Web Online must not show Android-only stub');
  await page.locator('[data-tab="profile"]').click();
  await page.locator('#profileAwards .profile-award').first().waitFor();
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('#profileAwards img')].every(img=>img.complete&&img.naturalWidth>0)),'Award SVGs loaded');
  assert.equal(await page.locator('#soundEnabled').isChecked(),true,'Sound enabled by default');

  // Puzzles: Classic focus board fits viewport cleanly across mobile, desktop, and landscape
  await page.locator('[data-tab="puzzles"]').click();
  await page.locator('#modeClassic').click();
  await page.locator('#classicStart').click();
  await page.locator('#puzzleBoard [data-square]').first().waitFor({timeout:30000});
  assert.equal(await page.locator('#puzzleBoard [data-square]').count(),64);
  await boardBox(page,'#puzzleBoard');
  await page.locator('#journeyBack').click();

  // Web Study tab routes directly to Library
  await page.locator('[data-tab="coach"]').click();
  await page.waitForFunction(()=>Number(document.querySelector('#studyOpeningCount').textContent)>0);
  assert.equal(await page.locator('#studyBoard [data-square]').count(),64);
  await page.locator('#studyNext').click();
  assert.equal(await page.locator('#studyOpeningAsk').isVisible(),false);

  // Review: unified Lichess URL & PGN import, keyboard nav, check highlight & material
  await page.locator('[data-tab="home"]').click();
  await page.locator('[data-go="review"]').first().click();
  await page.locator('#pgn').fill('https://lichess.org/Ab12Cd34abcd');
  await page.locator('#load').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Нет завершённых'));
  await page.locator('#pgn').fill('https://lichess.org/Ab12Cd34');
  await page.locator('#load').click();
  await page.locator('#board [data-square="e2"]').waitFor();
  assert.equal(lichessCalls,2);
  if(viewport.width<900)await page.locator('#reviewCloseBoard').click();
  else{assert.ok(await page.locator('#review .report').isVisible(),'Desktop review shows report side by side');await page.evaluate(()=>{const d=document.getElementById('importSource');if(d)d.open=true;});}
  await page.locator('#pgn').fill(pgn);
  await page.locator('#load').click();
  await page.locator('#board [data-square="e2"]').waitFor();
  assert.equal(await page.locator('#board [data-square]').count(),64);
  const reviewBox=await boardBox(page,'#board');
  await page.keyboard.press('End');
  await page.waitForFunction(()=>document.querySelector('#board [data-square="e8"]')?.classList.contains('in-check'));
  assert.ok((await page.locator('#reviewBottomMat').textContent()).includes('+1'),'Material strip shows +1 pawn');
  await page.keyboard.press('Home');
  await page.locator('#next').click();
  stable(reviewBox,await boardBox(page,'#board'));
  await page.locator('#flip').click();
  stable(reviewBox,await boardBox(page,'#board'));
  if(viewport.width<900)await page.locator('#reviewCloseBoard').click();

  // Play Hub ("Новая партия") & Bot Setup ("Игра с ботом"): equal 100% widths + Drag & Drop
  await page.locator('[data-tab="home"]').click();
  await page.locator('[data-go="play"]').first().click();
  const hubWidths=await page.evaluate(()=>[
   document.getElementById('playTimeRow').getBoundingClientRect().width,
   document.getElementById('playStart').getBoundingClientRect().width,
   ...[...document.querySelectorAll('#playHub .play-mode-btn')].map(b=>b.getBoundingClientRect().width)
  ]);
  for(const w of hubWidths)assert.ok(Math.abs(w-hubWidths[1])<=1,'Hub controls share exact 100% width: '+JSON.stringify(hubWidths));
  await page.locator('#playBotOpen').click();
  assert.equal(await page.locator('#playTopbarTitle').textContent(),'Игра с ботом');
  await page.locator('#playBotGrid [data-level="0"]').click();
  await page.locator('#playBotTime').selectOption('free');
  await page.locator('#playBack').click();
  assert.equal(await page.locator('#playTopbarTitle').textContent(),'Новая партия');
  assert.equal(await page.locator('#playTimeLabel').textContent(),'Без часов');
  await page.locator('#playStart').click();
  await page.locator('#playBoard [data-square="e2"]').waitFor();
  assert.equal(await page.locator('#playBoard [data-square]').count(),64);
  await page.waitForFunction(()=>document.querySelector('#playStatus').textContent.startsWith('Твой ход'),{},{timeout:30000});
  const playBox=await boardBox(page,'#playBoard');
  const e2=await page.locator('#playBoard [data-square="e2"]').boundingBox();
  const e4=await page.locator('#playBoard [data-square="e4"]').boundingBox();
  await page.mouse.move(e2.x+e2.width/2,e2.y+e2.height/2);
  await page.mouse.down();
  await page.mouse.move(e4.x+e4.width/2,e4.y+e4.height/2,{steps:6});
  await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('#playBoard [data-square="e4"]')?.getAttribute('aria-label')==='e4 wp');
  await page.waitForFunction(()=>document.querySelector('#playMoves').children.length>=2 && document.querySelector('#playStatus').textContent.startsWith('Твой ход'),{},{timeout:30000});
  stable(playBox,await boardBox(page,'#playBoard'));
  // Browse previous move and return to live
  await page.locator('#playPrevMove').click();
  await page.locator('#playLivePill').waitFor({state:'visible'});
  await page.locator('#playNextMove').click();
  await page.locator('#playLivePill').waitFor({state:'hidden'});
  // 2-step Stockfish hint: 1st tap highlights piece, 2nd tap draws arrow
  await page.locator('#playHint').click();
  await page.waitForFunction(()=>document.querySelectorAll('#playBoard .square.hint-piece').length===1,{},{timeout:20000});
  await page.locator('#playHint').click();
  await page.waitForFunction(()=>document.querySelectorAll('#playBoard .board-arrows-layer polygon').length===1);
  // Undo last move pair returns cleanly to start position
  await page.locator('#playUndo').click();
  await page.waitForFunction(()=>document.querySelector('#playMoves').children.length===0 && document.querySelector('#playBoard [data-square="e2"]')?.getAttribute('aria-label')==='e2 wp');
  await page.locator('#playOptionsBtn').click();
  await page.locator('#playCancel').click();
  await page.locator('[data-dialog="confirm"] [data-dialog-action="confirm"]').click();
  await page.locator('[data-tab="home"]').click();
  assert.deepEqual(errors,[]);
  assert.deepEqual(failed,[]);
  await page.close();
  console.log('Browser smoke passed:',viewport.width,viewport.height);
 }
}finally{await browser.close();}
