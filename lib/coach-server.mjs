import {homedir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,chmod,open,unlink} from 'node:fs/promises';
import {unlinkSync} from 'node:fs';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {RESOURCE,ISSUER,PLAN,random,beginAuth,checkCallback,planEnabled,isLocalRequest,requestBody,consumeResponse} from './coach-core.mjs';
const TOKEN=ISSUER+'/api/accounts/oauth/token';
const jwks=createRemoteJWKSet(new URL(ISSUER+'/.well-known/jwks.json'));
const unusable=new Set(['invalid_grant','invalid_refresh_token','token_expired','refresh_token_expired','refresh_token_invalidated','refresh_token_reused']);
const clear=p=>({client_id:p.client_id,subject:p.subject,email:p.email,scopes:[],issuer:ISSUER});
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
async function readJSON(req){
 let bytes=0;const chunks=[];for await(const c of req){bytes+=c.length;if(bytes>350000)throw Error('Запрос слишком большой.');chunks.push(c);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
}
function errorCode(v){const s=typeof v==='string'?v:v?.code;return typeof s==='string'&&/^[a-zA-Z0-9_.-]{1,100}$/.test(s)?s:'unknown_error';}
async function checkedFetch(url,options={},timeout=30000){
 const r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(timeout)});
 if(!r.ok){let data;try{data=await r.json();}catch{}const code=errorCode(data?.error);const err=Error('OpenAI HTTP '+r.status+' ('+code+').');err.code=code;err.status=r.status;err.requestId=r.headers.get('x-request-id');throw err;}
 return r;
}
async function token(params){return (await checkedFetch(TOKEN,{method:'POST',body:new URLSearchParams(params)})).json();}
async function verify(id,client,nonce){
 const {payload}=await jwtVerify(id,jwks,{issuer:ISSUER,audience:client,requiredClaims:['exp','sub','iat'],clockTolerance:5});
 if(typeof payload.sub!=='string'||!payload.sub||(nonce!==undefined&&payload.nonce!==nonce)||(Array.isArray(payload.aud)&&payload.aud.length>1&&payload.azp!==client))throw Error('Не удалось проверить личность ChatGPT.');
 return payload;
}
function credentials(t,client,identity,previous){
 if(typeof t.access_token!=='string'||String(t.token_type).toLowerCase()!=='bearer'||!Number.isFinite(t.expires_in)||t.expires_in<=0)throw Error('Неверный ответ авторизации.');
 const scopes=typeof t.scope==='string'?t.scope.split(/\s+/).filter(Boolean):previous?.scopes||[];
 if(scopes.includes(PLAN)&&typeof t.refresh_token!=='string')throw Error('Отсутствует токен обновления.');
 return {client_id:client,issuer:ISSUER,subject:identity.sub,email:typeof identity.email==='string'?identity.email:previous?.email||'',access_token:t.access_token,refresh_token:t.refresh_token||'',id_token:t.id_token||previous?.id_token||'',scopes,expires:Date.now()+t.expires_in*1000};
}
export async function createCoach({host,port,enabled}){
 // Never expose subscription credentials on a shared/LAN/web server.
 if(!enabled||host!=='127.0.0.1'||!Number.isInteger(port)||port<1||port>65535)return null;
 const dir=join(homedir(),'.johan-chess'),path=join(dir,'chatgpt.json'),lock=join(dir,'coach.lock');
 await mkdir(dir,{recursive:true,mode:0o700});await chmod(dir,0o700);
 let handle;
 try{handle=await open(lock,'wx',0o600);}catch{throw Error('Johan Chess AI уже запущен или остался coach.lock. Удаляй lock только после остановки всех экземпляров.');}
 await handle.close();process.once('exit',()=>{try{unlinkSync(lock);}catch{}});
 let db;
 try{db=JSON.parse(await readFile(path,'utf8'));await chmod(path,0o600);}catch(e){if(e.code!=='ENOENT'){await unlink(lock);throw e;}db={hostId:'urn:uuid:'+randomUUID(),active:null,profiles:{}};}
 async function save(next){
  const tmp=path+'.'+random()+'.tmp';
  try{await writeFile(tmp,JSON.stringify(next),{mode:0o600,flag:'wx'});await rename(tmp,path);db=next;}finally{await unlink(tmp).catch(()=>{});}
 }
 await save(db);
 const profile=()=>db.active&&db.profiles[db.active];
 const setProfile=async p=>save({...db,active:p.client_id,profiles:{...db.profiles,[p.client_id]:p}});
 let pending=null,working=false,notice='',models=[],modelOwner='',browserSession=random();
 const cookieName='jc_coach_session';
 const hasSession=req=>(req.headers.cookie||'').split(';').some(s=>s.trim()===cookieName+'='+browserSession);
 const status=()=>({enabled:true,active:db.active,profiles:Object.values(db.profiles).map(p=>({id:p.client_id,email:p.email,connected:Boolean(p.access_token),sharing:planEnabled(p)})),sharing:planEnabled(profile()),notice});
 async function access(){
  let p=profile();if(!planEnabled(p))throw Error('Сначала разреши использование подписки ChatGPT.');
  if(p.expires>Date.now()+60000)return p.access_token;
  try{
   const t=await token({grant_type:'refresh_token',client_id:p.client_id,refresh_token:p.refresh_token,resource:RESOURCE});
   const identity=t.id_token?await verify(t.id_token,p.client_id):{sub:p.subject,email:p.email};
   if(identity.sub!==p.subject)throw Error('Учётная запись изменилась.');
   p=credentials(t,p.client_id,identity,p);await setProfile(p);
  }catch(e){if(unusable.has(e.code))await setProfile(clear(p));throw e;}
  if(!planEnabled(p))throw Error('Разрешение на использование плана отозвано.');
  return p.access_token;
 }
 async function getModels(){
  const bearer=await access();
  const data=await (await checkedFetch(RESOURCE+'/models',{headers:{Authorization:'Bearer '+bearer}})).json();
  models=(data.models||[]).filter(m=>m.visibility==='list'&&typeof m.slug==='string').map(m=>({slug:m.slug,name:m.display_name||m.slug}));
  modelOwner=db.active;return models;
 }
 async function revoke(p){
  if(!p?.refresh_token)return true;
  try{
   const data=await(await checkedFetch(ISSUER+'/.well-known/openid-configuration')).json();
   const endpoint=new URL(data.revocation_endpoint);if(endpoint.origin!==ISSUER||data.issuer!==ISSUER)throw Error('Некорректный endpoint отзыва.');
   await checkedFetch(endpoint.href,{method:'POST',body:new URLSearchParams({token:p.refresh_token,token_type_hint:'refresh_token',client_id:p.client_id})});return true;
  }catch{return false;}
 }
 return async function route(req,res,u){
  const callback=u.pathname==='/auth/callback',api=u.pathname.startsWith('/api/coach/');
  if(!callback&&!api)return false;
  const mutating=req.method==='POST';
  if(!isLocalRequest(req,port,mutating)){json(res,403,{error:'Тренер доступен только на этом устройстве (127.0.0.1).'});return true;}
  if(u.pathname==='/api/coach/status'&&req.method==='GET'&&req.headers['x-johan-coach']==='1'){
   res.setHeader('Set-Cookie',cookieName+'='+browserSession+'; Path=/; HttpOnly; SameSite=Lax');json(res,200,status());return true;
  }
  if(!hasSession(req)||(!callback&&!mutating)){json(res,403,{error:'Открой Johan Chess заново.'});return true;}
  if(working){json(res,409,{error:'Тренер занят. Повтори после завершения.'});return true;}
  working=true;
  try{
   if(callback){
    if(req.method!=='GET')throw Error('Неверный метод.');
    const a=pending;pending=null;
    const {client,code}=checkCallback(a,u.searchParams);
    // Preserve an issued registration if exchange fails, but never attach tokens without verified identity.
    if(!db.profiles[client])await save({...db,profiles:{...db.profiles,[client]:{client_id:client,scopes:[],email:''}}});
    const t=await token({grant_type:'authorization_code',client_id:client,code,code_verifier:a.verifier,redirect_uri:a.redirect,resource:RESOURCE});
    const identity=await verify(t.id_token,client,a.nonce),old=db.profiles[client];
    if(old.subject&&old.subject!==identity.sub)throw Error('Выбрана другая учётная запись.');
    await setProfile(credentials(t,client,identity));models=[];modelOwner='';
    notice=planEnabled(profile())?'Подписка ChatGPT подключена. Запросы расходуют доступный лимит.':'Вход выполнен, но разрешение на использование подписки не предоставлено.';
    res.writeHead(303,{Location:'/', 'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();return true;
   }
   const body=await readJSON(req);
   switch(u.pathname){
    case '/api/coach/login':{
     const p=body.id?db.profiles[body.id]:null;if(body.id&&!p)throw Error('Профиль не найден.');
     const {attempt,url}=beginAuth(db.hostId,'http://127.0.0.1:'+port+'/auth/callback',p,Boolean(body.consent&&p&&!planEnabled(p)));
     pending=attempt;notice='';json(res,200,{url});break;
    }
    case '/api/coach/select':{
     if(pending&&pending.expires>Date.now())throw Error('Сначала заверши вход.');
     if(!db.profiles[body.id])throw Error('Профиль не найден.');
     await save({...db,active:body.id});models=[];modelOwner='';notice='';json(res,200,status());break;
    }
    case '/api/coach/logout':{
     pending=null;const p=profile();if(p){const ok=await revoke(p);await setProfile(clear(p));notice=ok?'Выход выполнен.':'Локальный выход выполнен; удалённый отзыв не подтверждён. Отключи приложение в настройках ChatGPT.';}
     models=[];modelOwner='';json(res,200,status());break;
    }
    case '/api/coach/models':json(res,200,{models:await getModels()});break;
    case '/api/coach/ask':{
     if(body.account!==db.active||modelOwner!==db.active||!models.some(m=>m.slug===body.model))throw Error('Профиль или модель изменились. Обнови список моделей.');
     const payload=requestBody(body.model,body.context,body.history,body.question),bearer=await access();
     const r=await checkedFetch(RESOURCE+'/responses',{method:'POST',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:JSON.stringify(payload)},180000);
     const answer=await consumeResponse(r.body);json(res,200,{answer});break;
    }
    default:json(res,404,{error:'Не найдено'});
   }
  }catch(e){
   const message=e.code==='subscription_sharing_usage_limit_exceeded'?'Достигнут лимит ChatGPT. Проверь настройки использования.':e.message;
   const safe=String(message||'Ошибка подключения').slice(0,250);
   if(callback){notice=safe;res.writeHead(303,{Location:'/', 'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();}
   else json(res,e.status===429||e.code==='subscription_sharing_usage_limit_exceeded'?429:400,{error:safe,code:errorCode(e.code),requestId:e.requestId||undefined});
  }finally{working=false;}
  return true;
 };
}
