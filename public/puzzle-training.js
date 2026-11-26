// Local practice target, NOT a Lichess or Chess.com player rating.
export const INITIAL_TARGET=1100;
export const TOPICS={mateIn1:'Мат в один',mateIn2:'Мат в два',fork:'Вилки',pin:'Связки',hangingPiece:'Взятия',endgame:'Эндшпиль'};
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9]{5}$/.test(id);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const outcomes=['clean','assisted','skipped'];
export function normalizeTraining(raw){
 const records=[],seen=new Set();let target=INITIAL_TARGET;
 for(const r of Array.isArray(raw?.records)?raw.records:[]){
  if(!validId(r?.id)||seen.has(r.id)||!outcomes.includes(r.outcome)||!Number.isInteger(r.rating)||r.rating<400||r.rating>2999)continue;
  if(records.length>=20000)break;
  seen.add(r.id);
  const tags=Array.isArray(r.tags)?[...new Set(r.tags.filter(t=>Object.hasOwn(TOPICS,t)))]:[];
  records.push({id:r.id,rating:r.rating,outcome:r.outcome,tags});
  if(r.outcome!=='skipped'){
   const expected=1/(1+10**((r.rating-target)/400));
   target=clamp(Math.round(target+40*((r.outcome==='clean'?1:0)-expected)),400,2999);
  }
 }
 return {target,records};
}
export function recordOutcome(raw,puzzle,outcome,previouslySolved=[]){
 const state=normalizeTraining(raw);
 if(!validId(puzzle?.id)||!outcomes.includes(outcome)||previouslySolved.includes(puzzle.id)||state.records.some(r=>r.id===puzzle.id))return state;
 return normalizeTraining({records:[...state.records,{id:puzzle.id,rating:puzzle.rating,outcome,tags:puzzle.themes}]});
}
export function summarizeTraining(raw){
 const {target,records}=normalizeTraining(raw);
 let clean=0,assisted=0,skipped=0;
 const topics=Object.fromEntries(Object.keys(TOPICS).map(t=>[t,{clean:0,attempts:0}]));
 for(const r of records){
  if(r.outcome==='skipped'){skipped++;continue;}
  if(r.outcome==='clean')clean++;else assisted++;
  for(const t of r.tags){topics[t].attempts++;if(r.outcome==='clean')topics[t].clean++;}
 }
 const attempts=clean+assisted;
 return {target,attempts,clean,assisted,skipped,accuracy:attempts?Math.round(100*clean/attempts):null,topics};
}
export function selectTrainingPuzzle(rows,raw,solved,current,adaptive=true){
 const {target,records}=normalizeTraining(raw),seen=new Set([...solved,...records.map(r=>r.id)]),done=new Set(solved);
 const pool=rows.filter(p=>p.id!==current);
 const candidates=pool.length?pool:rows;
 const unseen=candidates.filter(p=>!seen.has(p.id)),unsolved=candidates.filter(p=>!done.has(p.id));
 const available=unseen.length?unseen:unsolved.length?unsolved:candidates;
 if(!available.length)return null;
 if(adaptive)return available.reduce((best,p)=>Math.abs(p.rating-target)<Math.abs(best.rating-target)?p:best);
 const index=rows.findIndex(p=>p.id===current),eligible=new Set(available.map(p=>p.id));
 return [...rows.slice(index+1),...rows.slice(0,index+1)].find(p=>eligible.has(p.id))||available[0];
}
