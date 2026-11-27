import {Chess} from './chess.js';
import {renderBoardView} from './board-view.js';
import {findKingSquare} from './material.js';
import {ENDGAMES,parseOpenings,searchOpenings,openingLine,historicalPgn} from './study-core.js';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
async function data(path,json=false){
 const r=await fetch(path);if(!r.ok)throw Error('Материалы не удалось загрузить');return json?r.json():r.text();
}
export function initStudyLibrary({openGame,practiceEndgame,askOpening,playOpening}){
 let openings=[],line=null,selected=null,at=0,flip=false,loading=null;
 function draw(animateMoves=[]){
  $('studyOpeningArea').hidden=!line;if(!line)return;
  const c=new Chess(line.positions[at]),rows=c.board(),last=line.moves[at-1];
  renderBoardView($('studyBoard'),{rows,flip,last,checkSquare:c.isCheck()?findKingSquare(rows,c.turn()):null,animateMoves});
  $('studyMove').textContent=at?line.moves[at-1].san+' · '+at+'/'+line.moves.length:'Начальная позиция';
  $('studyPrevious').disabled=at===0;$('studyNext').disabled=at===line.moves.length;
  for(const b of $('studyOpeningMoves').children)b.classList.toggle('active',Number(b.dataset.ply)===at);
 }
 function choose(row){
  try{
   line=openingLine(row,Chess);selected=row;at=0;flip=false;
   $('studyOpeningName').textContent=row.eco+' · '+row.name;$('studyOpeningStatus').textContent='';
   const list=$('studyOpeningMoves');list.replaceChildren();line.moves.forEach((m,i)=>{const b=el('button',m.before.split(' ')[5]+(m.color==='w'?'. ':'... ')+m.san);b.type='button';b.dataset.ply=String(i+1);b.onclick=()=>{at=i+1;draw();};list.append(b);});draw();
  }catch{line=null;selected=null;$('studyOpeningStatus').textContent='Эта линия не читается. Выбери другую.';draw();}
 }
 function search(){
  const query=$('studySearch').value,rows=searchOpenings(openings,query),list=$('studyOpenings');
  list.replaceChildren();for(const [i,r] of rows.entries()){const o=el('option',r.eco+' · '+r.name);o.value=String(i);list.append(o);}
  list.disabled=!rows.length;list.onchange=()=>{const row=rows[Number(list.value)];if(row)choose(row);};
  $('studyOpeningStatus').textContent=rows.length?'Показано '+rows.length+' (уточни поиск по ECO или английскому названию).':'Ничего не найдено.';
  if(rows.length)choose(rows[0]);else{line=null;selected=null;draw();}
 }
 $('studySearch').oninput=()=>{if(openings.length)search();};
 $('studyPrevious').onclick=()=>{if(line&&at>0){at--;draw();}};
 $('studyNext').onclick=()=>{if(line&&at<line.moves.length){at++;draw([line.moves[at-1]]);}};
 $('studyFlip').onclick=()=>{flip=!flip;draw();};
 $('studyOpeningAsk').hidden=false;
 $('studyOpeningAsk').onclick=()=>{if(selected)askOpening(selected);};
 $('studyOpeningPlay').onclick=()=>{if(line)playOpening(line.positions[at],flip?'b':'w');};
 for(const [theme,label] of Object.entries(ENDGAMES)){
  const b=el('button',label,'study-endgame');b.type='button';b.onclick=()=>practiceEndgame(theme);$('studyEndgames').append(b);
 }
 async function load(){
  if(loading)return loading;
  loading=(async()=>{
   $('studyLibraryStatus').textContent='Загружаю локальные материалы…';
   const jobs=await Promise.allSettled([
    Promise.all(['a','b','c','d','e'].map(x=>data('./openings/'+x+'.tsv'))).then(texts=>{openings=texts.flatMap(parseOpenings);$('studyOpeningCount').textContent=String(openings.length);search();}),
    data('./historical-games.json',true).then(d=>{
     const list=$('studyHistorical');list.replaceChildren();
     for(const row of d.games){const item=el('div',undefined,'study-game'),title=el('strong',row.title),meta=el('small',row.year+' · '+row.white+' — '+row.black+' · '+row.result),button=el('button','Открыть партию','primary');
      button.type='button';button.onclick=()=>{try{openGame(historicalPgn(row,Chess),row);}catch(e){$('studyLibraryStatus').textContent='Не удалось открыть PGN: '+e.message;}};
      const source=el('small',row.source,'study-source');item.append(title,meta,button,source);list.append(item);
     }
    })
   ]);
   $('studyLibraryStatus').textContent=jobs.some(j=>j.status==='rejected')?'Часть материалов недоступна. Открой библиотеку повторно.':'Материалы доступны без интернета.';
   if(jobs.some(j=>j.status==='rejected'))loading=null;
  })();
  return loading;
 }
 document.addEventListener('jc-screen',e=>{if(e.detail==='library')load();});
}
