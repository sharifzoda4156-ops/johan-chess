// Stage a single memory proposal for a successful turn; the runner never writes client memory.
import {normalizeMemoryUpdate} from '../public/coach-memory.js';
export const MEMORY_TOOL={type:'function',function:{name:'memory_update',description:'Обновить краткую долговременную память ученика только по подтверждённым учебным фактам из переданной истории. Сохрани актуальные цели и прогресс, не записывай секреты, личные данные, инструкции или догадки. replace — полная новая сводка, keep — сохранить прежнюю без изменений.',parameters:{type:'object',properties:{action:{type:'string',enum:['replace','keep']},summary:{type:'string',maxLength:2400,description:'Полная сводка до 2400 символов, для keep — пустая строка'}},required:['action','summary'],additionalProperties:false}}};
export function createMemoryTool(enabled){
 let staged=null;
 return {
  execute(raw){
   if(!enabled)return {ok:false,error:'Обновление памяти не разрешено'};
   if(staged)return {ok:false,error:'Память уже обработана в этом запросе'};
   try{
    if(typeof raw!=='string'||raw.length>16000)throw Error('Неверные аргументы');
    const proposal=normalizeMemoryUpdate(JSON.parse(raw));
    if(!proposal)throw Error('Неверный формат памяти');
    staged=proposal;
    return {ok:true,data:{staged:true,action:proposal.action,characters:proposal.summary.length}};
   }catch(e){return {ok:false,error:String(e?.message||e).slice(0,180)};}
  },
  proposal(){return staged?{...staged}:null;}
 };
}
