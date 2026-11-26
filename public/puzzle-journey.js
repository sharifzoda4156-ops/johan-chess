// Independent local XP ledger, not a chess rating.
export const ranks=['Пешка','Конь','Слон','Ладья','Ферзь','Мастер','Маэстро','Легенда'];
const idOk=id=>typeof id==='string'&&/^[A-Za-z0-9]{5}$/.test(id);
export function dayKey(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
export function dayNumber(d){if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))return NaN;const t=Date.parse(d+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===d?t/86400000:NaN;}
export const shiftDay=(d,n)=>new Date((dayNumber(d)+n)*86400000).toISOString().slice(0,10);
export function dailyOrder(rows,day){
 const n=dayNumber(day);if(!Number.isFinite(n))return [];
 const sorted=[...new Map(rows.filter(p=>idOk(p?.id)).map(p=>[p.id,p])).values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 if(!sorted.length)return [];const i=((n%sorted.length)+sorted.length)%sorted.length;return [...sorted.slice(i),...sorted.slice(0,i)];
}
export function normalizeDaily(raw){
 const records={};for(const [d,r] of Object.entries(raw?.records||{}))if(Number.isFinite(dayNumber(d))&&idOk(r?.id)&&Number.isFinite(r.seconds)&&r.seconds>=0&&Number.isInteger(r.hearts)&&r.hearts>=0&&r.hearts<=5)records[d]={id:r.id,seconds:Math.min(86400,Math.round(r.seconds)),hearts:r.hearts};
 return {records};
}
export function completeDaily(raw,day,result){const s=normalizeDaily(raw);if(s.records[day])return s;return normalizeDaily({records:{...s.records,[day]:result}});}
export function dailyStreak(raw,today){if(!Number.isFinite(dayNumber(today)))return 0;const {records}=normalizeDaily(raw);let d=records[today]?today:shiftDay(today,-1),n=0;while(records[d]){n++;d=shiftDay(d,-1);}return n;}
export function normalizeJourney(raw){
 const records=[],seen=new Set();let xp=0;
 for(const r of Array.isArray(raw?.records)?raw.records:[]){
  if(!idOk(r?.id)||seen.has(r.id)||!Number.isFinite(dayNumber(r.day))||!Number.isInteger(r.rating)||r.rating<0||r.rating>9999||!Number.isInteger(r.points)||r.points<1||r.points>150||!Number.isFinite(r.seconds)||r.seconds<0)continue;
  if(records.length>=50000)break;seen.add(r.id);records.push({id:r.id,day:r.day,rating:r.rating,points:r.points,seconds:Math.min(86400,Math.round(r.seconds))});xp+=r.points;
 }
 const bounded=n=>Number.isInteger(n)?Math.max(0,Math.min(records.length,n)):0;
 const streak=bounded(raw?.streak);return {xp,records,streak,bestStreak:Math.max(streak,bounded(raw?.bestStreak))};
}
export const levelCost=n=>80+Math.max(0,n-1)*12+Math.floor((n-1)/20)*40;
export function journeyLevel(xp){let rest=Math.max(0,Number.isFinite(xp)?Math.floor(xp):0),level=1;while(level<160&&rest>=levelCost(level)){rest-=levelCost(level);level++;}const cost=levelCost(level),rank=Math.floor((level-1)/20);return {level,rank,name:ranks[rank],position:(level-1)%20+1,cost,progress:Math.min(rest,cost),maxed:level===160&&rest>=cost};}
export function targetSeconds(p,target){return Math.max(15,Math.min(120,Math.round(18+12*Math.max(1,Math.ceil((p.solution?.length||1)/2))+4*Math.max(-4,Math.min(8,(p.rating-target)/100)))));}
export function breakJourney(raw){return {...normalizeJourney(raw),streak:0};}
export function rewardJourney(raw,p,{day,seconds,target,clean}){
 const s=normalizeJourney(raw);
 if(!clean)return {state:breakJourney(s),reward:null};
 if(!idOk(p?.id)||!Number.isFinite(dayNumber(day))||!Number.isFinite(seconds)||seconds<0||!Number.isFinite(target)||!Number.isInteger(p.rating)||p.rating<0||p.rating>9999||s.records.some(r=>r.id===p.id)||s.records.length>=50000)return {state:s,reward:null};
 const delta=p.rating-target,base=delta>=200?30:delta>=-100?22:15,limit=targetSeconds(p,target),speed=seconds<=limit/2?10:seconds<=limit?5:0;
 const streak=s.streak+1,series=streak>=2?Math.min(10,streak-1):0,daily=s.records.filter(r=>r.day===day).length===2?20:0,record=s.records.length&&p.rating>s.records.reduce((a,r)=>Math.max(a,r.rating),0)?10:0,milestone=(s.records.length+1)%50===0?25:0;
 const points=base+speed+series+daily+record+milestone;
 return {state:normalizeJourney({records:[...s.records,{id:p.id,day,rating:p.rating,points,seconds}],streak,bestStreak:Math.max(streak,s.bestStreak)}),reward:{points,base,speed,series,daily,record,milestone}};
}
export function formatDuration(n){n=Math.max(0,Math.floor(Number(n)||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');}
export function createPuzzleTimer(now=()=>performance.now()){let total=0,since=null;return {reset(){total=0;since=null;},resume(){if(since===null)since=now();},pause(){if(since!==null){total+=Math.max(0,now()-since);since=null;}},seconds(){return (total+(since===null?0:Math.max(0,now()-since)))/1000;}};}
