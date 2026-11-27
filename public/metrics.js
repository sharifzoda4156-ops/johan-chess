// Transparent Game Review metrics inspired by Chess.com Classification V2 (Expected Points + Sacrifice/MultiPV detection).
export const MOVE_CLASSES=Object.freeze([
 {kind:'brilliant',symbol:'!!',label:'Блестящий'},
 {kind:'great',symbol:'!',label:'Отличный ход'},
 {kind:'best',symbol:'★',label:'Лучший'},
 {kind:'excellent',symbol:'👍',label:'Прекрасный'},
 {kind:'good',symbol:'✓',label:'Хороший'},
 {kind:'book',symbol:'📖',label:'Теория'},
 {kind:'inaccuracy',symbol:'?!',label:'Неточность'},
 {kind:'mistake',symbol:'?',label:'Ошибка'},
 {kind:'miss',symbol:'✖',label:'Упущение'},
 {kind:'blunder',symbol:'??',label:'Зевок'}
]);
export const MOVE_CLASS_MAP=Object.freeze(Object.fromEntries(MOVE_CLASSES.map(c=>[c.kind,c])));
export const isKeyClass=kind=>['brilliant','great','mistake','miss','blunder'].includes(kind);

const PIECE_VALUES={p:1,n:3,b:3,r:5,q:9,k:0};

export function scoreValue(s){return s.kind==='mate'?(s.value===0?-100000:Math.sign(s.value)*(100000-Math.min(Math.abs(s.value),999))):s.value;}
export function winChance(s){if(s.kind==='mate')return scoreValue(s)>0?100:0;return 100/(1+Math.exp(-0.00368208*s.value));}

export function evaluateMove(best,actual,isBest=false){
 const loss=isBest?0:Math.max(0,winChance(best)-winChance(actual));
 const label=isBest?'Лучший':loss<2?'Отличный':loss<5?'Хороший':loss<10?'Неточность':loss<20?'Ошибка':'Грубая ошибка';
 return {loss,label,accuracy:Math.min(100,Math.max(0,103.1668*Math.exp(-0.04354*loss)-3.1668))};
}

export function materialBalance(chess,color){
 let mine=0,theirs=0;
 for(const row of chess.board()){
  for(const p of row){
   if(!p)continue;
   const v=PIECE_VALUES[p.type]||0;
   if(p.color===color)mine+=v;else theirs+=v;
  }
 }
 return mine-theirs;
}

// Detect a genuine piece or exchange sacrifice (>= 2 material points offered) that holds up under engine evaluation.
export function isSacrificeMove({beforeFen,move,pv=[],Chess}){
 if(!Chess||!beforeFen||!move||move.promotion)return false;
 try{
  const before=new Chess(beforeFen);
  const color=move.color||before.turn();
  const matBefore=materialBalance(before,color);
  const after=new Chess(beforeFen);
  const played=after.move({from:move.from,to:move.to,...(move.promotion?{promotion:move.promotion}:{})});
  if(!played)return false;
  // Never award brilliant for trivially capturing a higher-or-equal piece without leaving material hanging.
  const movedVal=PIECE_VALUES[played.piece]||0;
  const capturedVal=PIECE_VALUES[played.captured]||0;
  // Check 1: Does opponent have a direct capture of the moved piece (or any higher-value piece) that drops our net material by >= 2?
  const replies=after.moves({verbose:true});
  let maxDrop=0;
  for(const rep of replies){
   if(!rep.captured)continue;
   const probe=new Chess(after.fen());
   probe.move(rep);
   const matAfterCapture=materialBalance(probe,color);
   // Check if mover can immediately recapture back to equal material on that square
   const recaptures=probe.moves({verbose:true}).filter(r=>r.to===rep.to);
   let bestAfterRecapture=matAfterCapture;
   for(const rec of recaptures){
    const p2=new Chess(probe.fen());
    p2.move(rec);
    const m2=materialBalance(p2,color);
    if(m2>bestAfterRecapture)bestAfterRecapture=m2;
   }
   const netDrop=matBefore-bestAfterRecapture;
   if(netDrop>maxDrop)maxDrop=netDrop;
  }
  if(maxDrop>=2&&(movedVal>=3||maxDrop>=3))return true;
  // Check 2: Follow principal variation 2-3 plies to catch quiet/intermediate-move sacrifices.
  if(Array.isArray(pv)&&pv.length>=2&&movedVal>=3&&capturedVal<movedVal){
   const line=new Chess(beforeFen);
   let dropped=false;
   for(const u of pv.slice(0,4)){
    if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u))break;
    if(!line.move({from:u.slice(0,2),to:u.slice(2,4),...(u.length===5?{promotion:u[4]}:{})}))break;
    if(matBefore-materialBalance(line,color)>=2)dropped=true;
   }
   if(dropped)return true;
  }
  return false;
 }catch{return false;}
}

