import {webLichessPgn,webChessComGame} from './platform-api.js';
import {sharedInput,validatedSharedPgn} from './share-core.js';
const native=globalThis.JohanShare,$=id=>document.getElementById(id);
let seq=0;const pending=new Map();
if(native)native.onmessage=e=>{try{const m=JSON.parse(e.data),p=pending.get(m.id);if(!p)return;clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.data);}catch{}};
function call(op,args={}){if(!native)return Promise.reject(Error('Передача доступна в Android'));return new Promise((resolve,reject)=>{const id=String(++seq),timer=setTimeout(()=>{pending.delete(id);reject(Error('Не удалось получить партию'));},100000);pending.set(id,{resolve,reject,timer});try{native.postMessage(JSON.stringify({id,op,...args}));}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});}
export function saveNativeFile({filename,mime,content}){return call('saveFile',{filename,mime,content});}

export function initGameShare({Chess,canUse,open,user,exportPgn,notice}){
 const say=t=>notice(t);let processing=false,current=null,checking=false,opened=null;
 $('sharePgnFile').hidden=!native;$('sharePgnText').hidden=!native;
 const hint=$('importHint');
 if(hint)hint.textContent=native
  ?'В Chess.com или Lichess выбери «Поделиться» → Johan Chess, или вставь PGN / ссылку ниже. Для ссылки Chess.com нужен ник участника в поле выше.'
  :'Вставь PGN (одну или несколько партий), ссылку на партию Lichess / Chess.com или загрузи файл .pgn. Для ссылки Chess.com нужен ник участника в поле выше.';

 async function importValue(raw,strictPgn=false){
  const input=sharedInput(raw);
  if(input.type==='pgn'&&!strictPgn){
   if(!canUse())throw Error('Заверши текущую работу перед импортом');
   if(!open(input.text))throw Error('Не удалось открыть PGN');
   return;
  }
  let text=input.text;
  if(input.type==='chesscom'){
   text=native?(await call('chesscom',{...input,user:user().trim()})).pgn:await webChessComGame(user(),input.kind,input.gameId);
  }else if(input.type==='lichess'){
   text=native?(await call('lichess',{gameId:input.gameId})).pgn:await webLichessPgn(input.gameId);
  }
  const result=validatedSharedPgn(text,Chess);
  if(!canUse())throw Error('Заверши текущую работу перед импортом');
  if(!open(result.text))throw Error('Не удалось открыть PGN');
  say('Импортировано партий: '+result.count+(result.skipped?' · пропущено: '+result.skipped:'')+'. Можно запустить анализ.');
 }

 async function process(raw,item){
  if(processing||!canUse())return;
  processing=true;$('load').disabled=true;
  try{
   if(!item||opened!==item){await importValue(raw,Boolean(item));if(item)opened=item;}
   if(item){await call('ack',{itemId:item});current=null;opened=null;}
   if(item)$('pgn').value='';
   $('sharedPending').hidden=true;
  }catch(e){say(e.message);$('sharedPending').hidden=!current;}
  finally{processing=false;$('load').disabled=false;}
 }

 async function poll(){
  if(!native||checking||processing||current||document.hidden||!canUse())return;
  checking=true;try{
   const {item}=await call('peek');if(!item||!canUse())return;
   current=item.id;
   $('importSource').open=true;
   if(item.error){say(item.error);$('sharedPending').hidden=false;return;}
   $('pgn').value=item.text;$('sharedPending').hidden=false;
   await process(item.text,item.id);
  }catch{}finally{checking=false;}
 }

 $('load').onclick=()=>process($('pgn').value,current);
 $('shareDiscard').onclick=async()=>{
  if(!current||processing||!canUse())return;
  try{await call('ack',{itemId:current});current=null;opened=null;$('sharedPending').hidden=true;$('pgn').value='';}
  catch(e){say(e.message);}
 };
 for(const [id,file] of [['sharePgnFile',true],['sharePgnText',false]])$(id).onclick=async()=>{
  if(!canUse())return;const pgn=exportPgn();if(!pgn)return;
  try{validatedSharedPgn(pgn,Chess);await call('share',{pgn,file});}catch(e){say(e.message);}
 };
 if(native){setInterval(poll,1500);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});poll();}
}
