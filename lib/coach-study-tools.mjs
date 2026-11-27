// Read-only reference tools using the bundled CC0 Lichess datasets.
import {readFile} from 'node:fs/promises';
import {parseOpenings,searchOpenings,openingLine} from '../public/study-core.js';

const root=new URL('../public/',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const schema=(name,description,properties)=>({type:'function',function:{name,description,parameters:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}}});
export const STUDY_TOOLS=[
  schema('opening_search','Найти дебют в библиотеке Lichess по ECO, английскому названию или SAN. Русское название переведи на английский. Возвращает проверенные линии, не оценку Stockfish.',{query:{type:'string',minLength:1,maxLength:120}}),
  schema('puzzle_search','Подобрать реальные задачи из встроенной стартовой базы Lichess по теме и рейтингу. Решения не возвращаются. Пустой результат не означает отсутствие задач во всей базе Lichess.',{
    theme:{type:'string',description:'Тема Lichess, например fork, pin, mateIn2, rookEndgame или all'},
    min:{type:'integer',minimum:0,maximum:9999},
    max:{type:'integer',minimum:0,maximum:9999}
  })
];

export const TRAINING_STATS_TOOL=schema('training_stats','Агрегированная статистика локальных тренировок и тактики ученика, только при разрешении. target — внутренняя целевая сложность задач, не Elo. Малые выборки не доказывают слабость.',{});

export function createStudyTools({Chess,readText=read,stats=null}){
  let openings=null,puzzles=null;
  return async function execute(name,raw){
    try{
      if(typeof raw!=='string'||raw.length>2048)throw Error('Неверные аргументы');
      const args=JSON.parse(raw);
      if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Неверные аргументы');
      const keys=Object.keys(args);
      if(name==='training_stats'){
        if(keys.length||!stats)throw Error('Статистика недоступна');
        return {ok:true,data:stats};
      }
      if(name==='opening_search'){
        if(keys.length!==1||typeof args.query!=='string'||!args.query.trim()||args.query.length>120)throw Error('Неверный запрос');
        if(!openings)openings=(await Promise.all(['a','b','c','d','e'].map(async f=>parseOpenings(await readText('openings/'+f+'.tsv'))))).flat();
        const matches=searchOpenings(openings,args.query,8);
        const results=[];
        for(const row of matches){
          // Reconstruct canonical SAN from the initial position rather than returning raw PGN.
          const {moves}=openingLine(row,Chess);
          results.push({eco:row.eco,name:row.name,moves:moves.slice(0,32).map(m=>m.san),truncated:moves.length>32});
        }
        return {ok:true,data:{source:'Lichess chess-openings (CC0)',results}};
      }
      if(name==='puzzle_search'){
        if(keys.length!==3||typeof args.theme!=='string'||!/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(args.theme)||!Number.isInteger(args.min)||!Number.isInteger(args.max)||args.min<0||args.max>9999||args.min>args.max)throw Error('Неверный фильтр задач');
        if(!puzzles){
          const data=JSON.parse(await readText('lichess-puzzles.json'));
          if(data.license!=='CC0-1.0'||!Array.isArray(data.puzzles))throw Error('База недоступна');
          puzzles=data.puzzles.filter(p=>p&&typeof p.id==='string'&&/^[A-Za-z0-9]{5}$/.test(p.id)&&Number.isInteger(p.rating)&&p.rating>=0&&p.rating<=9999&&Array.isArray(p.themes)&&p.themes.every(t=>typeof t==='string'));
        }
        const results=puzzles.filter(p=>p.rating>=args.min&&p.rating<=args.max&&(args.theme==='all'||p.themes.includes(args.theme))).slice(0,8).map(p=>({id:p.id,rating:p.rating,themes:p.themes,url:'https://lichess.org/training/'+p.id}));
        return {ok:true,data:{source:'Lichess CC0, bundled starter pack',results}};
      }
      throw Error('Неизвестный инструмент');
    }catch(e){return {ok:false,error:String(e?.message||e).slice(0,180)};}
  };
}

// Study tools are usable without sharing a game; game tools never become available in that case.
export function combineCoachTools(game,study,gameSchemas,studySchemas=STUDY_TOOLS){
  const schemas=[...(game?gameSchemas:[]),...(study?studySchemas:[])];
  const gameNames=new Set(gameSchemas.map(s=>s.function.name));
  const studyNames=new Set(studySchemas.map(s=>s.function.name));
  const execute=schemas.length?async(name,args)=>{
    if(game&&gameNames.has(name))return game(name,args);
    if(study&&studyNames.has(name))return study(name,args);
    return {ok:false,error:'Инструмент недоступен'};
  }:null;
  return {execute,schemas};
}
