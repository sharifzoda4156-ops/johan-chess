export function profileStats(training,reviews,user,Chess){
 const nick=String(user||'').trim().toLowerCase(),s={played:0,wins:0,losses:0,draws:0,reviewed:0,accuracy:null};
 if(!nick)return s;
 for(const g of training){
  if(String(g?.user||'').trim().toLowerCase()!==nick||!['1-0','0-1','1/2-1/2'].includes(g.result))continue;
  let color=g.color;
  if(!['w','b'].includes(color)){try{const c=new Chess();c.loadPgn(g.pgn);const h=c.getHeaders();color=h.White?.toLowerCase()===nick?'w':h.Black?.toLowerCase()===nick?'b':null;}catch{continue;}}
  if(!['w','b'].includes(color))continue;
  s.played++;if(g.result==='1/2-1/2')s.draws++;else if(g.result===(color==='w'?'1-0':'0-1'))s.wins++;else s.losses++;
 }
 const valid=reviews.filter(r=>r&&['w','b'].includes(r.color));s.reviewed=valid.length;
 const scores=valid.map(r=>r.accuracy).filter(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100);
 if(scores.length)s.accuracy=scores.reduce((a,b)=>a+b,0)/scores.length;
 return s;
}
