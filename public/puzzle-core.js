import {parseUci} from './training-core.js';
export const THEMES={all:'Все задачи',mate:'Мат в один',tactics:'Тактика',personal:'Мои ошибки'};
export const PACK=[
 {id:'mate-01',theme:'mate',fen:'7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',goal:'mate',title:'Мат в один',explanation:'Ограничь поля короля и дай защищённый шах.'},
 {id:'mate-02',theme:'mate',fen:'6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',goal:'mate',title:'Мат по последней горизонтали',explanation:'Пешки запирают короля; ладья атакует последнюю горизонталь.'},
 {id:'mate-03',theme:'mate',fen:'r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1',goal:'mate',title:'Мат за чёрных',explanation:'Используй слабость первой горизонтали.'},
 {id:'mate-04',theme:'mate',fen:'8/8/8/8/8/6k1/5q2/7K b - - 0 1',goal:'mate',title:'Ферзь и король',explanation:'Король помогает ферзю закрыть поля отступления.'},
 {id:'mate-05',theme:'mate',fen:'7k/8/5K2/6Q1/8/8/8/8 w - - 0 1',goal:'mate',title:'Защищённый мат',explanation:'Ферзь должен дать шах, который невозможно снять.'},
 {id:'mate-06',theme:'mate',fen:'6k1/5ppp/8/8/8/8/2Q5/6K1 w - - 0 1',goal:'mate',title:'Мат ферзём по восьмой',explanation:'Проверь всю вертикаль и пути отхода короля.'},
 {id:'tac-01',theme:'tactics',fen:'4k3/8/8/3q4/8/4N3/8/4K3 w - - 0 1',goal:'capture',target:'q',title:'Выиграй ферзя',explanation:'Конь перепрыгивает другие фигуры и атакует по букве Г.'},
 {id:'tac-02',theme:'tactics',fen:'4k3/8/8/5N2/4q3/8/8/6K1 w - - 0 1',goal:'fork',target:'q',title:'Коневой двойной удар',explanation:'Дай шах конём, одновременно атакуя ферзя.'},
 {id:'tac-03',theme:'tactics',fen:'6k1/8/8/3Q4/5n2/8/8/4K3 b - - 0 1',goal:'capture',target:'q',title:'Найди взятие за чёрных',explanation:'Сначала проверь, что атакует твой конь.'},
 {id:'tac-04',theme:'tactics',fen:'4k3/8/8/8/4Q3/5b2/8/6K1 b - - 0 1',goal:'capture',target:'q',title:'Диагональ слона',explanation:'Проследи диагональ слона до ферзя.'}
];
export const uci=m=>m.from+m.to+(m.promotion||'');
export function accepts(puzzle,game,move){
 if(puzzle.goal==='best')return uci(move)===puzzle.best;
 if(puzzle.goal==='capture')return move.captured===puzzle.target;
 const next=game; // caller supplies the original position; apply then restore even on errors.
 let played;
 try{played=next.move({from:move.from,to:move.to,...(move.promotion?{promotion:move.promotion}:{})});
  if(puzzle.goal==='mate')return next.isCheckmate();
  if(puzzle.goal==='fork'){
   if(!next.isCheck()||played.piece!=='n')return false;
   const f='abcdefgh'.indexOf(played.to[0]),r=Number(played.to[1]);
   return next.board().flat().some(p=>p&&p.color!==played.color&&p.type===puzzle.target&&Math.abs(f-'abcdefgh'.indexOf(p.square[0]))*Math.abs(r-Number(p.square[1]))===2);
  }
  return false;
 }catch{return false;}finally{if(played)next.undo();}
}
export function solutions(puzzle,Chess){
 try{const g=new Chess(puzzle.fen);if(g.isGameOver())return [];return g.moves({verbose:true}).filter(m=>accepts(puzzle,g,m));}catch{return [];}
}
export function personalPuzzles(context,Chess){
 const g=context?.game;
 if(!g?.complete||!['1-0','0-1','1/2-1/2'].includes(g.result)||!['w','b'].includes(g.color)||!Array.isArray(g.moves)||!Array.isArray(g.analysis))return [];
 const out=[];
 try{
  const c=new Chess(g.startFen),records=new Map(g.analysis.map(r=>[r.index,r]));
  for(let i=0;i<g.moves.length;i++){
   const fen=c.fen(),actual=c.move(g.moves[i]),r=records.get(i);
   if(!r||r.color!==g.color||actual.color!==g.color||r.move!==uci(actual)||r.best===r.move||!Number.isFinite(r.loss)||r.loss<5)continue;
   const b=new Chess(fen);let best;try{best=b.move(parseUci(r.best));}catch{continue;}
   if(!best)continue;
   const p={id:'personal:'+fen.split(' ').slice(0,4).join(' ')+':'+r.best,theme:'personal',fen,goal:'best',best:r.best,title:'Найди рекомендацию Stockfish',explanation:'В партии ты сыграл '+actual.san+'. Движок предложил '+best.san+'. Другие ходы не проверяются этим упражнением.',loss:r.loss};
   out.push(p);
  }
 }catch{return [];}
 return out.sort((a,b)=>b.loss-a.loss).slice(0,10);
}
export function mergePersonal(old,added){
 const seen=new Set();return [...added,...old].filter(p=>p?.theme==='personal'&&typeof p.id==='string'&&!seen.has(p.id)&&seen.add(p.id)).slice(0,100);
}
export function cleanProgress(raw){
 const p=raw&&typeof raw==='object'?raw:{};
 const nonneg=n=>Number.isSafeInteger(n)&&n>=0?n:0;
 const solved=Array.isArray(p.solved)?[...new Set(p.solved.filter(id=>typeof id==='string'))].slice(0,1000):[];
 return {completed:nonneg(p.completed),clean:nonneg(p.clean),streak:nonneg(p.streak),bestStreak:nonneg(p.bestStreak),solved};
}
export function finishAttempt(raw,id,assisted){
 const p=cleanProgress(raw),clean=!assisted,streak=clean?p.streak+1:0;
 return {completed:p.completed+1,clean:p.clean+(clean?1:0),streak,bestStreak:Math.max(streak,p.bestStreak),solved:[...new Set([...p.solved,id])].slice(-1000)};
}
export function choosePuzzle(items,progress,current){
 const index=items.findIndex(p=>p.id===current);
 const rotated=index<0?items:[...items.slice(index+1),...items.slice(0,index+1)];
 return rotated.find(p=>p.id!==current&&!progress.solved.includes(p.id))||rotated[0]||null;
}
