// Runs inside GitHub Actions: Stockfish (UCI over stdin/stdout) + local llama-server (OpenAI-compatible API).
// Env: COACH_PAYLOAD_B64, COACH_REQUEST_ID, LLAMA_URL (default http://127.0.0.1:8080), COACH_OUT (default out/answer.json)
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {createRequire} from 'node:module';
import {Chess} from 'chess.js';
import {decodePayload,parseScore,classify,buildMessages,cleanAnswer} from '../lib/coach-runner-core.mjs';

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
    let score=0;
    return this.wait(l=>{if(l.startsWith('info')){const s=parseScore(l);if(s!==null)score=s;}if(l.startsWith('bestmove'))return score;});
  }
  close(){try{this.send('quit');}catch{}this.p.kill();}
}

async function analyze(game,depth=12){
  const chess=new Chess(game.startFen||undefined),fens=[chess.fen()],sans=[];
  for(const san of game.moves){sans.push(chess.move(san).san);fens.push(chess.fen());}
  const sf=new Stockfish();await sf.init();const evals=[];
  try{for(let i=0;i<fens.length;i++){
    const c=new Chess(fens[i]);
    evals.push(c.isGameOver()?(c.isCheckmate()?-2000:0):await sf.eval(fens[i],depth));
  }}finally{sf.close();}
  return classify(evals,sans,new Chess(game.startFen||undefined).turn());
}

async function ask(messages){
  const r=await fetch(llama+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages,temperature:0.6,max_tokens:900,chat_template_kwargs:{enable_thinking:false}})});
  if(!r.ok)throw Error('llama-server '+r.status+': '+(await r.text()).slice(0,200));
  const j=await r.json();
  return {answer:cleanAnswer(j.choices?.[0]?.message?.content),usage:j.usage||null};
}

try{
  const payload=decodePayload(process.env.COACH_PAYLOAD_B64);
  const rows=payload.game?await analyze(payload.game):[];
  const {answer,usage}=await ask(buildMessages(payload,rows));
  if(!answer)throw Error('Пустой ответ модели');
  save({ok:true,answer,usage});
  console.log('answer ready,',answer.length,'chars');
}catch(e){
  save({ok:false,error:String(e?.message||e).slice(0,300)});
  console.error(e);process.exitCode=1;
}
