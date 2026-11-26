import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.WEB_URL||'http://127.0.0.1:4174/johan-chess/';
const browser=await chromium.launch({headless:true});
try{
 for(const viewport of [{width:390,height:844},{width:1280,height:800}]){
  const page=await browser.newPage({viewport});
  const errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().startsWith(url)&&r.status()>=400)failed.push(r.status()+' '+r.url());});
  // Keep smoke tests independent of upstream availability.
  await page.route('https://raw.githubusercontent.com/**',r=>r.abort());
  await page.route('https://github.com/**',r=>r.abort());
  await page.goto(url,{waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelector('#homePlayed').textContent!=='—');
  assert.equal(await page.locator('html').getAttribute('data-hosting'),'pages');
  await page.locator('[data-tab="profile"]').click();
  await page.locator('#profileAwards .profile-award').first().waitFor();
  await page.locator('[data-tab="coach"]').click();
  await page.locator('#coachUnavailable').waitFor();
  await page.locator('[data-go="library"]').click();
  await page.waitForFunction(()=>Number(document.querySelector('#studyOpeningCount').textContent)>0);
  assert.equal(await page.locator('#studyBoard [data-square]').count(),64);
  await page.locator('#studyNext').click();
  await page.locator('[data-tab="home"]').click();
  await page.locator('[data-go="review"]').click();
  await page.locator('#manual summary').click();
  await page.locator('#pgn').fill('[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0');
  await page.locator('#load').click();
  await page.locator('#board [data-square="e2"]').waitFor();
  assert.equal(await page.locator('#board [data-square]').count(),64);
  await page.locator('#next').click();
  await page.locator('#flip').click();
  await page.locator('[data-tab="home"]').click();
  await page.locator('[data-go="play"]').click();
  await page.locator('#playTime').selectOption('free');
  await page.locator('#playLevel').selectOption('0');
  await page.locator('#playStart').click();
  await page.locator('#playBoard [data-square="e2"]').waitFor();
  assert.equal(await page.locator('#playBoard [data-square]').count(),64);
  await page.locator('#playBoard [data-square="e2"]').click();
  await page.locator('#playBoard [data-square="e4"]').click();
  await page.waitForFunction(()=>document.querySelector('#playBoard [data-square="e4"]')?.getAttribute('aria-label')==='e4 wp');
  assert.deepEqual(errors,[]);
  assert.deepEqual(failed,[]);
  await page.close();
  console.log('Browser smoke passed:',viewport.width,viewport.height);
 }
}finally{await browser.close();}
