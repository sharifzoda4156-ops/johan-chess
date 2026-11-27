// Ground explicit move notation in server-side references. Not a general natural-language fact checker.
const FINISHED=['1-0','0-1','1/2-1/2'];
const MAX_LINES=32;
const MAX_REFS=12;
const REF=/\[\[(played|pv|opening):(0|[1-9]\d{0,3})\]\]/g;
// Bare squares (e4) are ambiguous: allow positional prose, but reject explicit unreferenced moves.
// Case-sensitive piece SAN; bare coordinate references alone are not classified as moves.
const PIECE_MOVE=/(?:^|[^\p{L}\p{N}_])[KQRBN][a-h1-8]{0,2}x?[a-h][1-8][+#]?(?![\p{L}\p{N}_])/u;
const OTHER_MOVE=/(?:^|[^\p{L}\p{N}_])(?:[a-h]x[a-h][1-8](?:=[QRBN])?[+#]?|[a-h][18]=[QRBN][+#]?|[a-h][1-8][+#]|[a-h][1-8][a-h][1-8][qrbn]?|[O0]-[O0](?:-[O0])?[+#]?|\d+\s*\.(?:\s*\.\.)?\s*[a-h][1-8](?:=[QRBN])?|(?:ход(?:ом|а|ы)?|сыграть|играть|сыграл[аи]?|ответить|play|move)\s+[`*_«"“]*[a-h][1-8](?:=[QRBN])?)(?![\p{L}\p{N}_])/iu;
const RUSSIAN_MOVE=/(?:^|[^\p{L}\p{N}_])(?:Кр|Ф|Л|С|К)[a-h1-8]{0,2}[xх:]?[a-h][1-8][+#]?(?![\p{L}\p{N}_])/u;
const illegal=()=>({ok:false,error:'Используй только доступные ссылки [[played:N]], [[pv:N]], [[opening:N]] вместо самостоятельной записи ходов. Не придумывай номера; запроси инструмент при необходимости.'});

function replay(Chess,fen,moves,max){
  if(!Array.isArray(moves)||!moves.length||moves.length>max)return null;
  try{
    const c=new Chess(fen),out=[];
    for(const san of moves){
      if(typeof san!=='string'||san.length>16)return null;
      const before=c.fen().split(' '),m=c.move(san,{strict:true});
      if(!m)return null;
      out.push({san:m.san,number:before[5],color:before[1]});
    }
    return out;
  }catch{return null;}
}
function notation(moves){
  return moves.map((m,i)=>(m.color==='w'?m.number+'. ':i===0?m.number+'... ':'')+m.san).join(' ');
}

export const ANSWER_RULES='Для конкретных ходов используй только ссылки [[played:N]] (сыгранный полуход с индексом N от нуля), [[pv:N]] (вариант, возвращённый stockfish_move для полухода N), [[opening:N]] (ссылка из opening_search). Код сам подставит проверенную нотацию. Не записывай SAN/UCI вручную, не выдумывай ссылки. Названия полей в обычных объяснениях допустимы. Не используй ссылки на сыгранные ходы без переданной завершённой партии.';

export function createAnswerVerifier({game,fens=[],Chess}){
  const played=new Map(),pv=new Map(),openings=new Map();
  if(FINISHED.includes(game?.result)&&Array.isArray(game.moves)&&fens.length===game.moves.length+1){
    for(let i=0;i<game.moves.length;i++){
      const line=replay(Chess,fens[i],[game.moves[i]],1);
      if(line)played.set(i,notation(line));
    }
  }
  // Only successful tool results from this turn may register references.
  function record(name,result){
    if(!result?.ok)return result;
    if(name==='stockfish_move'){
      const d=result.data,i=d?.ply;
      if(!played.has(i)||d.fen!==fens[i])return result;
      const line=replay(Chess,fens[i],d.pvSan,8);
      if(!line||line[0].san!==d.bestSan)return result;
      pv.set(i,notation(line));
      return {...result,data:{...d,lineRef:'[[pv:'+i+']]'}};
    }
    if(name==='opening_search'&&Array.isArray(result.data?.results)){
      return {...result,data:{...result.data,results:result.data.results.map(d=>{
        const line=replay(Chess,undefined,d.moves,32);
        if(!line||openings.size>=MAX_LINES)return d;
        const i=openings.size;openings.set(i,notation(line));
        return {...d,lineRef:'[[opening:'+i+']]'};
      })}};
    }
    return result;
  }
  function verify(answer){
    if(typeof answer!=='string'||!answer.trim())return illegal();
    let bad=false,count=0;
    const maps={played,pv,opening:openings};
    const template=answer.replace(REF,(_,kind,n)=>{
      count++;if(count>MAX_REFS||!maps[kind].has(Number(n)))bad=true;
      return ' ';
    });
    // Reject malformed references, not normal [[board:N]] markers already handled by the UI.
    if(bad||/\[\[\s*(?:played|pv|opening)\b/i.test(template)||PIECE_MOVE.test(template)||OTHER_MOVE.test(template)||RUSSIAN_MOVE.test(template))return illegal();
    return {ok:true,answer:answer.replace(REF,(_,kind,n)=>maps[kind].get(Number(n)))};
  }
  return {record,verify};
}
