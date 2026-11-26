import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {THEMES} from '../public/piece-art.js';
const css=readFileSync(new URL('../public/mobile-ui.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const token=n=>css.match(new RegExp('--'+n+':(#[0-9a-f]{6})[;}]','i'))?.[1];
function lum(hex){const [r,g,b]=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b;}
function contrast(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('brand palette keeps accessible text and action contrast',()=>{
 for(const [a,b] of [['ink','surface'],['muted','surface'],['accent','surface'],['on-accent','accent'],['success','surface'],['danger','surface']]){
  assert.ok(token(a)&&token(b),a+' / '+b);
  assert.ok(contrast(token(a),token(b))>=4.5,a+' / '+b);
 }
 assert.ok(html.includes('name="theme-color" content="'+token('app-bg')+'"'));
});
test('board colors are independent of the brand',()=>{
 assert.deepEqual(Object.keys(THEMES),['chessnut','cburnett','spatial','celtic','rhosgfx']);
 assert.equal(THEMES.chessnut.dark,'#779653');
 assert.notEqual(THEMES.chessnut.dark,token('accent'));
});
