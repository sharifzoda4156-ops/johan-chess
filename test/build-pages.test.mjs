import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildPages,stampHtml,stampJsImports} from '../scripts/build-pages.mjs';

test('stampHtml adds data-hosting and ?v=hash to local CSS, JS, and SVG assets',()=>{
 const sample='<html lang="ru"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="mobile-ui.css"><img src="logo.svg"><img src="knight-mark.svg"><link href="favicon.svg"><script type="module" src="app.js"></script>';
 const out=stampHtml(sample,'a1b2c3d4');
 assert.match(out,/data-hosting="pages"/);
 for(const asset of ['style.css','mobile-ui.css','app.js','logo.svg','knight-mark.svg','favicon.svg']){
  assert.ok(out.includes(`${asset}?v=a1b2c3d4`),`Expected stamped ${asset}`);
 }
});

test('stampJsImports stamps root module imports while preserving ./engine/* worker paths',()=>{
 const src=`import {Engine} from './engine.js';\nimport {enginePath} from './engine-path.js';\nconst p='./engine/stockfish-18-lite-single.js';\n`;
 const out=stampJsImports(src,'deadbeef');
 assert.ok(out.includes("from './engine.js?v=deadbeef'"));
 assert.ok(out.includes("from './engine-path.js?v=deadbeef'"));
 assert.ok(out.includes("'./engine/stockfish-18-lite-single.js'"));
 assert.ok(!out.includes('stockfish-18-lite-single.js?v='));
});

test('buildPages produces cache-busted dist with intact engine-path.js',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jc-pages-test-'));
 try{
  const {version}=await buildPages({out:pathToFileURL(dir+'/')});
  assert.match(version,/^[0-9a-f]{8}$/);
  const html=await readFile(join(dir,'index.html'),'utf8');
  assert.ok(html.includes(`href="style.css?v=${version}"`));
  assert.ok(html.includes(`href="mobile-ui.css?v=${version}"`));
  assert.ok(html.includes(`src="app.js?v=${version}"`));
  assert.ok(html.includes(`src="knight-mark.svg?v=${version}"`));
  const appJs=await readFile(join(dir,'app.js'),'utf8');
  assert.ok(appJs.includes(`from './training.js?v=${version}'`));
  const enginePathJs=await readFile(join(dir,'engine-path.js'),'utf8');
  assert.ok(enginePathJs.includes('./engine/stockfish-18-lite-single.js'));
  assert.ok(!enginePathJs.includes('?v='));
 }finally{
  await rm(dir,{recursive:true,force:true});
 }
});
