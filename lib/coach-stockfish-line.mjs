// Capture the principal variation from the existing UCI search, without extra searches.
import {parseScore} from './coach-runner-core.mjs';
const UCI=/^[a-h][1-8][a-h][1-8][qrbn]?$/;
const MAX_PV=8;

export function createSearchCollector(){
  let score=0,variation=null;
  return {
    push(line){
      if(line.startsWith('info ')){
        // Preserve the existing scoring behavior for game classifications.
        const s=parseScore(line);if(s!==null)score=s;
        const depth=/\bdepth (\d+)\b/.exec(line);
        const pv=/\bpv (.+)$/.exec(line);
        if(depth&&pv&&s!==null&&!/\b(?:lowerbound|upperbound)\b/.test(line)&&!(/\bmultipv (?!1\b)\d+/.test(line))){
          variation={depth:Number(depth[1]),moves:pv[1].trim().split(/\s+/).slice(0,MAX_PV)};
        }
      }
      const best=/^bestmove (\S+)/.exec(line);
      if(best)return {score,bestUci:best[1],variation};
      return undefined;
    }
  };
}

function replay(fen,moves,Chess){
  const chess=new Chess(fen),san=[];
  for(const uci of moves){
    if(typeof uci!=='string'||!UCI.test(uci))throw Error('Invalid UCI');
    const move=chess.move({from:uci.slice(0,2),to:uci.slice(2,4),...(uci.length===5?{promotion:uci[4]}:{})});
    if(!move)throw Error('Illegal move');
    san.push(move.san);
  }
  return san;
}

// Never expose an unverified continuation or associate a stale PV with another best move.
export function verifiedSearchLine(fen,search,Chess){
  if(!search||typeof search.bestUci!=='string'||!UCI.test(search.bestUci))return null;
  let bestSan;
  try{[bestSan]=replay(fen,[search.bestUci],Chess);}catch{return null;}
  const best={bestUci:search.bestUci,bestSan,pvUci:[search.bestUci],pvSan:[bestSan],depth:null,source:'bestmove'};
  const pv=search.variation;
  if(!pv||!Number.isInteger(pv.depth)||pv.depth<1||!Array.isArray(pv.moves)||pv.moves[0]!==search.bestUci)return best;
  const moves=pv.moves.slice(0,MAX_PV);
  try{return {...best,pvUci:moves,pvSan:replay(fen,moves,Chess),depth:pv.depth,source:'pv'};}catch{return best;}
}
