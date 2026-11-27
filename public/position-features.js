// Deterministic board facts. Accepts a chess.js Chess instance; never mutates it.
// Attackers are geometric (including pinned pieces), not necessarily legal captures.
// An attacked undefended piece is a candidate for investigation, not a proven blunder.
const FILES='abcdefgh';
const COLORS=['w','b'];
const opposite=c=>c==='w'?'b':'w';
const inside=(x,y)=>x>=0&&x<8&&y>=0&&y<8;
const DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

export function positionFeatures(chess){
  const board=chess.board().slice().reverse();
  const pieces=board.flat().filter(Boolean);
  const pins=[],attackedUndefended=[];
  for(const p of pieces){
    if(p.type==='k')continue;
    const attackers=chess.attackers(p.square,opposite(p.color));
    if(attackers.length&&!chess.attackers(p.square,p.color).length)
      attackedUndefended.push({square:p.square,piece:p.color+p.type,attackers:attackers.slice().sort()});
  }
  for(const color of COLORS){
    const king=pieces.find(p=>p.color===color&&p.type==='k');
    if(!king)continue;
    const kx=FILES.indexOf(king.square[0]),ky=Number(king.square[1])-1;
    for(const [dx,dy] of DIRECTIONS){
      let candidate=null;
      for(let x=kx+dx,y=ky+dy;inside(x,y);x+=dx,y+=dy){
        const p=board[y][x];if(!p)continue;
        if(!candidate){if(p.color!==color)break;candidate=p;continue;}
        if(p.color!==color&&(p.type==='q'||(dx&&dy?p.type==='b':p.type==='r')))
          pins.push({king:king.square,pinned:candidate.square,by:p.square});
        break;
      }
    }
  }
  const pawns=pieces.filter(p=>p.type==='p');
  const pawnStructure={};
  for(const color of COLORS){
    const own=pawns.filter(p=>p.color===color),enemy=pawns.filter(p=>p.color!==color);
    const file=p=>FILES.indexOf(p.square[0]),rank=p=>Number(p.square[1]);
    pawnStructure[color]={
      isolated:own.filter(p=>!own.some(q=>Math.abs(file(p)-file(q))===1)).map(p=>p.square).sort(),
      doubled:own.filter(p=>own.some(q=>q!==p&&file(p)===file(q))).map(p=>p.square).sort(),
      passed:own.filter(p=>!enemy.some(q=>Math.abs(file(p)-file(q))<=1&&(color==='w'?rank(q)>rank(p):rank(q)<rank(p)))&&!own.some(q=>file(q)===file(p)&&(color==='w'?rank(q)>rank(p):rank(q)<rank(p)))).map(p=>p.square).sort()
    };
  }
  const openFiles=[...FILES].filter(f=>!pawns.some(p=>p.square[0]===f));
  const side=chess.turn(),king=pieces.find(p=>p.color===side&&p.type==='k');
  const checkers=king?chess.attackers(king.square,opposite(side)).slice().sort():[];
  return {fen:chess.fen(),sideToMove:side,checkers,pins,attackedUndefended,pawnStructure,openFiles};
}
