import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
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
 const base=await mkdtemp(join(tmpdir(),'jc-pages-test-'));
 const fakeRoot=join(base,'repo'),fakePub=join(fakeRoot,'public'),fakeOut=join(base,'dist');
 try{
  await mkdir(join(fakePub,'engine'),{recursive:true});
  await writeFile(join(fakeRoot,'README.md'),'# Johan Chess\n');
  await writeFile(join(fakePub,'index.html'),'<!doctype html><html lang="ru"><head><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="mobile-ui.css"><link rel="icon" href="favicon.svg"></head><body><img src="logo.svg"><img src="knight-mark.svg"><script type="module" src="app.js"></script></body></html>');
  await writeFile(join(fakePub,'style.css'),'body{color:#fff}');
  await writeFile(join(fakePub,'mobile-ui.css'),':root{--ink:#fff}');
  await writeFile(join(fakePub,'logo.svg'),'<svg/>');
  await writeFile(join(fakePub,'knight-mark.svg'),'<svg/>');
  await writeFile(join(fakePub,'favicon.svg'),'<svg/>');
  await writeFile(join(fakePub,'chess.js'),'export class Chess{}');
  await writeFile(join(fakePub,'training.js'),'export function initTraining(){}');
  await writeFile(join(fakePub,'engine-path.js'),"export const enginePath = './engine/stockfish-18-lite-single.js';\n");
  await writeFile(join(fakePub,'app.js'),"import {initTraining} from './training.js';\nimport {enginePath} from './engine-path.js';\nconsole.log(initTraining,enginePath);\n");
  await writeFile(join(fakePub,'engine','stockfish-18-lite-single.js'),'// worker');

  const {version}=await buildPages({root:pathToFileURL(fakeRoot+'/'),out:pathToFileURL(fakeOut+'/')});
  assert.match(version,/^[0-9a-f]{8}$/);
  const html=await readFile(join(fakeOut,'index.html'),'utf8');
  assert.ok(html.includes(`href="style.css?v=${version}"`));
  assert.ok(html.includes(`href="mobile-ui.css?v=${version}"`));
  assert.ok(html.includes(`src="app.js?v=${version}"`));
  assert.ok(html.includes(`src="knight-mark.svg?v=${version}"`));
  const appJs=await readFile(join(fakeOut,'app.js'),'utf8');
  assert.ok(appJs.includes(`from './training.js?v=${version}'`));
  assert.ok(appJs.includes(`from './engine-path.js?v=${version}'`));
  const enginePathJs=await readFile(join(fakeOut,'engine-path.js'),'utf8');
  assert.ok(enginePathJs.includes('./engine/stockfish-18-lite-single.js'));
  assert.ok(!enginePathJs.includes('?v='));
 }finally{
  await rm(base,{recursive:true,force:true});
 }
});
