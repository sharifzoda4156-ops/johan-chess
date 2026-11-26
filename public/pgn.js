// PGN helpers: normalization, multi-game splitting and export with Stockfish annotations.

export function normalizePgn(text){
  return String(text??'').replace(/[\uFEFF\0]/g,'').replace(/\r\n?/g,'\n').trim();
}

const TAG=/^\s*\[[A-Za-z0-9_]+\s+"/;

// A new game starts at a [Tag "..."] line that follows movetext lines.
export function splitPgn(text){
  const games=[];let cur=[],seenMoves=false;
  for(const line of normalizePgn(text).split('\n')){
    if(TAG.test(line)){
      if(seenMoves){games.push(cur.join('\n'));cur=[];seenMoves=false;}
    }else if(line.trim()&&!line.startsWith('%'))seenMoves=true;
    cur.push(line);
  }
  games.push(cur.join('\n'));
  return games.map(g=>g.trim()).filter(Boolean);
}

// Evaluation from White's point of view: pawns with two decimals, mate as #N.
function evalText(score,color){
  const sign=color==='w'?1:-1;
  if(score.kind==='mate')return '#'+(score.value*sign);
  const v=Math.round(score.value*sign)/100;
  return (Object.is(v,-0)||v===0?0:v).toFixed(2);
}

const esc=v=>String(v).replace(/\\/g,'\\\\').replace(/"/g,'\\"');
const ROSTER=['Event','Site','Date','Round','White','Black','Result'];

export function buildPgn({headers={},moves=[],results=[],depth}={}){
  const h={...headers};
  if(results.length&&depth!==undefined)h.Annotator=`Johan Chess (Stockfish, depth ${depth})`;
  const lines=[];
  const keys=[...ROSTER.filter(k=>k in h),...Object.keys(h).filter(k=>!ROSTER.includes(k))];
  for(const k of keys)lines.push(`[${k} "${esc(h[k])}"]`);
  const tokens=[];let afterComment=true;
  moves.forEach((m,i)=>{
    const num=Number(m.before.split(' ')[5])||1;
    if(m.color==='w')tokens.push(`${num}.`);
    else if(afterComment)tokens.push(`${num}...`);
    const r=results[i];
    if(!r){tokens.push(m.san);afterComment=false;return;}
    const loss=r.loss||0;
    const mark=loss>=20?'??':loss>=10?'?':loss>=5?'?!':'';
    let c=`[%eval ${evalText(r.playedScore,m.color)}]`;
    if(loss>=5&&r.bestSan)c+=` Best: ${r.bestSan}`;
    tokens.push(m.san+mark,`{${c.replace(/[{}]/g,'')}}`);
    afterComment=true;
  });
  const result=h.Result||'*';
  tokens.push(result);
  return lines.join('\n')+(lines.length?'\n\n':'')+tokens.join(' ')+'\n';
}
