import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {THEMES,DEFAULT_THEME,normalizeTheme,readTheme,saveTheme,pieceUrl} from '../public/piece-art.js';
test('five complete original SVG sets match upstream Git blob hashes',()=>{
 assert.equal(Object.keys(THEMES).length,5);
 for(const [id,t] of Object.entries(THEMES)){
  assert.equal(Object.keys(t.pieces).length,12);
  for(const c of ['w','b'])for(const p of ['K','Q','R','B','N','P']){
   const a=t.pieces[c+p],b=Buffer.from(a.svg);
   assert.match(a.svg,/<svg\b/,id+c+p);
   assert.doesNotMatch(a.svg,/<script\b|<foreignObject\b|\bonload\s*=/i);
   assert.equal(createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex'),a.sha,id+c+p);
   assert.equal(decodeURIComponent(pieceUrl(id,c+p).split(',').slice(1).join(',')),a.svg);
  }
 }
});
test('theme preference survives restart; invalid values default safely',()=>{
 let value=null;const storage={getItem:()=>value,setItem:(k,v)=>{value=v;}};
 assert.equal(readTheme(storage),DEFAULT_THEME);
 assert.equal(saveTheme(storage,'celtic'),true);assert.equal(readTheme(storage),'celtic');
 assert.equal(normalizeTheme('__proto__'),DEFAULT_THEME);assert.equal(normalizeTheme('bad'),DEFAULT_THEME);
 assert.equal(saveTheme({setItem(){throw Error('quota');}},'spatial'),false);
});
