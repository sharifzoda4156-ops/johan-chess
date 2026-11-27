// Runs inside GitHub Actions: Stockfish (UCI over stdin/stdout) + local llama-server (OpenAI-compatible API).
// Env: COACH_PAYLOAD_B64, COACH_REQUEST_ID, LLAMA_URL (default http://127.0.0.1:8080), COACH_OUT (default out/answer.json)
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {createRequire} from 'node:module';
import {Chess} from 'chess.js';
import {decodePayload,classify,buildMessages,criticalPositionFacts} from '../lib/coach-runner-core.mjs';

import {createGameTools,runCoachAgent,GAME_TOOLS} from '../lib/coach-agent.mjs';
import {createStudyTools,combineCoachTools,STUDY_TOOLS,TRAINING_STATS_TOOL} from '../lib/coach-study-tools.mjs';
import {createSearchCollector,verifiedSearchLine} from '../lib/coach-stockfish-line.mjs';
import {createAnswerVerifier,ANSWER_RULES} from '../lib/coach-answer-verifier.mjs';

const require=createRequire(import.meta.url);
const out=process.env.COACH_OUT||'out/answer.json';
const llama=process.env.LLAMA_URL||'http://127.0.0.1:8080';
const requestId=String(process.env.COACH_REQUEST_ID||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,64);

function save(obj){
  const json=JSON.stringify({request_id:requestId,...obj});
  mkdirSync(dirname(out),{recursive:true});writeFileSync(out,json);
  // The browser client cannot download artifacts (CORS), so the answer is also published as a job annotation.
  console.log('::notice title=coach::coach-answer:'+Buffer.from(json).toString('base64'));
}

class Stockfish{
  constructor(){
    const js=require.resolve('stockfish/bin/stockfish-18-lite-single.js');
    this.p=spawn(process.execPath,[js],{stdio:['pipe','pipe','inherit']});
    this.buf='';this.waiter=null;
    this.p.stdout.on('data',d=>{this.buf+=d;let i;while((i=this.buf.indexOf('\n'))>=0){const l=this.buf.slice(0,i).trim();this.buf=this.buf.slice(i+1);this.waiter?.(l);}});
  }
  send(s){this.p.stdin.write(s+'\n');}
  wait(pred,ms=60000){return new Promise((res,rej)=>{const t=setTimeout(()=>{this.waiter=null;rej(Error('Stockfish timeout'));},ms);this.waiter=l=>{const r=pred(l);if(r!==undefined){clearTimeout(t);this.waiter=null;res(r);}};});}
  async init(){this.send('uci');await this.wait(l=>l==='uciok'?true:undefined);this.send('setoption name Threads value 2');this.send('isready');await this.wait(l=>l==='readyok'?true:undefined);}
  async eval(fen,depth){
    this.send('position fen '+fen);this.send('go depth '+depth);
    const collector=createSearchCollector();
    return this.wait(l=>collector.push(l));
  }
  close(){try{this.send('quit');}catch{}this.p.kill();}
}

async function analyze(game,depth=12){
  const chess=new Chess(game.startFen||undefined),fens=[chess.fen()],sans=[];
  for(const san of game.moves){sans.push(chess.move(san).san);fens.push(chess.fen());}
  const sf=new Stockfish(),evals=[],searchLines=[];
  try{await sf.init();for(let i=0;i<fens.length;i++){
    const c=new Chess(fens[i]);
    if(c.isGameOver()){evals.push(c.isCheckmate()?-2000:0);searchLines.push(null);}
    else{const search=await sf.eval(fens[i],depth);evals.push(search.score);searchLines.push(verifiedSearchLine(fens[i],search,Chess));}
  }}finally{sf.close();}
  const rows=classify(evals,sans,new Chess(game.startFen||undefined).turn());
  return {rows,fens,searchLines,facts:criticalPositionFacts(rows,fens,game.color,Chess)};
}

async function request(messages,tools){
  const r=await fetch(llama+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages,...(tools?{tools,tool_choice:'auto'}:{}),temperature:0.6,max_tokens:900,chat_template_kwargs:{enable_thinking:false}})});
  if(!r.ok)throw Error('llama-server '+r.status+': '+(await r.text()).slice(0,200));
  return r.json();
}

try{
  const payload=decodePayload(process.env.COACH_PAYLOAD_B64);
  const {rows,facts,fens,searchLines}=payload.game?await analyze(payload.game):{rows:[],facts:[],fens:[],searchLines:[]};
  const gameTools=createGameTools({game:payload.game,rows,fens,searchLines,Chess});
  const {execute,schemas}=combineCoachTools(gameTools,createStudyTools({Chess,stats:payload.stats}),GAME_TOOLS,payload.stats?[...STUDY_TOOLS,TRAINING_STATS_TOOL]:STUDY_TOOLS);
  const verifier=createAnswerVerifier({game:payload.game,fens,Chess});
  const messages=buildMessages(payload,rows,facts);
  messages[0]={...messages[0],content:messages[0].content+'\n'+ANSWER_RULES};
  const {answer,usage}=await runCoachAgent({messages,request,execute:async(name,args)=>verifier.record(name,await execute(name,args)),schemas,verifyAnswer:verifier.verify});
  if(!answer)throw Error('Пустой ответ модели');
  save({ok:true,answer,usage});
  console.log('answer ready,',answer.length,'chars');
}catch(e){
  save({ok:false,error:String(e?.message||e).slice(0,300)});
  console.error(e);process.exitCode=1;
}
