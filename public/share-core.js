import {normalizePgn,splitPgn} from './pgn.js';
export function sharedInput(raw){
 const text=normalizePgn(raw);if(!text||text.length>1024*1024)throw Error('Пустые или слишком большие данные');
 // Prefer PGN: do not mistake a URL in a Site/Link header for a shared link.
 if(/^\s*\[[A-Za-z0-9_]+\s+"/m.test(text)||/^\s*1\.(?:\.\.)?\s*\S/m.test(text))return {type:'pgn',text};
 const urls=text.match(/https?:\/\/[^\s<>"]+/g)||[];
 for(const link of urls){
  let u;try{u=new URL(link.replace(/[),.;!]+$/,''));}catch{continue;}
  if(u.protocol!=='https:'||u.username||u.password||u.port)continue;
  if(u.hostname==='lichess.org'){
   // Strip private 4-character player token; only public ID is ever fetched.
   const m=u.pathname.match(/^\/([A-Za-z0-9]{8})(?:[A-Za-z0-9]{4})?(?:\/(?:white|black))?\/?$/);
   if(m)return {type:'lichess',gameId:m[1]};
  }
  if(['chess.com','www.chess.com'].includes(u.hostname)){
   const m=u.pathname.match(/^\/(?:[a-z]{2}\/)?(?:game|analysis\/game)\/(live|daily)\/([0-9]{1,20})\/?$/);
   if(m)return {type:'chesscom',kind:m[1],gameId:m[2]};
  }
 }
 throw Error('Поделись PGN или ссылкой на завершённую партию Chess.com / Lichess');
}
export function validatedSharedPgn(text,Chess){
 const normalized=normalizePgn(text);if(normalized.length>1024*1024)throw Error('PGN больше 1 МБ');
 const games=splitPgn(normalized);if(!games.length||games.length>100)throw Error('От 1 до 100 партий в одном файле');
 const good=[];let skipped=0;
 for(const pgn of games){try{
  const c=new Chess();c.loadPgn(pgn);const h=c.getHeaders(),variant=(h.Variant||'standard').toLowerCase();
  if(!['standard','chess','normal'].includes(variant)||!['1-0','0-1','1/2-1/2'].includes(h.Result)||!c.history().length)throw Error();
  good.push(pgn);
 }catch{skipped++;}}
 if(!good.length)throw Error('Нет завершённых стандартных партий с ходами');
 return {text:good.join('\n\n'),count:good.length,skipped};
}
