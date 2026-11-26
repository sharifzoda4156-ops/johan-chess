import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {THEMES,BOARD_THEMES,DEFAULT_THEME,DEFAULT_BOARD,normalizeTheme,normalizeBoardTheme,readTheme,saveTheme,readBoardTheme,saveBoardTheme,pieceUrl} from '../public/piece-art.js';
test('five complete original SVG piece sets match upstream Git blob hashes',()=>{
 assert.equal(Object.keys(THEMES).length,5);
 assert.equal(DEFAULT_THEME,'maestro');
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
test('piece set and board palette preferences persist independently and default safely',()=>{
 const map=new Map();const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v);}};
 assert.equal(readTheme(storage),DEFAULT_THEME);
 assert.equal(readBoardTheme(storage),DEFAULT_BOARD);
 assert.equal(saveTheme(storage,'merida'),true);assert.equal(readTheme(storage),'merida');
 assert.equal(saveBoardTheme(storage,'walnut'),true);assert.equal(readBoardTheme(storage),'walnut');
 assert.equal(normalizeTheme('__proto__'),DEFAULT_THEME);assert.equal(normalizeTheme('bad'),DEFAULT_THEME);
 assert.equal(normalizeBoardTheme('__proto__'),DEFAULT_BOARD);assert.equal(normalizeBoardTheme('bad'),DEFAULT_BOARD);
 assert.equal(Object.keys(BOARD_THEMES).length,4);
 assert.equal(saveTheme({setItem(){throw Error('quota');}},'spatial'),false);
 assert.equal(saveBoardTheme({setItem(){throw Error('quota');}},'obsidian'),false);
});
