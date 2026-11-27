// Whitelist aggregate training data only. Never include names, IDs, PGN or raw history.
import {TOPICS} from './puzzle-training.js';
const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000?n:null;
export function normalizeCoachStats(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const out={};
  const p=raw.puzzles;
  if(p&&typeof p==='object'){
    const attempts=count(p.attempts),clean=count(p.clean),assisted=count(p.assisted),skipped=count(p.skipped);
    if([attempts,clean,assisted,skipped].every(n=>n!==null)&&clean+assisted===attempts&&Number.isInteger(p.target)&&p.target>=400&&p.target<=2999){
      const topics={};
      for(const t of Object.keys(TOPICS)){
        const a=count(p.topics?.[t]?.attempts),c=count(p.topics?.[t]?.clean);
        if(a!==null&&c!==null&&c<=a&&a<=attempts)topics[t]={attempts:a,clean:c};
      }
      out.puzzles={attempts,clean,assisted,skipped,target:p.target,accuracy:attempts?Math.round(100*clean/attempts):null,topics};
    }
  }
  const g=raw.games;
  if(g&&typeof g==='object'){
    const played=count(g.played),wins=count(g.wins),draws=count(g.draws),losses=count(g.losses),reviewed=count(g.reviewed);
    if([played,wins,draws,losses,reviewed].every(n=>n!==null)&&wins+draws+losses===played){
      const accuracy=reviewed>0&&typeof g.accuracy==='number'&&Number.isFinite(g.accuracy)&&g.accuracy>=0&&g.accuracy<=100?Math.round(g.accuracy*10)/10:null;
      out.games={played,wins,draws,losses,reviewed,accuracy};
    }
  }
  return Object.keys(out).length?out:null;
}
