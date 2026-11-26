import {Chess} from './chess.js';
import {memoryKey,loadMemory,saveMemory,recentConversation,normalizeMemory} from './coach-memory.js';
import {getPuzzleTraining} from './puzzles.js';
import {snapshotBoards,renderCoachContent} from './coach-board.js';
const $=id=>document.getElementById(id);
const native=globalThis.JohanNative;
const pending=new Map();
let seq=0, active=false, history=[], contextProvider=null,account='',scopeKey=null,visibleMessages=20,memory=normalizeMemory(null,Chess);
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
 if(context?.game?.source==='historical'||!context?.game||!context.user||!context.game.complete||!['1-0','0-1','1/2-1/2'].includes(context.game.result))return;
 const g=context.game, own=g.color;if(!['w','b'].includes(own))return;
 const rs=(g.analysis||[]).filter(r=>r.color===own);
 const fingerprint=g.white+'|'+g.black+'|'+g.date+'|'+g.startFen+'|'+g.moves.join(' ');
 const record={id:fingerprint,source:g.source||'import',date:g.date,white:g.white,black:g.black,result:g.result,color:own,depth:g.depth,accuracy:rs.length?rs.reduce((a,r)=>a+r.accuracy,0)/rs.length:null,errors:rs.filter(r=>r.loss>=5).sort((a,b)=>b.loss-a.loss).slice(0,5).map(r=>({index:r.index,san:r.san,best:r.bestSan,loss:r.loss,label:r.label,pv:r.pv}))};
 try{const saved=getGames(context.user).filter(r=>r.id!==fingerprint);localStorage.setItem(key(context.user),JSON.stringify([record,...saved].slice(0,30)));}catch{}
}
function updateStudyFields(){
 $('aiNotes').value=memory.notes;$('aiGoal').value=memory.goal;$('aiFocus').value=memory.focus;$('aiMinutes').value=String(memory.minutes);$('aiPlan').value=memory.plan;$('aiShareHistory').checked=memory.shareHistory;
 $('aiMemoryStatus').textContent=scopeKey?'Локальная память · '+history.length/2+' диалогов':'Войди в ChatGPT, чтобы сохранять занятия.';
 for(const id of ['aiNotes','aiGoal','aiFocus','aiMinutes','aiPlan','aiClear','aiDeleteStudy','aiContinue','aiMakePlan','aiShareHistory','aiDeleteMemory'])$(id).disabled=busy||!scopeKey;
}
function switchMemory(force=false){
 const next=memoryKey(account,contextProvider?.().user);
 if(next===scopeKey&&!force)return;
 scopeKey=next;memory=loadMemory(localStorage,scopeKey,Chess);history=memory.history;visibleMessages=20;
 $('aiQuestion').value='';updateStudyFields();showHistory();
}
function persist(){
 if(!scopeKey)return false;
 const result=saveMemory(localStorage,scopeKey,{...memory,history},Chess);
 memory=result.memory;history=memory.history;
 $('aiMemoryStatus').textContent=result.saved?'Локальная память · '+history.length/2+' диалогов':'Не удалось сохранить память на устройстве.';
 return result.saved;
}
function showHistory(){
 const list=$('aiHistory');list.replaceChildren();
 $('aiOlder').hidden=history.length<=visibleMessages;
 for(const m of history.slice(-visibleMessages)){const el=document.createElement('div');el.className='ai-message '+m.role;const name=document.createElement('b');name.textContent=m.role==='assistant'?'Тренер':'Ты';const body=document.createElement('div');renderCoachContent(body,m);el.append(name,body);list.append(el);}
 list.scrollTop=list.scrollHeight;
}
function syncStatus(s){
 active=Boolean(s.sharing);account=s.connected&&typeof s.memoryId==='string'?s.memoryId:'';switchMemory();
 document.dispatchEvent(new CustomEvent('jc-account',{detail:{connected:!!s.connected,sharing:!!s.sharing,name:typeof s.name==='string'?s.name:''}}));
 $('aiAccount').textContent=s.connected?(s.name||'ChatGPT'):'Не подключён';
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
 const controls=['aiLogin','aiConsent','aiLogout','aiForget','aiRefresh','aiAsk','aiClear','aiDeleteStudy','aiDeleteMemory','aiContinue','aiMakePlan','aiNotes','aiGoal','aiFocus','aiMinutes','aiPlan','aiShareHistory'];
 for(const id of controls)$(id).disabled=true;
 try{await fn();}catch(e){say(e.message||'Ошибка подключения.');}
 finally{busy=false;for(const id of controls)$(id).disabled=false;switchMemory();for(const id of controls.slice(6))$(id).disabled=!scopeKey;$('aiAsk').disabled=!active||!scopeKey||!$('aiModel').options.length;}
}
export function initCoach(provider){
 contextProvider=provider;
 if(!native)return;
 $('aiPanel').hidden=false;
 const login=consent=>action(async()=>{say('Продолжи вход в системном браузере, затем вернись в приложение.');await call('login',{consent});await refresh();});
 $('aiLogin').onclick=()=>login(false);$('aiConsent').onclick=()=>login(true);
 $('aiRefresh').onclick=()=>action(refresh);
 const logout=forget=>action(async()=>{const r=await call(forget?'forget':'logout');syncStatus(r);if(!r.revoked)say('Локальный выход выполнен. Отзови доступ в настройках ChatGPT, если требуется.');});
 $('aiLogout').onclick=()=>logout(false);$('aiForget').onclick=()=>{if(confirm('Удалить сохранённую регистрацию ChatGPT с устройства?'))logout(true);};
 $('aiClear').onclick=()=>{if(busy||!scopeKey||!confirm('Удалить сохранённый диалог? План и заметки останутся.'))return;history=[];persist();showHistory();};
 $('aiDeleteStudy').onclick=()=>{if(busy||!scopeKey||!confirm('Удалить диалог, мини-доски, план и заметки для текущего аккаунта и ника?'))return;try{localStorage.removeItem(scopeKey);switchMemory(true);}catch{say('Не удалось удалить память.');}};
 $('aiOlder').onclick=()=>{visibleMessages+=20;showHistory();};
 $('aiShareHistory').onchange=()=>{if(!scopeKey||busy)return;memory.shareHistory=$('aiShareHistory').checked;persist();};
 $('aiContinue').onclick=()=>{if(busy||!scopeKey)return;$('aiQuestion').value='Продолжим обучение. На основе доступного плана, прошлых занятий и статистики предложи один следующий шаг. Если контекста недостаточно, уточни.';$('aiQuestion').focus();};
 $('aiMakePlan').onclick=()=>{if(busy||!scopeKey)return;$('aiQuestion').value='Составь индивидуальный план на неделю по моим целям, времени и доступной статистике. Используй проверенные учебные источники и существующие задачи Lichess; не создавай новые шахматные позиции.';$('aiQuestion').focus();};
 $('aiDeleteMemory').onclick=()=>{if(!busy&&scopeKey&&confirm('Удалить локальную историю проанализированных партий этого игрока?')){try{localStorage.removeItem(key(contextProvider().user));say('История анализа очищена.');}catch{say('Не удалось очистить историю.');}}};
 $('aiAsk').onclick=()=>action(async()=>{
  switchMemory();const requestKey=scopeKey;
  const question=$('aiQuestion').value.trim(),model=$('aiModel').value;if(!question||!model||!requestKey)return;
  const ctx=contextProvider();
  const include=$('aiShare').checked;
  const context={user:ctx.user,profile:{goal:memory.goal,focus:memory.focus,minutesPerDay:memory.minutes,notes:memory.notes,studyPlan:memory.plan},game:include?ctx.game:null,recentGames:include?getGames(ctx.user).slice(0,20):[],puzzleTraining:include?getPuzzleTraining(ctx.user):null};
  if(context.game&&!['1-0','0-1','1/2-1/2'].includes(context.game.result)){say('Загрузи завершённую партию или отключи отправку партии.');return;}
  if(JSON.stringify(context).length>160000){say('Слишком большой контекст. Отключи отправку партии или сократи анализ.');return;}
  const previous=recentConversation(history,memory.shareHistory);say('Тренер анализирует…');
  const result=await call('ask',{model,context,history:previous,question});
  const pair=[{role:'user',content:question},{role:'assistant',content:result.answer,parts:snapshotBoards(result.answer,context.game)}];
  if(requestKey!==memoryKey(account,contextProvider().user)){const saved=loadMemory(localStorage,requestKey,Chess);const stored=saveMemory(localStorage,requestKey,{...saved,history:[...saved.history,...pair]},Chess);switchMemory();say(stored.saved?'Ответ сохранён в предыдущем профиле.':'Не удалось сохранить ответ предыдущего профиля.');return;}
  history.push(...pair);const saved=persist();$('aiQuestion').value='';showHistory();say(saved?'Ответ получен.':'Ответ получен, но сохранение не удалось.');
 });
 for(const [id,k] of [['aiNotes','notes'],['aiGoal','goal'],['aiFocus','focus'],['aiMinutes','minutes'],['aiPlan','plan']])$(id).onchange=()=>{if(!scopeKey||busy)return;memory[k]=k==='minutes'?Number($(id).value):$(id).value;persist();};
 document.addEventListener('jc-screen',e=>{if(e.detail==='coach'&&!busy)switchMemory();});
 updateStudyFields();
 action(refresh);
}