export function classifyMove({best,actual,second=null,isBest=false,isBook=false,isSacrifice=false}){
 const bestWin=winChance(best);
 const actualWin=isBest?bestWin:winChance(actual);
 const loss=isBest?0:Math.max(0,bestWin-actualWin);
 const accuracy=isBook?100:Math.min(100,Math.max(0,103.1668*Math.exp(-0.04354*loss)-3.1668));
 const secondWin=second?winChance(second):null;
 const gap=secondWin===null?0:Math.max(0,bestWin-secondWin);

 let kind='good';
 if(isBook&&loss<8){
  kind='book';
 }else if(isSacrifice&&(isBest||loss<=1.5)&&actualWin>=42&&(secondWin===null||secondWin<88)&&(gap>=3||actualWin>=52)){
  kind='brilliant';
 }else if((isBest||loss<=1.0)&&secondWin!==null&&gap>=12&&actualWin>=40&&secondWin<82){
  kind='great';
 }else if(isBest||loss<0.4){
  kind='best';
 }else if(loss<2){
  kind='excellent';
 }else if(loss<5){
  kind='good';
 }else if(loss<10){
  kind='inaccuracy';
 }else if(loss>=12&&bestWin>=68&&actualWin>=35&&actualWin<=62){
  kind='miss';
 }else if(loss<20){
  kind='mistake';
 }else{
  kind='blunder';
 }
 const meta=MOVE_CLASS_MAP[kind];
 return {kind:meta.kind,symbol:meta.symbol,label:meta.label,loss:isBook&&loss<8?0:loss,accuracy};
}

export function estimateGameRating(accuracy,outcome=0){
 if(!Number.isFinite(accuracy))return null;
 // Smooth Chess.com-style performance curve: 50% -> ~800, 75% -> ~1450, 90% -> ~2050, 98% -> ~2650.
 const clamped=Math.max(0,Math.min(100,accuracy));
 const base=450+Math.pow(clamped/100,2.15)*2250+outcome*80;
 return Math.round(Math.max(400,Math.min(2900,base))/10)*10;
}

export function parseInfo(line){
 if(!line.startsWith('info ')||/\b(?:upperbound|lowerbound)\b/.test(line))return null;
 const score=line.match(/\bscore (cp|mate) (-?\d+)/),depth=line.match(/\bdepth (\d+)/),pv=line.match(/\bpv (.+)$/);
 return score&&depth&&pv?{score:{kind:score[1],value:Number(score[2])},depth:Number(depth[1]),pv:pv[1].trim().split(/\s+/)}:null;
}

export function parseMultiInfo(line){
 const base=parseInfo(line);
 if(!base)return null;
 const mpv=line.match(/\bmultipv (\d+)/);
 return {...base,multipv:mpv?Number(mpv[1]):1};
}

export function displayScore(s){if(!s)return '—';return s.kind==='mate'?(s.value===0?'Мат':(s.value>0?'+':'−')+'M'+Math.abs(s.value)):(s.value>0?'+':'')+(s.value/100).toFixed(2);}
