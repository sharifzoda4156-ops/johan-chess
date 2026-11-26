export const ENDGAMES={endgame:'Все эндшпили',pawnEndgame:'Пешечные',rookEndgame:'Ладейные',bishopEndgame:'Слоновые',knightEndgame:'Коневые',queenEndgame:'Ферзевые',queenRookEndgame:'Ферзь и ладья'};
export function parseOpenings(text){
 const lines=text.trimEnd().split(/\r?\n/);if(lines.shift()!=='eco\tname\tpgn')throw Error('Invalid Lichess TSV');
 return lines.map(line=>{const [eco,name,pgn]=line.split('\t');if(!/^[A-E]\d\d$/.test(eco)||!name||!pgn)throw Error('Invalid opening');return {eco,name,pgn};});
}
export function searchOpenings(rows,query,limit=100){
 const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
 return rows.filter(r=>words.every(w=>(r.eco+' '+r.name+' '+r.pgn).toLowerCase().includes(w))).slice(0,limit);
}
export function openingLine(row,Chess){
 const g=new Chess();g.loadPgn(row.pgn);const moves=g.history({verbose:true});if(!moves.length)throw Error('Empty opening');
 return {moves,positions:[moves[0].before,...moves.map(m=>m.after)]};
}
export function historicalPgn(row,Chess){
 const headers={Event:row.title,Site:'Historical archive',Date:row.year+'.??.??',Round:'?',White:row.white,Black:row.black,Result:row.result,ECO:row.eco};
 const pgn=Object.entries(headers).map(([k,v])=>'['+k+' "'+String(v).replace(/["\\\r\n]/g,'')+'"]').join('\n')+'\n\n'+row.moves;
 const c=new Chess();c.loadPgn(pgn);
 if(!c.history().length||c.getHeaders().Result!==row.result||!['1-0','0-1','1/2-1/2'].includes(row.result))throw Error('Invalid historical score');
 return pgn;
}
