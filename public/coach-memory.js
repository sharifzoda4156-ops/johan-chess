// Only app-owned memory. Never use names or email addresses as identity keys.
export const memoryKey=(account,user)=>/^[a-f0-9]{64}$/.test(account||'')?'jc-study-v1:'+account+':'+encodeURIComponent(String(user||'').trim().toLowerCase()):null;
const MAX_HISTORY=100,MAX_BYTES=750000;
const cut=(s,n)=>typeof s==='string'?s.slice(0,n):'';
const square=s=>typeof s==='string'&&/^[a-h][1-8]$/.test(s);
function cleanCard(b,Chess){
 if(!b||typeof b.fen!=='string'||!['w','b'].includes(b.orientation))return null;
 try{
  const c=new Chess(b.fen),out={fen:c.fen(),orientation:b.orientation,historical:b.historical===true,label:cut(b.label,100),classification:cut(b.classification,100)};
  for(const name of ['played','best']){
   const m=b[name];if(!square(m?.from)||!square(m?.to)||typeof m.fen!=='string')return null;
   const position=new Chess(m.fen);
   const possible=c.moves({verbose:true}).find(x=>x.from===m.from&&x.to===m.to&&x.after===position.fen());
   if(!possible)return null;
   out[name]={fen:position.fen(),from:possible.from,to:possible.to,san:possible.san};
  }
  return out;
 }catch{return null;}
}
export function normalizeMemory(raw,Chess){
 const r=raw&&typeof raw==='object'?raw:{};
 const history=[];let bytes=0;
 // Keep complete user/assistant pairs only, newest first for bounded persistence.
 const rows=Array.isArray(r.history)?r.history:[];
 for(let i=rows.length-2;i>=0&&history.length<MAX_HISTORY;i-=2){
  const a=rows[i],b=rows[i+1];
  if(a?.role!=='user'||b?.role!=='assistant'||typeof a.content!=='string'||typeof b.content!=='string')continue;
  const user={role:'user',content:cut(a.content,4000)},assistant={role:'assistant',content:cut(b.content,64000)};
  if(!user.content.trim()||!assistant.content.trim())continue;
  if(Array.isArray(b.parts)){
   let cards=0;const parts=[];
   for(const part of b.parts.slice(0,32)){
    if(typeof part?.text==='string')parts.push({text:cut(part.text,64000)});
    else if(part?.board&&cards<3){const board=cleanCard(part.board,Chess);if(board){parts.push({board});cards++;}else parts.push({text:'[Сохранённая позиция недоступна]'});}
   }
   assistant.parts=parts;
  }
  const pair=[user,assistant],size=JSON.stringify(pair).length*2;if(bytes+size>MAX_BYTES)break;
  bytes+=size;history.unshift(...pair);
 }
 return {history,notes:cut(r.notes,3000),goal:cut(r.goal,300),focus:cut(r.focus,500),minutes:[15,30,45,60,90,120].includes(r.minutes)?r.minutes:60,plan:cut(r.plan,4000),shareHistory:r.shareHistory!==false,summary:cut(r.summary,2400),summaryPending:Number.isSafeInteger(r.summaryPending)?Math.max(0,Math.min(100,r.summaryPending)):0};
}
export function loadMemory(storage,key,Chess){
 if(!key)return normalizeMemory(null,Chess);
 try{return normalizeMemory(JSON.parse(storage.getItem(key)||'null'),Chess);}catch{return normalizeMemory(null,Chess);}
}
export function saveMemory(storage,key,memory,Chess){
 const clean=normalizeMemory(memory,Chess);
 if(!key)return {memory:clean,saved:false};
 try{storage.setItem(key,JSON.stringify(clean));return {memory:clean,saved:true};}catch{return {memory:clean,saved:false};}
}
export function recentConversation(history,enabled){
 if(!enabled)return [];
 const rows=history.slice(-12);let used=0;const out=[];
 // Do not send historical board snapshots or incomplete turns.
 for(let i=rows.length-2;i>=0;i-=2){
  const pair=rows.slice(i,i+2).map(m=>({role:m.role,content:cut(m.content,16000)}));
  const n=pair.reduce((sum,m)=>sum+m.content.length,0);if(used+n>48000)break;
  used+=n;out.unshift(...pair);
 }
 return out;
}

export function shouldCompact(memory,history){
 return memory.shareHistory!==false&&(memory.summaryPending>=5||(!memory.summary&&history.length>=10));
}
export function coachHistory(memory,history){
 if(memory.shareHistory===false)return [];
 const rows=history.slice(-(shouldCompact(memory,history)?12:8));let chars=0;const out=[];
 for(let i=rows.length-2;i>=0;i-=2){
  const pair=rows.slice(i,i+2).map(m=>({role:m.role,content:cut(m.content,3000)}));
  const n=pair.reduce((s,m)=>s+m.content.length,0);if(chars+n>12000)break;chars+=n;out.unshift(...pair);
 }return out;
}
export function splitCoachAnswer(answer,requested){
 const m=String(answer||'').match(/\n?\[\[memory_update\]\]([\s\S]*?)\[\[\/memory_update\]\]\s*$/);
 if(!m)return {answer:String(answer||''),summary:null};
 const body=answer.slice(0,m.index).trim(),summary=m[1].trim();
 return {answer:body,summary:requested&&body&&summary&&summary.length<=2400?summary:null};
}
export function recordCoachTurn(memory,summary){
 if(!memory.shareHistory)return memory;
 return {...memory,summary:summary===null?memory.summary:summary,summaryPending:summary===null?Math.min(100,memory.summaryPending+1):0};
}
