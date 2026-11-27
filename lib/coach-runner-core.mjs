// Pure helpers for the GitHub-Actions coach runner (no I/O, fully unit-tested).
import {positionFeatures} from '../public/position-features.js';

export const MAX_PAYLOAD_BYTES=60000;
export const MAX_PLIES=160;
const RESULTS=['1-0','0-1','1/2-1/2'];

export function decodePayload(b64){
  if(typeof b64!=='string'||!b64||b64.length>MAX_PAYLOAD_BYTES*2)throw Error('Payload пустой или слишком большой');
  let data;try{data=JSON.parse(Buffer.from(b64,'base64').toString('utf8'));}catch{throw Error('Payload не JSON');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Неверный payload');
  const question=typeof data.question==='string'?data.question.trim().slice(0,2000):'';
  if(!question)throw Error('Пустой вопрос');
  const history=Array.isArray(data.history)?data.history.filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string').slice(-12).map(m=>({role:m.role,content:m.content.slice(0,3000)})):[];
  const g=data.game;let game=null;
  if(g&&RESULTS.includes(g.result)&&Array.isArray(g.moves)&&g.moves.length&&g.moves.length<=MAX_PLIES&&g.moves.every(s=>typeof s==='string'&&s.length<=16)){
    game={white:String(g.white||'').slice(0,80),black:String(g.black||'').slice(0,80),result:g.result,startFen:typeof g.startFen==='string'?g.startFen.slice(0,120):null,moves:g.moves,color:['w','b'].includes(g.color)?g.color:null};
  }
  const p=data.profile&&typeof data.profile==='object'?data.profile:{};
  const profile={goal:String(p.goal||'').slice(0,300),focus:String(p.focus||'').slice(0,300),notes:String(p.notes||'').slice(0,600),summary:String(p.summary||'').slice(0,1500)};
  return {question,history,game,profile};
}

// UCI "info ... score cp N | mate N" -> centipawns from the side to move.
export function parseScore(line){
  const m=/\bscore (cp|mate) (-?\d+)/.exec(line);
  if(!m)return null;
  const v=Number(m[2]);
  return m[1]==='cp'?Math.max(-2000,Math.min(2000,v)):(v>0?2000-Math.min(v,50):-2000+Math.min(-v,50));
}

// evals[i] = score for the side to move in the position BEFORE ply i (evals has plies+1 items).
export function classify(evals,moves,startColor='w'){
  const out=[];
  for(let i=0;i<moves.length;i++){
    const loss=Math.max(0,evals[i]+evals[i+1]);
    const color=(i%2===0)===(startColor==='w')?'w':'b';
    const label=loss>=300?'грубая ошибка':loss>=150?'ошибка':loss>=70?'неточность':null;
    out.push({index:i,moveNo:Math.floor((i+(startColor==='w'?0:1))/2)+1,color,san:moves[i],loss,label});
  }
  return out;
}

export function criticalMoments(rows,limit=6,color=null){
  return rows.filter(r=>r.label&&(!color||r.color===color)).sort((a,b)=>b.loss-a.loss).slice(0,limit).sort((a,b)=>a.index-b.index);
}

// Limit context growth: only the three highest-loss moments for the selected player.
// Position indexes are zero-based, with before/after explicitly distinguished.
export function criticalPositionFacts(rows,fens,color,Chess){
  return criticalMoments(rows,3,color).map(r=>({
    ply:r.index,san:r.san,before:positionFeatures(new Chess(fens[r.index])),
    after:positionFeatures(new Chess(fens[r.index+1]))
  }));
}

export function buildMessages({question,history,game,profile},rows=[],facts=[]){
  const system=['Ты — шахматный тренер Johan Chess. Отвечай по-русски, кратко и по делу.',
   'Для конкретной партии опирайся на данные Stockfish и проверенные факты позиции. Для дебютов и задач используй справочные инструменты; не выдумывай варианты, оценки, ID или ссылки задач и не раскрывай решения задач. Если данных не хватает — скажи об этом.'];
  if(profile.goal)system.push('Цель ученика: '+profile.goal);
  if(profile.focus)system.push('Фокус: '+profile.focus);
  if(profile.notes)system.push('Заметки: '+profile.notes);
  if(profile.summary)system.push('Сводка прошлых занятий: '+profile.summary);
  if(game){
    const crit=criticalMoments(rows,6,game.color);
    system.push(`Партия: ${game.white} — ${game.black}, результат ${game.result}, ходов (полуходов): ${game.moves.length}.`);
    system.push('Ходы: '+game.moves.map((s,i)=>(i%2===0?Math.floor(i/2)+1+'. ':'')+s).join(' '));
    system.push(crit.length?'Критические моменты (Stockfish, потеря в сотых пешки): '+crit.map(r=>`${r.moveNo}${r.color==='w'?'.':'...'} ${r.san} (−${(r.loss/100).toFixed(1)}, ${r.label})`).join('; '):'Stockfish не нашёл серьёзных ошибок.');
    if(facts.length){
      system.push('Факты позиции: ply — индекс полухода с нуля; before/after — до/после указанного хода. attackedUndefended и checkers используют геометрические атаки (в том числе связанные фигуры); отсутствие защиты не доказывает выигрыш. pins — абсолютные связки к королю. pawnStructure — структурные признаки, а не оценка Stockfish.');
      system.push(JSON.stringify(facts));
    }
  }
  return [{role:'system',content:system.join('\n')},...history,{role:'user',content:question}];
}

export function cleanAnswer(text){
  return String(text||'').replace(/<think>[\s\S]*?<\/think>/g,'').trim().slice(0,8000);
}
