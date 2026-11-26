import maestro from './pieces/maestro.js';
import staunty from './pieces/staunty.js';
import merida from './pieces/merida.js';
import cburnett from './pieces/cburnett.js';
import spatial from './pieces/spatial.js';

export const BOARD_THEMES=Object.freeze({
 emerald:{name:'Emerald Club',description:'Турнирный изумруд и слоновая кость',light:'#eeeed2',dark:'#4e7e5b',coordLight:'#3a6145',coordDark:'#f2f4e2',texture:''},
 walnut:{name:'Walnut Wood',description:'Тёплый орех и светлый клён',light:'#e8d2b0',dark:'#8b5a36',coordLight:'#6b4022',coordDark:'#f4e6cf',texture:'wood'},
 ice:{name:'Ice Tournament',description:'Контрастный стальной синий и фарфор',light:'#e6eef5',dark:'#577a99',coordLight:'#3d5c78',coordDark:'#f1f6fb',texture:''},
 obsidian:{name:'Obsidian Gold',description:'Матовый антрацит и тёплый камень',light:'#d7d3c8',dark:'#3c4452',coordLight:'#282e39',coordDark:'#ebe8df',texture:''}
});

export const PIECE_SETS=Object.freeze({
 maestro:{name:'Maestro',description:'Объёмные фигуры с мягкой светотенью',light:'#eeeed2',dark:'#4e7e5b',pieces:maestro,credit:'sadsnake1 · CC BY-NC-SA 4.0'},
 staunty:{name:'Staunty',description:'Скульптурный Стаунтон',light:'#e8d2b0',dark:'#8b5a36',pieces:staunty,credit:'sadsnake1 · CC BY-NC-SA 4.0'},
 merida:{name:'Merida',description:'Классический гроссмейстерский стиль',light:'#e6eef5',dark:'#577a99',pieces:merida,credit:'Armando Hernandez Marroquin · GPLv2+'},
 cburnett:{name:'Tournament',description:'Строгая турнирная графика',light:'#e6eef5',dark:'#577a99',pieces:cburnett,credit:'Colin M. L. Burnett · GPLv2+'},
 spatial:{name:'Spatial',description:'Выразительный объёмный силуэт',light:'#d7d3c8',dark:'#3c4452',pieces:spatial,credit:'Maurizio Monge · MIT'}
});

export const THEMES=PIECE_SETS;
export const DEFAULT_BOARD='emerald';
export const DEFAULT_THEME='maestro';

export const normalizeBoardTheme=id=>Object.hasOwn(BOARD_THEMES,id)?id:DEFAULT_BOARD;
export const normalizeTheme=id=>Object.hasOwn(PIECE_SETS,id)?id:DEFAULT_THEME;

const BOARD_KEY='jc-board-palette-v1';
const PIECE_KEY='jc-piece-set-v1';
const LEGACY_KEY='jc-board-theme-v1';

export function readBoardTheme(storage){
 try{return normalizeBoardTheme(storage.getItem(BOARD_KEY));}catch{return DEFAULT_BOARD;}
}
export function saveBoardTheme(storage,id){
 try{storage.setItem(BOARD_KEY,normalizeBoardTheme(id));return true;}catch{return false;}
}
export function readTheme(storage){
 try{
  const saved=storage.getItem(PIECE_KEY);
  if(saved)return normalizeTheme(saved);
  const legacy=storage.getItem(LEGACY_KEY);
  if(legacy&&Object.hasOwn(PIECE_SETS,legacy))return legacy;
  return DEFAULT_THEME;
 }catch{return DEFAULT_THEME;}
}
export function saveTheme(storage,id){
 try{storage.setItem(PIECE_KEY,normalizeTheme(id));return true;}catch{return false;}
}

let currentBoard=DEFAULT_BOARD;
let currentPiece=DEFAULT_THEME;
const urls=new Map();

