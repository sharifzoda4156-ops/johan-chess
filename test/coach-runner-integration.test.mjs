import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Chess} from 'chess.js';

test('real Stockfish runner returns a legal stored PV through the tool protocol',{timeout:90000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'jc-coach-')),out=join(dir,'answer.json');
  const requests=[];
  const server=createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    try{
      requests.push(JSON.parse(body));
      const message=requests.length===1?{content:null,tool_calls:[{id:'sf1',type:'function',function:{name:'stockfish_move',arguments:'{"ply":0}'}},{id:'mem1',type:'function',function:{name:'memory_update',arguments:'{"action":"replace","summary":"Тренируем развитие фигур"}'}}]}:{content:'Проверенный вариант: [[pv:0]]'};
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message}]}));
    }catch{res.writeHead(500);res.end();}
  });
  let child;
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const payload={question:'Какой лучший ход?',memoryUpdate:true,game:{result:'1-0',moves:['e4','e5'],color:'w'}};
    const env={...process.env,COACH_PAYLOAD_B64:Buffer.from(JSON.stringify(payload)).toString('base64'),COACH_REQUEST_ID:'integration',COACH_OUT:out,LLAMA_URL:'http://127.0.0.1:'+server.address().port};
    child=spawn(process.execPath,['scripts/coach-runner.mjs'],{env,stdio:['ignore','pipe','pipe']});
    let logs='';child.stdout.on('data',d=>{logs+=d;});child.stderr.on('data',d=>{logs+=d;});
    const timer=setTimeout(()=>child.kill('SIGKILL'),75000);
    let code;try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});}finally{clearTimeout(timer);}
    assert.equal(code,0,logs);
    assert.equal(requests.length,2);
    assert.ok(requests[0].tools.some(t=>t.function.name==='stockfish_move'));
    assert.ok(requests[0].tools.some(t=>t.function.name==='memory_update'));
    assert.equal(JSON.parse(requests[1].messages.find(m=>m.tool_call_id==='mem1').content).ok,true);
    const tool=requests[1].messages.find(m=>m.role==='tool'&&m.tool_call_id==='sf1');
    assert.ok(tool);
    const result=JSON.parse(tool.content);assert.equal(result.ok,true,tool.content);
    const data=result.data,chess=new Chess(data.fen);
    assert.equal(data.actualSan,'e4');assert.equal(data.fen,new Chess().fen());
    assert.ok(data.pvSan.length>=1&&data.pvSan.length<=8);
    assert.equal(data.bestSan,data.pvSan[0]);
    for(const san of data.pvSan)assert.ok(chess.move(san,{strict:true}));
    assert.equal(data.lineRef,'[[pv:0]]');
    const saved=JSON.parse(await readFile(out,'utf8'));
    assert.deepEqual(saved.memoryUpdate,{action:'replace',summary:'Тренируем развитие фигур'});
    const answer=saved.answer;
    assert.ok(answer.startsWith('Проверенный вариант: 1. '+data.bestSan));
    assert.ok(!answer.includes('[[pv:'));
  }finally{
    if(child&&child.exitCode===null)child.kill('SIGKILL');
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});
