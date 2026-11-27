import {Chess} from './chess.js';
import {memoryKey,loadMemory,saveMemory,normalizeMemory,shouldCompact,coachHistory,createMemoryUpdate} from './coach-memory.js';
import {getPuzzleTraining} from './puzzles.js';
import {snapshotBoards,renderCoachContent} from './coach-board.js';
import {confirmDialog} from './dialog.js';
import {askCoach,getToken,setToken,tokenOk,coachAccountKey} from './coach-client.js';
import {normalizeCoachStats} from './coach-training-stats.js';
const $=id=>document.getElementById(id);
const CONSENT_KEY='jc-coach-public-consent-v2:',MODEL='qwen3.5-9b';
let active=false,connected=false,pendingQuestion='', history=[], contextProvider=null,toolOptions=null,account='',scopeKey=null,visibleMessages=20,memory=normalizeMemory(null,Chess);
const consentGiven=id=>{try{return !!id&&localStorage.getItem(CONSENT_KEY+id)==='1';}catch{return false;}};
const setConsent=v=>{if(!account)return false;try{v?localStorage.setItem(CONSENT_KEY+account,'1'):localStorage.removeItem(CONSENT_KEY+account);return true;}catch{return false;}};
function say(text){$('aiStatus').textContent=text;}
function sayAccount(text){$('aiAccountStatus').textContent=text;}
function ready(){return active&&!!scopeKey&&$('aiModel').options.length>0;}
function syncChat(){const ok=ready();$('aiSetup').hidden=ok;$('aiChat').hidden=!ok;$('aiSetupText').textContent=!connected?'Добавь токен GitHub в профиле — тренер работает через GitHub Actions.':!active?'Разреши отправку данных в GitHub Actions в настройках.':'Тренер пока недоступен. Проверь настройки.';$('aiAsk').disabled=busy||!ok;$('aiEmpty').hidden=history.length>0||!!pendingQuestion;}
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
 $('aiMemoryStatus').textContent=scopeKey?'Локальная память · '+history.length/2+' диалогов':'Добавь токен GitHub, чтобы сохранять занятия.';
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
  connected=!!s.connected;active=connected&&Boolean(s.sharing);account=connected?s.account:'';switchMemory();
  document.dispatchEvent(new CustomEvent('jc-account',{detail:{connected,sharing:!!s.sharing,name:connected?'GitHub':''}}));
  $('aiAccount').textContent=connected?'GitHub токен сохранён':'Не подключён';
  $('aiLogin').textContent=connected?'Заменить токен':'Сохранить токен';$('aiLogin').hidden=false;$('aiModelRow').hidden=true;
  $('aiConsent').hidden=!connected||s.sharing;
  $('aiLogout').hidden=!connected;
  $('aiForget').hidden=true;
  $('aiModel').replaceChildren();
  if(active){const o=document.createElement('option');o.value=MODEL;o.textContent='Qwen3.5-9B (GitHub Actions)';$('aiModel').append(o);}
  $('aiModel').disabled=true;$('aiAsk').disabled=!active;
  sayAccount(active?'Тренер подключён.':connected?'Токен сохранён. Разреши отправку данных в GitHub Actions.':'Токен не добавлен.');syncChat();
}
async function refresh(){const t=getToken();let id='';try{id=await coachAccountKey(t);}catch(e){syncStatus({connected:false,sharing:false,account:''});throw e;}syncStatus({connected:!!id,sharing:consentGiven(id),account:id});}
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
  $('coachUnavailable').hidden=true;$('aiPanel').hidden=false;$('aiCancelLogin').hidden=true;
  $('aiLogin').onclick=()=>action(async()=>{const t=$('aiToken').value.trim();if(!tokenOk(t))throw Error('Неверный формат токена (github_pat_… или ghp_…).');if(!setToken(t))throw Error('Не удалось сохранить токен.');$('aiToken').value='';await refresh();},true);
  $('aiConsent').onclick=()=>action(async()=>{
   if(!await confirmDialog({title:'Публичный GitHub Actions',message:'Вопросы, переданные данные и ответы могут быть доступны всем в публичных запусках GitHub. Не отправляй личные или конфиденциальные данные. Локальное удаление диалога не удаляет записи GitHub.',confirmText:'Понимаю, разрешить'}))return;
   if(!setConsent(true))throw Error('Не удалось сохранить разрешение');await refresh();
  },true);
  $('aiRefresh').onclick=()=>action(refresh,true);
  $('aiLogout').onclick=()=>action(async()=>{setToken('');setConsent(false);await refresh();},true);
 $('aiModel').onchange=()=>{if(account)try{localStorage.setItem('jc-coach-model:'+account,$('aiModel').value);}catch{}};
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
   const question=$('aiQuestion').value.trim();if(!question||!requestKey||!active)return;
   pendingQuestion=question;showHistory();
   const ctx=contextProvider();
   const include=$('aiShare').checked&&!!toolOptions?.canAnalyze();
   const g=include&&ctx.game&&['1-0','0-1','1/2-1/2'].includes(ctx.game.result)&&Array.isArray(ctx.game.moves)?ctx.game:null;
   const gamePayload=g?{white:g.white,black:g.black,result:g.result,startFen:g.startFen,moves:g.moves,color:g.color}:null;
   const stats=include?normalizeCoachStats({games:toolOptions?.trainingStats?.(ctx.user),puzzles:getPuzzleTraining(ctx.user)}):null;
   const profile={goal:memory.goal,focus:memory.focus,notes:memory.notes,summary:memory.shareHistory?memory.summary:''};
   const compact=shouldCompact(memory,history),previous=coachHistory(memory,history),memoryAllowed=memory.shareHistory;
   const sameProfile=()=>requestKey===memoryKey(account,contextProvider().user);
   const memoryUpdate=createMemoryUpdate(memory,()=>memoryAllowed&&$('aiShareHistory').checked&&sameProfile());
   $('aiCacheStatus').textContent='';
   const result=await askCoach({question,history:previous.map(m=>({role:m.role,content:m.content})),game:gamePayload,profile,stats},{token:getToken(),onStatus:say,isCancelled:()=>!!toolOptions?.onlineLocked?.()});
   if(toolOptions?.onlineLocked?.())throw Error('Ответ отменён: онлайн-партия');
   const answer=typeof result.answer==='string'?result.answer.trim():'';if(!answer)throw Error('Пустой ответ');
   const pair=[{role:'user',content:question},{role:'assistant',content:answer,parts:snapshotBoards(answer,g)}];
  if(requestKey!==memoryKey(account,contextProvider().user)){const saved=loadMemory(localStorage,requestKey,Chess);const stored=saveMemory(localStorage,requestKey,{...saved,history:[...saved.history,...pair]},Chess);switchMemory();say(stored.saved?'Ответ сохранён в предыдущем профиле.':'Не удалось сохранить ответ предыдущего профиля.');return;}
  memory=memoryUpdate.finish(memory);pendingQuestion='';history.push(...pair);const saved=persist();$('aiSummary').value=memory.summary;$('aiQuestion').value='';showHistory();say(saved?'Ответ получен.':'Ответ получен, но сохранение не удалось.');
 });
 for(const [id,k] of [['aiSummary','summary'],['aiNotes','notes'],['aiGoal','goal'],['aiFocus','focus'],['aiMinutes','minutes'],['aiPlan','plan']])$(id).onchange=()=>{if(!scopeKey||busy)return;memory[k]=k==='minutes'?Number($(id).value):$(id).value;persist();};
 document.addEventListener('jc-screen',e=>{if(['coach','account'].includes(e.detail)&&!busy){switchMemory();syncChat();}});
 document.addEventListener('jc-profile-user',()=>{if(!busy){switchMemory();syncChat();}});
 updateStudyFields();
 syncChat();action(refresh,true);
}