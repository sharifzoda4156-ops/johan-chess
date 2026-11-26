const $=id=>document.getElementById(id);
const native=globalThis.JohanNative;
const pending=new Map();
let seq=0, active=false, history=[], contextProvider=null;
if(native)native.onmessage=e=>{
 try{const m=JSON.parse(e.data), p=pending.get(m.id);if(!p)return;clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.data);}catch{}
};
function call(op,fields={}){
 if(!native)return Promise.reject(Error('Тренер пока доступен только в Android-приложении.'));
 return new Promise((resolve,reject)=>{
  const id=String(++seq),timer=setTimeout(()=>{pending.delete(id);reject(Error('Время ожидания истекло.'));},op==='login'?480000:240000);
  pending.set(id,{timer,resolve,reject});
  try{native.postMessage(JSON.stringify({id,op,...fields}));}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}
 });
}
function say(text){$('aiStatus').textContent=text;}
function key(user){return 'jc-coach-games:'+String(user||'').toLowerCase().trim();}
function getGames(user){try{return JSON.parse(localStorage.getItem(key(user))||'[]');}catch{return [];}}
export function rememberGame(context){
 if(!context?.game||!context.user||!context.game.complete||!['1-0','0-1','1/2-1/2'].includes(context.game.result))return;
 const g=context.game, own=g.color;
 const rs=(g.analysis||[]).filter(r=>r.color===own);
 const fingerprint=g.white+'|'+g.black+'|'+g.date+'|'+g.moves.join(' ');
 const record={id:fingerprint,date:g.date,white:g.white,black:g.black,result:g.result,color:own,depth:g.depth,accuracy:rs.length?rs.reduce((a,r)=>a+r.accuracy,0)/rs.length:null,errors:rs.filter(r=>r.loss>=5).sort((a,b)=>b.loss-a.loss).slice(0,5).map(r=>({index:r.index,san:r.san,best:r.bestSan,loss:r.loss,label:r.label,pv:r.pv}))};
 try{const saved=getGames(context.user).filter(r=>r.id!==fingerprint);localStorage.setItem(key(context.user),JSON.stringify([record,...saved].slice(0,30)));}catch{}
}
function showHistory(){
 const list=$('aiHistory');list.replaceChildren();
 for(const m of history){const el=document.createElement('div');el.className='ai-message '+m.role;const name=document.createElement('b');name.textContent=m.role==='assistant'?'Тренер':'Ты';const body=document.createElement('div');body.textContent=m.content;el.append(name,body);list.append(el);}
 list.scrollTop=list.scrollHeight;
}
function syncStatus(s){
 active=Boolean(s.sharing);
 $('aiAccount').textContent=s.connected?(s.email||'ChatGPT'):'Не подключён';
 $('aiLogin').textContent=s.connected?'Повторить вход':'Continue with ChatGPT';
 $('aiConsent').hidden=!s.connected||s.sharing;
 $('aiLogout').hidden=!s.connected;
 $('aiForget').hidden=!s.registered;
 $('aiModel').replaceChildren();
 $('aiModel').disabled=true;$('aiAsk').disabled=true;
 say(active?'Использование плана ChatGPT разрешено. Загружаю модели…':s.connected?'Разреши использование плана ChatGPT.':'Войди в ChatGPT, чтобы включить ИИ.');
}
async function refresh(){
 const s=await call('status');syncStatus(s);
 if(active){
  const r=await call('models');
  for(const m of r.models){const o=document.createElement('option');o.value=m.slug;o.textContent=m.name;$('aiModel').append(o);}
  $('aiModel').disabled=!r.models.length;$('aiAsk').disabled=!r.models.length;
  say(r.models.length?'Выбери модель. Запрос расходует доступный лимит подписки.':'Для этой учётной записи нет доступных моделей.');
 }
}
let busy=false;
async function action(fn){
 if(busy)return;busy=true;
 const controls=['aiLogin','aiConsent','aiLogout','aiForget','aiRefresh','aiAsk','aiClear'];
 for(const id of controls)$(id).disabled=true;
 try{await fn();}catch(e){say(e.message||'Ошибка подключения.');}
 finally{busy=false;for(const id of controls)$(id).disabled=false;$('aiAsk').disabled=!active||!$('aiModel').options.length;}
}
export function initCoach(provider){
 contextProvider=provider;
 if(!native)return;
 $('aiPanel').hidden=false;
 const login=consent=>action(async()=>{say('Продолжи вход в системном браузере, затем вернись в приложение.');await call('login',{consent});history=[];showHistory();await refresh();});
 $('aiLogin').onclick=()=>login(false);$('aiConsent').onclick=()=>login(true);
 $('aiRefresh').onclick=()=>action(refresh);
 const logout=forget=>action(async()=>{const r=await call(forget?'forget':'logout');history=[];showHistory();syncStatus(r);if(!r.revoked)say('Локальный выход выполнен. Отзови доступ в настройках ChatGPT, если требуется.');});
 $('aiLogout').onclick=()=>logout(false);$('aiForget').onclick=()=>{if(confirm('Удалить сохранённую регистрацию ChatGPT с устройства?'))logout(true);};
 $('aiClear').onclick=()=>{history=[];showHistory();};
 $('aiDeleteMemory').onclick=()=>{if(confirm('Удалить локальную историю проанализированных партий этого игрока?')){try{localStorage.removeItem(key(contextProvider().user));say('История анализа очищена.');}catch{say('Не удалось очистить историю.');}}};
 $('aiAsk').onclick=()=>action(async()=>{
  const question=$('aiQuestion').value.trim(),model=$('aiModel').value;if(!question||!model)return;
  const ctx=contextProvider();
  const include=$('aiShare').checked;
  const context={user:ctx.user,profile:{goal:'Стабильные 1500 как первый этап; исследовать достижимый уровень',focus:'Расчёт ответных угроз и безопасность короля',notes:$('aiNotes').value.slice(0,3000)},game:include?ctx.game:null,recentGames:include?getGames(ctx.user).slice(0,20):[]};
  if(context.game&&!['1-0','0-1','1/2-1/2'].includes(context.game.result)){say('Загрузи завершённую партию или отключи отправку партии.');return;}
  if(JSON.stringify(context).length>160000){say('Слишком большой контекст. Отключи отправку партии или сократи анализ.');return;}
  const previous=history.slice(-12);say('Тренер анализирует…');
  const result=await call('ask',{model,context,history:previous,question});
  history.push({role:'user',content:question},{role:'assistant',content:result.answer});
  history=history.slice(-20);$('aiQuestion').value='';showHistory();say('Ответ получен.');
 });
 try{$('aiNotes').value=localStorage.getItem('jc-coach-notes')||'';}catch{}
 $('aiNotes').oninput=()=>{try{localStorage.setItem('jc-coach-notes',$('aiNotes').value);}catch{}};
 action(refresh);
}
