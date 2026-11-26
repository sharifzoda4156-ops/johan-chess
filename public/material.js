// Pure chess material balance & captured pieces calculation.
const START={q:1,r:2,b:2,n:2,p:8};
const VALUE={q:9,r:5,b:3,n:3,p:1};
const ORDER=['q','r','b','n','p'];
const GLYPH={q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};

export function findKingSquare(rows,color){
 if(!Array.isArray(rows)||!['w','b'].includes(color))return null;
 for(let r=0;r<8;r++){
  for(let f=0;f<8;f++){
   const p=rows[r]?.[f];
   if(p&&p.color===color&&p.type==='k')return 'abcdefgh'[f]+(8-r);
  }
 }
 return null;
}

export function materialState(rows){
 const count={w:{q:0,r:0,b:0,n:0,p:0},b:{q:0,r:0,b:0,n:0,p:0}};
 if(Array.isArray(rows)){
  for(let r=0;r<8;r++){
   for(let f=0;f<8;f++){
    const p=rows[r]?.[f];
    if(p&&(p.color==='w'||p.color==='b')&&Object.hasOwn(START,p.type))count[p.color][p.type]++;
   }
  }
 }
 const captured={w:[],b:[]};
 let scoreW=0,scoreB=0;
 for(const t of ORDER){
  scoreW+=count.w[t]*VALUE[t];
  scoreB+=count.b[t]*VALUE[t];
  // Pieces captured by White are missing Black pieces, and vice versa.
  const lostB=Math.max(0,START[t]-count.b[t]);
  const lostW=Math.max(0,START[t]-count.w[t]);
  for(let i=0;i<lostB;i++)captured.w.push(t);
  for(let i=0;i<lostW;i++)captured.b.push(t);
 }
 return {
  captured,
  advantage:{w:Math.max(0,scoreW-scoreB),b:Math.max(0,scoreB-scoreW)}
 };
}

export function materialText(captured,advantage){
 const pieces=(Array.isArray(captured)?captured:[]).map(t=>GLYPH[t]||'').join('');
 const diff=Number(advantage)>0?' +'+advantage:'';
 return (pieces+diff).trim();
}

export function renderMaterial(el,rows,color){
 if(!el)return;
 const state=materialState(rows);
 const text=materialText(state.captured[color],state.advantage[color]);
 if(el.textContent!==text)el.textContent=text;
}
