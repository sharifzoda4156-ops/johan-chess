// Own transparent metrics; not Chess.com accuracy or Brilliant algorithm.
export function scoreValue(s){return s.kind==='mate'?(s.value===0?-100000:Math.sign(s.value)*(100000-Math.min(Math.abs(s.value),999))):s.value;}
export function winChance(s){if(s.kind==='mate')return scoreValue(s)>0?100:0;return 100/(1+Math.exp(-0.00368208*s.value));}
export function evaluateMove(best,actual,isBest=false){
 const loss=isBest?0:Math.max(0,winChance(best)-winChance(actual));
 const label=isBest?'Лучший':loss<2?'Отличный':loss<5?'Хороший':loss<10?'Неточность':loss<20?'Ошибка':'Грубая ошибка';
 return {loss,label,accuracy:Math.min(100,Math.max(0,103.1668*Math.exp(-0.04354*loss)-3.1668))};
}
export function parseInfo(line){
 if(!line.startsWith('info ')||/\b(?:upperbound|lowerbound)\b/.test(line))return null;
 const score=line.match(/\bscore (cp|mate) (-?\d+)/),depth=line.match(/\bdepth (\d+)/),pv=line.match(/\bpv (.+)$/);
 return score&&depth&&pv?{score:{kind:score[1],value:Number(score[2])},depth:Number(depth[1]),pv:pv[1].trim().split(/\s+/)}:null;
}
export function displayScore(s){if(!s)return '—';return s.kind==='mate'?(s.value===0?'Мат':(s.value>0?'+':'−')+'M'+Math.abs(s.value)):(s.value>0?'+':'')+(s.value/100).toFixed(2);}
