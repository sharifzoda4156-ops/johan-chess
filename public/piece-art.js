import chessnut from './pieces/chessnut.js';
import cburnett from './pieces/cburnett.js';
import spatial from './pieces/spatial.js';
import celtic from './pieces/celtic.js';
import rhosgfx from './pieces/rhosgfx.js';
export const THEMES=Object.freeze({
 chessnut:{name:'Classic',description:'Классический зелёный',light:'#ebebd0',dark:'#779653',pieces:chessnut,credit:'Alexis Luengas · Apache 2.0'},
 cburnett:{name:'Tournament',description:'Строгий сине-серый',light:'#e6edf3',dark:'#7594aa',pieces:cburnett,credit:'Colin M. L. Burnett · GPLv2+'},
 spatial:{name:'Spatial',description:'Объёмные фигуры, тёплое дерево',light:'#ead8b6',dark:'#a77c56',pieces:spatial,credit:'Maurizio Monge · MIT'},
 celtic:{name:'Celtic',description:'Орнамент, тёмный камень',light:'#e3dfd5',dark:'#777c83',pieces:celtic,credit:'Maurizio Monge · MIT'},
 rhosgfx:{name:'Rhos',description:'Графичный стиль, фиолетовая доска',light:'#eee1f2',dark:'#9880af',pieces:rhosgfx,credit:'RhosGFX · CC0'}
});
export const DEFAULT_THEME='chessnut';
export const normalizeTheme=id=>Object.hasOwn(THEMES,id)?id:DEFAULT_THEME;
const KEY='jc-board-theme-v1';
export function readTheme(storage){try{return normalizeTheme(storage.getItem(KEY));}catch{return DEFAULT_THEME;}}
export function saveTheme(storage,id){try{storage.setItem(KEY,normalizeTheme(id));return true;}catch{return false;}}
let current=DEFAULT_THEME;
const urls=new Map();
export function pieceUrl(theme,key){
 const id=normalizeTheme(theme),asset=THEMES[id].pieces[key];
 if(!asset)return '';
 const cacheKey=id+':'+key;
 if(!urls.has(cacheKey))urls.set(cacheKey,'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(asset.svg));
 return urls.get(cacheKey);
}
export function pieceGraphic(piece,previewTheme=null){
 const img=document.createElement('img'),key=piece.color+piece.type.toUpperCase();
 img.className='piece piece-image';img.alt='';img.draggable=false;img.setAttribute('aria-hidden','true');
 if(!previewTheme)img.dataset.piece=key;
 img.src=pieceUrl(previewTheme||current,key);
 return img;
}
export function applyTheme(id){
 current=normalizeTheme(id);
 const t=THEMES[current],style=document.documentElement.style;
 style.setProperty('--light-square',t.light);style.setProperty('--dark-square',t.dark);
 document.documentElement.dataset.boardTheme=current;
 for(const img of document.querySelectorAll('img[data-piece]'))img.src=pieceUrl(current,img.dataset.piece);
 return current;
}
export function initThemes(){
 const list=document.getElementById('boardThemes'),status=document.getElementById('boardThemeStatus');
 let selected=applyTheme(readTheme(localStorage));
 if(!list)return;
 function select(id,save){
  selected=applyTheme(id);
  for(const b of list.querySelectorAll('button[data-theme]'))b.setAttribute('aria-pressed',String(b.dataset.theme===selected));
  if(save)status.textContent=saveTheme(localStorage,selected)?'Оформление сохранено':'Оформление применено, но сохранить настройку не удалось';
 }
 for(const [id,t] of Object.entries(THEMES)){
  const b=document.createElement('button');b.type='button';b.className='theme-option';b.dataset.theme=id;
  const preview=document.createElement('span');preview.className='theme-preview';preview.style.setProperty('--preview-light',t.light);preview.style.setProperty('--preview-dark',t.dark);
  for(const [i,p] of [{color:'w',type:'n'},{color:'b',type:'q'},{color:'b',type:'p'},{color:'w',type:'k'}].entries()){
   const cell=document.createElement('span');cell.className=(Math.floor(i/2)+i%2)%2?'preview-dark':'preview-light';cell.append(pieceGraphic(p,id));preview.append(cell);
  }
  const info=document.createElement('span');info.className='theme-info';
  const title=document.createElement('strong');title.textContent=t.name;const desc=document.createElement('small');desc.textContent=t.description;const credit=document.createElement('small');credit.className='theme-credit';credit.textContent=t.credit;
  info.append(title,desc,credit);b.append(preview,info);b.onclick=()=>select(id,true);list.append(b);
 }
 select(selected,false);
}
