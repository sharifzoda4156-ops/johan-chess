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

const playerKey=v=>String(v||'').trim().toLowerCase();
export function gameHistory(local,remote,reviews,user,Chess){
 const nick=playerKey(user),reviewMap=new Map((Array.isArray(reviews)?reviews:[]).filter(r=>r&&typeof r.id==='string').map(r=>[r.id,r])),seen=new Set(),rows=[];
 if(!nick)return rows;
 function add(record,source){
  try{
   if(typeof record?.pgn!=='string'||(source==='training'&&playerKey(record.user)!==nick))return;
   const g=new Chess();g.loadPgn(record.pgn);const h=g.getHeaders(),moves=g.history({verbose:true});
   const color=playerKey(h.White)===nick?'w':playerKey(h.Black)===nick?'b':null;
   if(!color||!moves.length||!['1-0','0-1','1/2-1/2'].includes(h.Result))return;
   const id=[h.White,h.Black,h.Date||'',moves[0].before,moves.map(m=>m.san).join(' ')].join('|');
   const key=source+'|'+id+'|'+h.Result+'|'+(h.UTCTime||h.StartTime||'');
   if(seen.has(key))return;seen.add(key);
   const draw=h.Result==='1/2-1/2',result=draw?'draw':h.Result===(color==='w'?'1-0':'0-1')?'win':'loss';
   const rating=Number(color==='w'?h.BlackElo:h.WhiteElo),accuracy=reviewMap.get(id)?.accuracy;
   const date=String(record.date||h.UTCDate||h.Date||'').replaceAll('.','-');
   const time=Number(record.ended)>0?Number(record.ended)*1000:Date.parse(date);
   rows.push({pgn:record.pgn,source,opponent:(color==='w'?h.Black:h.White)||'—',color,result,date:Number.isFinite(Date.parse(date))?date:'',time:Number.isFinite(time)?time:0,rating:source==='chesscom'&&Number.isInteger(rating)&&rating>0?rating:null,accuracy:typeof accuracy==='number'&&Number.isFinite(accuracy)&&accuracy>=0&&accuracy<=100?accuracy:null,timeClass:record.timeClass||'',timeControl:h.TimeControl||''});
  }catch{}
 }
 for(const record of Array.isArray(local)?local:[])add(record,'training');
 for(const record of Array.isArray(remote)?remote:[])add(record,'chesscom');
 return rows.sort((a,b)=>b.time-a.time);
}
export function ratingCards(raw){
 return [['rapid','Рапид'],['blitz','Блиц'],['bullet','Пуля'],['daily','Заочные']].flatMap(([key,label])=>{
  const n=raw?.['chess_'+key]?.last?.rating;
  return Number.isInteger(n)&&n>0?[{key,label,rating:n}]:[];
 });
}
export function profileAwards(stats,puzzles){
 const values=[['♟','Первая партия',stats.played,1],['♜','Первая победа',stats.wins,1],['◎','Первый разбор',stats.reviewed,1],['◆','Тактик',puzzles.solved.length,10],['✦','Серия из пяти',puzzles.bestStreak,5],['♞','Десять тренировок',stats.played,10]];
 return values.map(([icon,title,value,target])=>({icon,title,value:Math.min(target,Math.max(0,Number(value)||0)),target,earned:value>=target}));
}
