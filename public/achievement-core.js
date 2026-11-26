// Rules and IDs adapted from Treasure-Chess/chess-achievements, MIT.
// Copyright (c) 2022 Nifty Chess, Inc. See awards/LICENSE-TREASURE.txt.
const standard='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const catalog=[
 [1,'Игрок','Завершить партию',1],
 [2,'Победитель 750+','Победить соперника с рейтингом 750+',2],
 [4,'Победитель 1500+','Победить соперника с рейтингом 1500+',3],
 [7,'Большая победа','Победить соперника с рейтингом 2000+',4],
 [13,'Крест-накрест','Поставить мат слоном',4],
 [14,'Рыцарский турнир','Поставить мат конём',4],
 [15,'Мат пешкой','Поставить мат пешкой',4],
 [19,'Знаток дебюта','Поставить мат менее чем за 10 ходов',2],
 [20,'Не моргай','Поставить мат менее чем за 5 ходов',3],
 [21,'Дурацкий мат','Поставить мат за 2 хода',5],
 [23,'Длинная рокировка','Сделать длинную рокировку',1],
 [24,'Коневод','Превратить пешку в коня',3],
 [25,'Превращение в слона','Превратить пешку в слона',5],
 [26,'Хитрая пешка','Взять на проходе',2],
 [27,'Мат на проходе','Поставить мат взятием на проходе',5],
 [30,'Аутсайдер','Победить более рейтингового соперника',3],
 [31,'Шах','Объявить шах сопернику',1],
 [37,'Победитель','Выиграть партию',2]
];
const ids=new Set(catalog.map(x=>x[0]));
export function earnedAchievements(rows,Chess,previous=[]){
 const earned=new Set((Array.isArray(previous)?previous:[]).filter(id=>ids.has(id)));
 for(const row of Array.isArray(rows)?rows:[]){
  try{
   const game=new Chess();game.loadPgn(row.pgn);
   const headers=game.getHeaders(),moves=game.history({verbose:true}),last=moves.at(-1),color=row.color;
   if(!last||moves[0].before!==standard||headers.SetUp==='1'||(headers.Variant&&!['Standard','Chess'].includes(headers.Variant))||!['w','b'].includes(color)||!['1-0','0-1','1/2-1/2'].includes(headers.Result))continue;
   if(!['training','chesscom'].includes(row.source)||String(headers.Event||'').includes('повтор позиции'))continue;
   const win=headers.Result===(color==='w'?'1-0':'0-1'),mate=win&&game.isCheckmate()&&last.color===color,own=moves.filter(m=>m.color===color);
   earned.add(1);if(win)earned.add(37);
   if(own.some(m=>m.san.endsWith('+')||m.san.endsWith('#')))earned.add(31);
   if(own.some(m=>m.flags.includes('q')))earned.add(23);
   if(own.some(m=>m.promotion==='n'))earned.add(24);
   if(own.some(m=>m.promotion==='b'))earned.add(25);
   if(own.some(m=>m.flags.includes('e')))earned.add(26);
   if(mate){
    const piece=last.promotion||last.piece;
    if(piece==='b')earned.add(13);if(piece==='n')earned.add(14);if(piece==='p')earned.add(15);
    const count=Math.ceil(moves.length/2);
    if(count<10)earned.add(19);if(count<5)earned.add(20);if(count===2)earned.add(21);
    if(last.flags.includes('e'))earned.add(27);
   }
   if(win&&row.source==='chesscom'){
    const opponent=Number(color==='w'?headers.BlackElo:headers.WhiteElo),self=Number(color==='w'?headers.WhiteElo:headers.BlackElo);
    if(Number.isInteger(opponent)&&opponent>0){
     if(opponent>=750)earned.add(2);if(opponent>=1500)earned.add(4);if(opponent>=2000)earned.add(7);
     if(Number.isInteger(self)&&self>0&&opponent>self)earned.add(30);
    }
   }
  }catch{}
 }
 return [...earned].sort((a,b)=>a-b);
}
export function achievementCards(earned){
 const set=new Set(earned);
 return catalog.map(([id,title,description,points])=>({id,title,description,earned:set.has(id),icon:points>=4?'trophy':points>=2?'medal':'award'}));
}
