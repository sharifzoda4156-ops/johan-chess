// Unified coach client (Web + Android WebView): dispatches the GitHub Actions "Coach runner" workflow
// with a fine-grained PAT (Actions: read/write) and reads the answer from the job annotation.
export const COACH_REPO='sharifzoda4156-ops/johan-chess';
export const COACH_WORKFLOW='coach-runner.yml';
export const COACH_REF='main';
const TOKEN_KEY='jc-coach-pat';
export const ANSWER_PREFIX='coach-answer:';
export const tokenOk=t=>typeof t==='string'&&/^(github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})$/.test(t.trim());
export function getToken(storage=globalThis.localStorage){try{return storage.getItem(TOKEN_KEY)||'';}catch{return '';}}
export function setToken(t,storage=globalThis.localStorage){try{t?storage.setItem(TOKEN_KEY,t.trim()):storage.removeItem(TOKEN_KEY);return true;}catch{return false;}}
export function newRequestId(rand=()=>Math.random().toString(36).slice(2)){return ('c'+Date.now().toString(36)+rand()+rand()).replace(/[^A-Za-z0-9]/g,'').slice(0,40);}
export function encodePayload(p){
  const bytes=new TextEncoder().encode(JSON.stringify(p));let s='';for(const b of bytes)s+=String.fromCharCode(b);
  const b64=btoa(s);if(b64.length>60000)throw Error('Слишком большой контекст. Отключи отправку партии.');return b64;
}
export function decodeAnswer(message){
  if(typeof message!=='string'||!message.startsWith(ANSWER_PREFIX))return null;
  const bin=atob(message.slice(ANSWER_PREFIX.length).trim()),bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function askCoach(payload,{token,fetcher=globalThis.fetch.bind(globalThis),onStatus=()=>{},sleeper=sleep,repo=COACH_REPO,ref=COACH_REF,id=newRequestId(),pollMs=4000,findTimeoutMs=90000,runTimeoutMs=1500000,isCancelled=()=>false}={}){
  if(!tokenOk(token))throw Error('Нужен токен GitHub (fine-grained, право Actions: Read and write).');
  const api=async(path,init={})=>{
    const r=await fetcher('https://api.github.com/repos/'+repo+path,{...init,headers:{accept:'application/vnd.github+json','x-github-api-version':'2022-11-28',authorization:'Bearer '+token.trim(),...(init.body?{'content-type':'application/json'}:{})}});
    if(r.status===401||r.status===403)throw Error('GitHub отклонил токен (проверь срок действия и право Actions).');
    if(r.status===404)throw Error('Репозиторий или workflow не найден: проверь токен и ветку '+ref+'.');
    if(!r.ok)throw Error('GitHub API '+r.status);
    return r.status===204?null:r.json();
  };
  const check=()=>{if(isCancelled())throw Error('Запрос отменён.');};
  onStatus('Отправляю запрос тренеру…');
  await api('/actions/workflows/'+COACH_WORKFLOW+'/dispatches',{method:'POST',body:JSON.stringify({ref,inputs:{request_id:id,payload_b64:encodePayload(payload)}})});
  let run=null;const t0=Date.now();
  while(!run){
    check();if(Date.now()-t0>findTimeoutMs)throw Error('Запуск не появился в GitHub Actions.');
    await sleeper(pollMs);
    const d=await api('/actions/workflows/'+COACH_WORKFLOW+'/runs?event=workflow_dispatch&per_page=30');
    run=(d.workflow_runs||[]).find(r=>r.display_title==='coach '+id||(r.name||'').includes(id))||null;
  }
  onStatus('Тренер запускается (первый запуск может занять несколько минут)…');
  const t1=Date.now();
  for(;;){
    check();if(Date.now()-t1>runTimeoutMs)throw Error('Время ожидания ответа истекло.');
    const r=await api('/actions/runs/'+run.id);
    if(r.status==='completed'){run={...run,...r,id:run.id};break;}
    onStatus(r.status==='in_progress'?'Тренер анализирует…':'Ожидаю раннер GitHub…');
    await sleeper(pollMs);
  }
  const jobs=(await api('/actions/runs/'+run.id+'/jobs')).jobs||[];
  for(const job of jobs){
    const notes=await api('/check-runs/'+job.id+'/annotations?per_page=50');
    for(const n of notes||[]){
      let a=null;try{a=decodeAnswer(n.message);}catch{}
      if(a&&a.request_id===id){if(!a.ok)throw Error(a.error||'Ошибка раннера');return {answer:a.answer,usage:a.usage||null,runUrl:run.html_url};}
    }
  }
  throw Error(run.conclusion==='success'?'Ответ не найден в результатах запуска.':'Запуск завершился с ошибкой ('+run.conclusion+').');
}
