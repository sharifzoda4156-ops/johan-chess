import test from 'node:test';import assert from 'node:assert/strict';import {Engine,setEngineBlocked} from '../public/engine.js';
test('online lock stops all active workers and forbids new analysis until unlocked',async()=>{
 const original=globalThis.Worker;let stopped=0;
 globalThis.Worker=class{postMessage(){} terminate(){stopped++;}};
 try{
  const a=new Engine('mock'),b=new Engine('mock');const pending=a.init();const rejected=assert.rejects(pending,/остановлен/);
  setEngineBlocked(true);await rejected;assert.equal(stopped,2);assert.throws(()=>new Engine('mock'),/онлайн/);b.close();assert.equal(stopped,2);
  setEngineBlocked(false);const c=new Engine('mock');c.close();assert.equal(stopped,3);
 }finally{setEngineBlocked(false);globalThis.Worker=original;}
});
