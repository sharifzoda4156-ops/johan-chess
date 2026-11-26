export function displayName(status,nick){return status?.connected&&typeof status.name==='string'&&status.name.trim()?status.name.trim():String(nick||'Игрок');}
export function profileStats(training,reviews,user,Chess){
 const nick=String(user||'').trim().toLowerCase(),games=(Array.isArray(training)?training:[]).filter(r=>String(r?.user||'').toLowerCase()===nick);
 let wins=0,losses=0,draws=0;
 for(const r of games){try{const g=new Chess();g.loadPgn(r.pgn);const h=g.getHeaders(),color=String(h.White||'').toLowerCase()===nick?'w':String(h.Black||'').toLowerCase()===nick?'b':null;
  if(!color)continue;if(h.Result==='1/2-1/2')draws++;else if(['1-0','0-1'].includes(h.Result)){if(h.Result===(color==='w'?'1-0':'0-1'))wins++;else losses++;}
 }catch{}}
 const reviewed=(Array.isArray(reviews)?reviews:[]).filter(r=>r&&['w','b'].includes(r.color));
 const scores=reviewed.map(r=>r.accuracy).filter(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=100);
 return {played:wins+losses+draws,wins,losses,draws,reviewed:reviewed.length,accuracy:scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null};
}
