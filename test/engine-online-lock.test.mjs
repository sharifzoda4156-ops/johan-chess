import test from 'node:test';import assert from 'node:assert/strict';import {Engine,setEngineOnlineLock} from '../public/engine.js';
test('online lock cancels active workers, rejects new ones, permits offline engines afterward',async()=>{
 const old=globalThis.Worker;let terminated=0;globalThis.Worker=class{postMessage(){}terminate(){terminated++;}};
 try{
  const engine=new Engine('fake'),wait=engine.wait('go',()=>false);
  const rejected=assert.rejects(wait,/остановлен/);setEngineOnlineLock(true);await rejected;
  assert.equal(terminated,1);assert.throws(()=>new Engine('fake'),/недоступен/);engine.close();assert.equal(terminated,1);
  setEngineOnlineLock(false);const later=new Engine('fake');later.close();assert.equal(terminated,2);
 }finally{setEngineOnlineLock(false);if(old===undefined)delete globalThis.Worker;else globalThis.Worker=old;}
});
