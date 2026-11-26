// Independent speed tactics: no rating/XP changes, one point per unique solved puzzle.
export const MODES=Object.freeze({'3':180,'5':300,survival:null});
export const validMode=m=>Object.hasOwn(MODES,m);
const idOk=id=>typeof id==='string'&&/^[A-Za-z0-9]{5}$/.test(id);
export function difficulty(score){return Math.min(2800,600+Math.max(0,Math.floor(score))*65);}
export function pickRush(rows,seen,score,random=Math.random){
 const target=difficulty(score),pool=rows.filter(p=>idOk(p?.id)&&Number.isInteger(p.rating)&&p.rating>=400&&p.rating<=2999&&!seen.has(p.id));
 if(!pool.length)return null;
 const distance=p=>Math.abs(p.rating-target);
 let best=Infinity;for(const p of pool)best=Math.min(best,distance(p));
 const near=pool.filter(p=>distance(p)<=best+75);
 return near[Math.max(0,Math.min(near.length-1,Math.floor(random()*near.length)))];
}
export function createRush(mode,start){
 if(!validMode(mode)||!Number.isFinite(start))throw Error('Invalid rush');
 return {mode,start,score:0,mistakes:0,entries:[],end:null,reason:null,pausedAt:null,pausedMs:0};
}
// Rest time is excluded only between completed puzzles. A live puzzle
// continues to consume time, including when the app is in the background.
export function elapsedRush(run,now){return Math.max(0,(run.end??run.pausedAt??now)-run.start-run.pausedMs);}
export function remainingRush(run,now){const limit=MODES[run.mode];return limit===null?null:Math.max(0,limit*1000-elapsedRush(run,now));}
export function endRush(run,now,reason){
 if(run.end!==null)return run;
 const limit=MODES[run.mode],deadline=limit===null?Infinity:run.start+run.pausedMs+limit*1000;
 const effective=run.pausedAt??now,end=Math.max(run.start,Math.min(effective,deadline));
 return {...run,end,reason:effective>=deadline?'time':reason};
}
export function checkRush(run,now){return run.end===null&&remainingRush(run,now)===0?endRush(run,now,'time'):run;}
export function pauseRush(run,now){
 const s=checkRush(run,now);
 return s.end!==null||s.pausedAt!==null?s:{...s,pausedAt:Math.max(s.start+s.pausedMs,now)};
}
export function resumeRush(run,now){
 if(run.end!==null||run.pausedAt===null)return run;
 return {...run,pausedMs:run.pausedMs+Math.max(0,now-run.pausedAt),pausedAt:null};
}
export function recordRush(run,puzzle,correct,now){
 let s=checkRush(run,now);
 if(s.end!==null||s.pausedAt!==null||!idOk(puzzle?.id)||!Number.isInteger(puzzle.rating)||puzzle.rating<0||puzzle.rating>9999||s.entries.some(e=>e.id===puzzle.id))return s;
 s={...s,score:s.score+(correct?1:0),mistakes:s.mistakes+(correct?0:1),entries:[...s.entries,{id:puzzle.id,rating:puzzle.rating,correct:!!correct}]};
 return s.mistakes>=3?endRush(s,now,'mistakes'):s;
}
export function normalizeRushHistory(raw){
 const runs=[];
 for(const r of Array.isArray(raw?.runs)?raw.runs:[]){
  if(!validMode(r?.mode)||!Number.isFinite(r.date)||!Number.isFinite(r.seconds)||r.seconds<0||!['time','mistakes','exhausted','stopped'].includes(r.reason)||!Array.isArray(r.entries))continue;
  const seen=new Set(),entries=[];let mistakes=0;
  for(const e of r.entries){
   if(!idOk(e?.id)||seen.has(e.id)||typeof e.correct!=='boolean'||!Number.isInteger(e.rating)||e.rating<0||e.rating>9999)continue;
   if(entries.length>=10000||mistakes>=3)break;
   seen.add(e.id);entries.push({id:e.id,rating:e.rating,correct:e.correct});if(!e.correct)mistakes++;
  }
  runs.push({mode:r.mode,date:r.date,seconds:Math.floor(r.seconds),reason:r.reason,entries,score:entries.length-mistakes,mistakes});
  if(runs.length>=90)break;
 }
 const best={ '3':0,'5':0,survival:0 };
 for(const m of Object.keys(best)){const n=raw?.best?.[m];if(Number.isSafeInteger(n)&&n>=0&&n<=10000)best[m]=n;}
 for(const r of runs)if(r.reason!=='stopped')best[r.mode]=Math.max(best[r.mode],r.score);
 return {runs,best};
}
export function saveRushHistory(raw,run,date){
 const s=normalizeRushHistory(raw);
 if(run.end===null)return s;
 return normalizeRushHistory({best:s.best,runs:[{mode:run.mode,date,seconds:elapsedRush(run,run.end)/1000,reason:run.reason,entries:run.entries},...s.runs]});
}
