import {Chess} from './chess.js';
import {memoryKey,loadMemory,saveMemory,normalizeMemory,shouldCompact,coachHistory,createMemoryUpdate} from './coach-memory.js';
import {getPuzzleTraining} from './puzzles.js';
import {createCoachTools} from './coach-tools.js';
import {snapshotBoards,renderCoachContent} from './coach-board.js';
import {confirmDialog} from './dialog.js';
const $=id=>document.getElementById(id);
const native=globalThis.JohanNative;
const pending=new Map();
let seq=0, active=false,connected=false,loginPending=false,loginVersion=0,pendingQuestion='', history=[], contextProvider=null,toolOptions=null,account='',scopeKey=null,visibleMessages=20,memory=normalizeMemory(null,Chess);
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
function sayAccount(text){$('aiAccountStatus').textContent=text;}
function ready(){return active&&!!scopeKey&&$('aiModel').options.length>0;}
function syncChat(){const ok=ready();$('aiSetup').hidden=ok;$('aiChat').hidden=!ok;$('aiSetupText').textContent=!connected?'Подключи ChatGPT в профиле.':!active?'Разреши использование подписки в настройках.':'Модели пока недоступны. Проверь подключение в настройках.';$('aiAsk').disabled=busy||!ok;$('aiEmpty').hidden=history.length>0||!!pendingQuestion;}
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
 $('aiSummary').value=memory.summary;$('aiNotes').value=memory.notes;$('aiGoal').value=memory.goal;$('aiFocus').value=memory.focus;$('aiMinutes').value=String(memory.minutes);$('aiPlan').value=memory.plan;$('aiShareHistory').checked=memory.shareHistory;$('aiShare').checked=memory.shareGames;
 $('aiMemoryStatus').textContent=scopeKey?'Локальная память · '+history.length/2+' диалогов':'Войди в ChatGPT, чтобы сохранять занятия.';
 for(const id of ['aiSummary','aiNotes','aiGoal','aiFocus','aiMinutes','aiPlan','aiClear','aiDeleteStudy','aiContinue','aiMakePlan','aiShareHistory','aiShare','aiDeleteMemory'])$(id).disabled=busy||!scopeKey;
}
function switchMemory(force=false){
 const next=memoryKey(account,contextProvider?.().user);
 if(next===scopeKey&&!force)return;
 $('aiCacheStatus').textContent='';scopeKey=next;memory=loadMemory(localStorage,scopeKey,Chess);history=memory.history;visibleMessages=20;
 $('aiQuestion').value='';pendingQuestion='';updateStudyFields();showHistory();
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
 if(pendingQuestion){const el=document.createElement('div');el.className='ai-message user';el.textContent=pendingQuestion;list.append(el);}
 list.scrollTop=list.scrollHeight;$('aiEmpty').hidden=history.length>0||!!pendingQuestion;
}
function syncStatus(s){
 connected=!!s.connected;active=connected&&Boolean(s.sharing);account=s.connected&&typeof s.memoryId==='string'?s.memoryId:'';switchMemory();
 document.dispatchEvent(new CustomEvent('jc-account',{detail:{connected:!!s.connected,sharing:!!s.sharing,name:typeof s.name==='string'?s.name:''}}));
 $('aiAccount').textContent=s.connected?(s.name||'ChatGPT'):'Не подключён';
 $('aiLogin').textContent=s.connected?'Повторить вход':'Continue with ChatGPT';$('aiLogin').hidden=connected;$('aiModelRow').hidden=!active;
 $('aiConsent').hidden=!s.connected||s.sharing;
 $('aiLogout').hidden=!s.connected;
 $('aiForget').hidden=!s.registered;
 $('aiModel').replaceChildren();
 $('aiModel').disabled=true;$('aiAsk').disabled=true;
 sayAccount(active?'Подключено. Загружаю модели…':s.connected?'Вход выполнен. Разреши использование плана ChatGPT.':'ChatGPT не подключён.');syncChat();
}
async function refresh(){
 const s=await call('status');syncStatus(s);
 if(active){
  let r;try{r=await call('models');}catch(e){try{syncStatus(await call('status'));}catch{}throw e;}
  for(const m of r.models){const o=document.createElement('option');o.value=m.slug;o.textContent=m.name;$('aiModel').append(o);}
  $('aiModel').disabled=!r.models.length;$('aiAsk').disabled=!r.models.length;
  try{const choice=localStorage.getItem('jc-coach-model:'+account);if([...$('aiModel').options].some(o=>o.value===choice))$('aiModel').value=choice;}catch{}
  sayAccount(r.models.length?'ChatGPT подключён.':'Для этой учётной записи нет доступных моделей.');syncChat();
 }
}
let busy=false;
export const coachBusy=()=>busy;
async function action(fn,settings=false){
 if(busy)return;busy=true;
 const controls=['aiLogin','aiConsent','aiLogout','aiForget','aiRefresh','aiAsk','aiClear','aiDeleteStudy','aiDeleteMemory','aiContinue','aiMakePlan','aiSummary','aiNotes','aiGoal','aiFocus','aiMinutes','aiPlan','aiShareHistory','aiShare','aiModel'];
 for(const id of controls)$(id).disabled=true;
 try{await fn();}catch(e){(settings?sayAccount:say)(e.message||'Ошибка подключения.');}
 finally{if(pendingQuestion){pendingQuestion='';showHistory();}busy=false;for(const id of controls)$(id).disabled=false;switchMemory();updateStudyFields();$('aiModel').disabled=!active||!$('aiModel').options.length;syncChat();}
}
export function initCoach(provider,options){
 contextProvider=provider;toolOptions=options;
 if(!native){$('aiAccountStatus').textContent='Подключение доступно только в Android.';for(const id of ['aiLogin','aiRefresh'])$(id).disabled=true;return;}
 $('coachUnavailable').hidden=true;$('aiPanel').hidden=false;
 const login=consent=>action(async()=>{if(toolOptions?.onlineLocked?.())throw Error('Сначала заверши онлайн-партию.');loginPending=true;const version=++loginVersion;$('aiCancelLogin').hidden=false;sayAccount('Продолжи вход в браузере и вернись в Johan Chess.');let checking=false;const poll=setInterval(async()=>{if(checking||!loginPending||version!==loginVersion)return;checking=true;try{const r=await call('loginProgress');if(loginPending&&version===loginVersion&&r.stage)sayAccount(r.stage);}catch{}finally{checking=false;}},800);try{syncStatus(await call('login',{consent}));loginPending=false;await refresh();}finally{clearInterval(poll);loginPending=false;$('aiCancelLogin').hidden=true;}},true);
 $('aiCancelLogin').onclick=async()=>{if(!loginPending)return;try{await call('cancelLogin');}catch(e){sayAccount(e.message);}};
 $('aiModel').onchange=()=>{if(account)try{localStorage.setItem('jc-coach-model:'+account,$('aiModel').value);}catch{}};
 $('aiLogin').onclick=()=>login(false);$('aiConsent').onclick=()=>login(true);
 $('aiRefresh').onclick=()=>action(refresh,true);
 const logout=forget=>action(async()=>{const r=await call(forget?'forget':'logout');syncStatus(r);if(!r.revoked)sayAccount('Локальный выход выполнен. Отзови доступ в настройках ChatGPT, если требуется.');},true);
 $('aiLogout').onclick=()=>logout(false);$('aiForget').onclick=async()=>{if(busy)return;if(await confirmDialog({title:'Удалить регистрацию ChatGPT?',message:'Сохранённая регистрация клиента на этом устройстве будет удалена.',confirmText:'Удалить',danger:true})&&!busy)logout(true);};
 $('aiClear').onclick=async()=>{const currentScope=scopeKey;if(busy||!currentScope)return;if(!await confirmDialog({title:'Очистить диалог?',message:'Удалить сохранённый диалог и краткую сводку? План и заметки останутся.',confirmText:'Очистить',danger:true}))return;if(busy||scopeKey!==currentScope)return;history=[];memory.summary='';memory.summaryPending=0;persist();updateStudyFields();showHistory();};
 $('aiDeleteStudy').onclick=async()=>{const currentScope=scopeKey;if(busy||!currentScope)return;if(!await confirmDialog({title:'Удалить память учёбы?',message:'Удалить диалог, мини-доски, сводку, план и заметки для текущего аккаунта и ника?',confirmText:'Удалить',danger:true}))return;if(busy||scopeKey!==currentScope)return;try{localStorage.removeItem(currentScope);switchMemory(true);}catch{say('Не удалось удалить память.');}};
 $('aiOlder').onclick=()=>{visibleMessages+=20;showHistory();};
 $('aiShare').onchange=()=>{if(!scopeKey||busy)return;memory.shareGames=$('aiShare').checked;persist();};
 $('aiShareHistory').onchange=()=>{if(!scopeKey||busy)return;memory.shareHistory=$('aiShareHistory').checked;persist();};
 $('aiContinue').onclick=()=>{if(busy||!scopeKey)return;$('aiQuestion').value='Продолжим обучение. На основе доступного плана, прошлых занятий и статистики предложи один следующий шаг. Если контекста недостаточно, уточни.';$('aiQuestion').focus();};
 $('aiMakePlan').onclick=()=>{if(busy||!scopeKey)return;$('aiQuestion').value='Составь индивидуальный план на неделю по моим целям, времени и доступной статистике. Используй проверенные учебные источники и существующие задачи Lichess; не создавай новые шахматные позиции.';$('aiQuestion').focus();};
 $('aiDeleteMemory').onclick=async()=>{const currentScope=scopeKey;if(busy||!currentScope)return;if(!await confirmDialog({title:'Очистить историю анализа?',message:'Удалить локальную историю проанализированных партий этого игрока?',confirmText:'Очистить',danger:true}))return;if(busy||scopeKey!==currentScope)return;try{localStorage.removeItem(key(contextProvider().user));say('История анализа очищена.');}catch{say('Не удалось очистить историю.');}};
 $('aiAsk').onclick=()=>action(async()=>{
  if(toolOptions?.onlineLocked?.())throw Error('Тренер недоступен во время онлайн-партии');
  switchMemory();const requestKey=scopeKey;
  const question=$('aiQuestion').value.trim(),model=$('aiModel').value;if(!question||!model||!requestKey)return;
  pendingQuestion=question;showHistory();
  const ctx=contextProvider();
  const include=$('aiShare').checked;
  const fullGame=include&&ctx.game&&['1-0','0-1','1/2-1/2'].includes(ctx.game.result)?ctx.game:null;
  const game=fullGame?{...fullGame,analysis:(fullGame.analysis||[]).filter(r=>r.loss>=5).sort((a,b)=>b.loss-a.loss).slice(0,6)}:null;
  const profile={goal:memory.goal,focus:memory.focus,minutesPerDay:memory.minutes,notes:memory.notes,studyPlan:memory.plan,summary:memory.shareHistory?memory.summary:''};
  const allowed=!!(include&&toolOptions?.canAnalyze());
  const context={user:ctx.user,game:allowed?game:null,toolsAllowed:allowed,recentGames:allowed?getGames(ctx.user).slice(0,5).map(({errors,id,...r})=>({...r,errors:errors?.slice(0,2)})):[],puzzleTraining:allowed?getPuzzleTraining(ctx.user):null};
  // Unfinished games are excluded from context; ordinary coaching remains available.
  if(JSON.stringify(context).length>70000){say('Слишком большой контекст. Отключи отправку партии или сократи анализ.');return;}
  const compact=shouldCompact(memory,history),previous=coachHistory(memory,history),memoryAllowed=memory.shareHistory;
  const sameProfile=()=>requestKey===memoryKey(account,contextProvider().user);
  const memoryUpdate=createMemoryUpdate(memory,()=>memoryAllowed&&$('aiShareHistory').checked&&sameProfile());say('Тренер анализирует…');
  const execute=createCoachTools({...toolOptions,Chess,storage:localStorage,user:ctx.user,game:fullGame,allow:context.toolsAllowed,canAnalyze:()=>!!(toolOptions?.canAnalyze()&&$('aiShare').checked&&requestKey===memoryKey(account,contextProvider().user)),stats:()=>({tactics:getPuzzleTraining(ctx.user),recentGames:getGames(ctx.user).slice(0,12).map(({id,...r})=>r)})});
  $('aiCacheStatus').textContent='';
  let result=await call('ask',{model,context,profile,history:previous,question,compact,memoryAllowed}),totalInput=0,totalCached=0,reported=false;
  for(let round=0;;round++){
   if(Number.isFinite(result.usage?.input)&&Number.isFinite(result.usage?.cached)){totalInput+=result.usage.input;totalCached+=result.usage.cached;reported=true;}
   if(toolOptions?.onlineLocked?.())throw Error('Ответ отменён: онлайн-партия');
   if(!result.calls?.length)break;
   if(round>=6)throw Error('Лимит шагов инструментов достигнут.');
   const outputs=[];
   for(const tool of result.calls){
    if(requestKey!==memoryKey(account,contextProvider().user))throw Error('Профиль изменился');
    say('Тренер изучает материалы…');
    let args;try{args=JSON.parse(tool.arguments);}catch{args=null;}
    const value=tool.name==='memory_update'?memoryUpdate.execute(args):await execute(tool.name,args);
    outputs.push({call_id:tool.call_id,output:JSON.stringify(value)});
   }
   if(!sameProfile()||(memoryAllowed&&!$('aiShareHistory').checked)||(context.toolsAllowed&&(!$('aiShare').checked||!toolOptions?.canAnalyze())))throw Error('Доступ к данным изменился');
   result=await call('continueCoach',{turn:result.turn,outputs});
  }
  $('aiCacheStatus').textContent=reported?'Контекст: '+totalInput+' токенов · из кэша '+totalCached:'Статистика кэша не предоставлена';
  if(toolOptions?.onlineLocked?.())throw Error('Ответ отменён: онлайн-партия');
  const answer=typeof result.answer==='string'?result.answer.trim():'';if(!answer)throw Error('Пустой ответ');
  const pair=[{role:'user',content:question},{role:'assistant',content:answer,parts:snapshotBoards(answer,context.game)}];
  if(requestKey!==memoryKey(account,contextProvider().user)){const saved=loadMemory(localStorage,requestKey,Chess);const stored=saveMemory(localStorage,requestKey,{...saved,history:[...saved.history,...pair]},Chess);switchMemory();say(stored.saved?'Ответ сохранён в предыдущем профиле.':'Не удалось сохранить ответ предыдущего профиля.');return;}
  memory=memoryUpdate.finish(memory);pendingQuestion='';history.push(...pair);const saved=persist();$('aiSummary').value=memory.summary;$('aiQuestion').value='';showHistory();say(saved?'Ответ получен.':'Ответ получен, но сохранение не удалось.');
 });
 for(const [id,k] of [['aiSummary','summary'],['aiNotes','notes'],['aiGoal','goal'],['aiFocus','focus'],['aiMinutes','minutes'],['aiPlan','plan']])$(id).onchange=()=>{if(!scopeKey||busy)return;memory[k]=k==='minutes'?Number($(id).value):$(id).value;persist();};
 document.addEventListener('jc-screen',e=>{if(['coach','account'].includes(e.detail)&&!busy){switchMemory();syncChat();}});
 document.addEventListener('jc-profile-user',()=>{if(!busy){switchMemory();syncChat();}});
 updateStudyFields();
 syncChat();action(refresh,true);
}