export function pieceUrl(theme,key){
 const id=normalizeTheme(theme),asset=PIECE_SETS[id].pieces[key];
 if(!asset)return '';
 const cacheKey=id+':'+key;
 if(!urls.has(cacheKey))urls.set(cacheKey,'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(asset.svg));
 return urls.get(cacheKey);
}

export function pieceGraphic(piece,previewTheme=null){
 const img=document.createElement('img'),key=piece.color+piece.type.toUpperCase();
 img.className='piece piece-image';img.alt='';img.draggable=false;img.setAttribute('aria-hidden','true');
 if(!previewTheme)img.dataset.piece=key;
 img.src=pieceUrl(previewTheme||currentPiece,key);
 return img;
}

export function applyBoardTheme(id){
 currentBoard=normalizeBoardTheme(id);
 const b=BOARD_THEMES[currentBoard],style=document.documentElement.style;
 style.setProperty('--light-square',b.light);
 style.setProperty('--dark-square',b.dark);
 style.setProperty('--coord-light',b.coordLight);
 style.setProperty('--coord-dark',b.coordDark);
 document.documentElement.dataset.boardPalette=currentBoard;
 document.documentElement.dataset.boardTexture=b.texture;
 return currentBoard;
}

export function applyTheme(id){
 currentPiece=normalizeTheme(id);
 document.documentElement.dataset.boardTheme=currentPiece;
 for(const img of document.querySelectorAll('img[data-piece]'))img.src=pieceUrl(currentPiece,img.dataset.piece);
 return currentPiece;
}

export function initThemes(){
 const paletteList=document.getElementById('boardPalettes');
 const list=document.getElementById('boardThemes');
 const status=document.getElementById('boardThemeStatus');
 let selectedBoard=applyBoardTheme(readBoardTheme(localStorage));
 let selectedPiece=applyTheme(readTheme(localStorage));
 if(!list&&!paletteList)return;

 function syncPreviewColors(){
  if(!list)return;
  const b=BOARD_THEMES[selectedBoard];
  for(const preview of list.querySelectorAll('.theme-preview')){
   preview.style.setProperty('--preview-light',b.light);
   preview.style.setProperty('--preview-dark',b.dark);
  }
 }

 function selectBoard(id,save){
  selectedBoard=applyBoardTheme(id);
  if(paletteList){
   for(const btn of paletteList.querySelectorAll('button[data-palette]')){
    btn.setAttribute('aria-pressed',String(btn.dataset.palette===selectedBoard));
   }
  }
  syncPreviewColors();
  if(save&&status)status.textContent=saveBoardTheme(localStorage,selectedBoard)?'Палитра доски сохранена':'Применено, но не удалось сохранить';
 }

 function selectPiece(id,save){
  selectedPiece=applyTheme(id);
  if(list){
   for(const btn of list.querySelectorAll('button[data-theme]')){
    btn.setAttribute('aria-pressed',String(btn.dataset.theme===selectedPiece));
   }
  }
  if(save&&status)status.textContent=saveTheme(localStorage,selectedPiece)?'Стиль фигур сохранён':'Применено, но не удалось сохранить';
 }

 if(paletteList){
  for(const [id,b] of Object.entries(BOARD_THEMES)){
   const btn=document.createElement('button');
   btn.type='button';btn.className='palette-option';btn.dataset.palette=id;
   const swatch=document.createElement('span');swatch.className='palette-swatch'+(b.texture?' is-'+b.texture:'');
   swatch.style.setProperty('--preview-light',b.light);swatch.style.setProperty('--preview-dark',b.dark);
   for(let i=0;i<4;i++){const sq=document.createElement('span');sq.className=(Math.floor(i/2)+i%2)%2?'preview-dark':'preview-light';swatch.append(sq);}
   const title=document.createElement('strong');title.textContent=b.name;
   const desc=document.createElement('small');desc.textContent=b.description;
   btn.append(swatch,title,desc);
   btn.onclick=()=>selectBoard(id,true);
   paletteList.append(btn);
  }
 }

 if(list){
  for(const [id,t] of Object.entries(PIECE_SETS)){
   const b=document.createElement('button');b.type='button';b.className='theme-option';b.dataset.theme=id;
   const preview=document.createElement('span');preview.className='theme-preview';
   for(const [i,p] of [{color:'w',type:'n'},{color:'b',type:'q'},{color:'b',type:'p'},{color:'w',type:'k'}].entries()){
    const cell=document.createElement('span');cell.className=(Math.floor(i/2)+i%2)%2?'preview-dark':'preview-light';cell.append(pieceGraphic(p,id));preview.append(cell);
   }
   const info=document.createElement('span');info.className='theme-info';
   const title=document.createElement('strong');title.textContent=t.name;
   const desc=document.createElement('small');desc.textContent=t.description;
   const credit=document.createElement('small');credit.className='theme-credit';credit.textContent=t.credit;
   info.append(title,desc,credit);b.append(preview,info);b.onclick=()=>selectPiece(id,true);list.append(b);
  }
 }

 selectBoard(selectedBoard,false);
 selectPiece(selectedPiece,false);
}
