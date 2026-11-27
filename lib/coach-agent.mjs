// Bounded, read-only tool loop for one completed game. No new engine searches or I/O in tools.
import {positionFeatures} from '../public/position-features.js';
import {cleanAnswer} from './coach-runner-core.mjs';

export const MAX_TOOL_ROUNDS=6;
export const MAX_TOOL_CALLS=6;
const finished=r=>['1-0','0-1','1/2-1/2'].includes(r);
const schema=(name,description,properties)=>({type:'function',function:{name,description,parameters:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}}});
export const GAME_TOOLS=[
  schema('game_report','Отчёт Stockfish по диапазону фактически сыгранных полуходов завершённой партии. Только оценка потери в сантипешках, без вариантов.',{
    from:{type:'integer',minimum:0,description:'Индекс первого полухода с нуля'},
    count:{type:'integer',minimum:1,maximum:12}
  }),
  schema('position_facts','Проверенные факты позиции до или после фактически сыгранного полухода. Атаки геометрические, не доказательство выигрыша.',{
    ply:{type:'integer',minimum:0,description:'Индекс полухода с нуля'},
    when:{type:'string',enum:['before','after']}
  })
];

export function createGameTools({game,rows,fens,Chess}){
  if(!finished(game?.result)||!Array.isArray(game.moves)||!game.moves.length||!Array.isArray(rows)||rows.length!==game.moves.length||!Array.isArray(fens)||fens.length!==rows.length+1)return null;
  const validPly=i=>Number.isInteger(i)&&i>=0&&i<rows.length;
  return function execute(name,raw){
    try{
      if(typeof raw!=='string'||raw.length>2048)throw Error('Неверные аргументы');
      const args=JSON.parse(raw);
      if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Неверные аргументы');
      const keys=Object.keys(args);
      if(name==='game_report'){
        if(keys.length!==2||!validPly(args.from)||!Number.isInteger(args.count)||args.count<1||args.count>12)throw Error('Неверный диапазон');
        const end=Math.min(rows.length,args.from+args.count);
        return {ok:true,data:{total:rows.length,from:args.from,next:end<rows.length?end:null,rows:rows.slice(args.from,end).map(r=>({ply:r.index,san:r.san,color:r.color,lossCp:r.loss,label:r.label}))}};
      }
      if(name==='position_facts'){
        if(keys.length!==2||!validPly(args.ply)||!['before','after'].includes(args.when))throw Error('Неверная позиция');
        return {ok:true,data:{ply:args.ply,san:rows[args.ply].san,when:args.when,...positionFeatures(new Chess(fens[args.ply+(args.when==='after'?1:0)]))}};
      }
      throw Error('Неизвестный инструмент');
    }catch(e){return {ok:false,error:String(e?.message||e).slice(0,180)};}
  };
}

function accumulateUsage(total,usage){
  if(!usage||typeof usage!=='object')return total;
  const result={...(total||{})};
  for(const key of ['prompt_tokens','completion_tokens','total_tokens']){
    if(Number.isFinite(usage[key])&&usage[key]>=0)result[key]=(result[key]||0)+usage[key];
  }
  return Object.keys(result).length?result:null;
}

// request(messages, tools) returns the raw OpenAI-compatible response.
// Tool requests are never accepted as a final answer.
export async function runCoachAgent({messages,request,execute=null}){
  const history=[...messages];
  let rounds=0,calls=0,usage=null;
  const ids=new Set();
  while(true){
    const tools=execute&&rounds<MAX_TOOL_ROUNDS&&calls<MAX_TOOL_CALLS?GAME_TOOLS:null;
    const result=await request(history.slice(),tools);
    usage=accumulateUsage(usage,result?.usage);
    const message=result?.choices?.[0]?.message;
    if(!message||typeof message!=='object')throw Error('Неверный ответ модели');
    const requested=message.tool_calls;
    if(requested!=null&&!Array.isArray(requested))throw Error('Неверный формат вызова инструмента');
    if(!requested?.length){
      const answer=cleanAnswer(typeof message.content==='string'?message.content:'');
      if(!answer)throw Error('Пустой ответ модели');
      return {answer,usage};
    }
    if(!tools)throw Error('Модель вызвала инструмент вне разрешённого цикла');
    if(requested.length>MAX_TOOL_CALLS-calls)throw Error('Превышен лимит инструментов');
    // Preserve the protocol and reject ambiguous/malformed call IDs before executing any call.
    const normalized=requested.map(call=>{
      if(call?.type!=='function'||typeof call.id!=='string'||!call.id||call.id.length>128||ids.has(call.id)||typeof call.function?.name!=='string'||!call.function.name||call.function.name.length>80||typeof call.function.arguments!=='string'||call.function.arguments.length>2048)throw Error('Неверный вызов инструмента');
      ids.add(call.id);
      return {id:call.id,type:'function',function:{name:call.function.name,arguments:call.function.arguments}};
    });
    history.push({role:'assistant',content:typeof message.content==='string'?message.content:null,tool_calls:normalized});
    rounds++;
    for(const call of normalized){
      const data=await execute(call.function.name,call.function.arguments);
      history.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(data)});
      calls++;
    }
    // The final request has no tools when the budget is exhausted.
    if(rounds===MAX_TOOL_ROUNDS||calls===MAX_TOOL_CALLS)history.push({role:'user',content:'Лимит инструментов исчерпан. Дай итоговый ответ на исходный вопрос по уже полученным фактам, без новых вызовов.'});
  }
}
