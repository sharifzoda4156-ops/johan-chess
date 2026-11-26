import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {requestSpec,validRange,downloadPuzzleData} from '../lib/puzzle-download.mjs';
import {parseCatalog,matchingPacks,decodePack} from '../public/puzzle-remote.js';
import {evictions} from '../public/puzzle-cache.js';

const row={id:'abc01',fen:'test fixture',moves:['e2e4','e7e5'],rating:1100,themes:['fork']};
const text=JSON.stringify({license:'CC0-1.0',puzzles:[row]});
const descriptor={asset:'band-5-0.bin',offset:200,length:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex'),count:1,min:1100,max:1100,themes:['fork']};
const tag='lichess-data-123-1';
const params=new URLSearchParams({tag,asset:descriptor.asset,offset:'200',length:String(descriptor.length)});
const spec=requestSpec('/api/puzzle-data/pack',params);
test('only exact fixed-release routes and bounded byte ranges accepted',()=>{
 assert.ok(spec.url.endsWith('/'+tag+'/'+descriptor.asset));
 for(const [k,v] of [['tag','https://evil.test'],['asset','../foo'],['offset','-1'],['length','1048577']]){const q=new URLSearchParams(params);q.set(k,v);assert.throws(()=>requestSpec('/api/puzzle-data/pack',q));}
 assert.equal(validRange('bytes 200-'+(199+descriptor.length)+'/100000',200,descriptor.length),true);
 assert.equal(validRange('bytes 0-'+(descriptor.length-1)+'/100000',200,descriptor.length),false);
});
test('redirect keeps exact Range and rejects full-body or untrusted redirect',async()=>{
 let calls=0;
 const bytes=await downloadPuzzleData(spec,async(url,opts)=>{
  assert.equal(opts.headers.Range,'bytes=200-'+(199+descriptor.length));
  if(calls++===0)return new Response(null,{status:302,headers:{Location:'https://release-assets.githubusercontent.com/test'}});
  return new Response(text,{status:206,headers:{'Content-Range':'bytes 200-'+(199+descriptor.length)+'/100000'}});
 });
 assert.equal(bytes.toString(),text);assert.equal(calls,2);
 await assert.rejects(downloadPuzzleData(spec,async()=>new Response(text,{status:200})));
 await assert.rejects(downloadPuzzleData(spec,async()=>new Response(null,{status:302,headers:{Location:'https://evil.test/a'}})));
 await assert.rejects(downloadPuzzleData(spec,async()=>new Response(text.slice(0,-1),{status:206,headers:{'Content-Range':'bytes 200-'+(199+descriptor.length)+'/100000'}})));
});
test('catalog selects matching published bands and topics',()=>{
 const c={schema:1,tag,license:'CC0-1.0',total:2,packs:[descriptor,{...descriptor,asset:'band-8-0.bin',min:1600,max:1700,themes:['pin']}]};
 const valid=parseCatalog(JSON.stringify(c));assert.deepEqual(matchingPacks(valid,'fork','adaptive',1100),[descriptor]);
 assert.equal(matchingPacks(valid,'all','1600-1999',1600)[0].asset,'band-8-0.bin');
 assert.throws(()=>parseCatalog(JSON.stringify({...c,total:3})));
 assert.throws(()=>parseCatalog(JSON.stringify({...c,packs:[descriptor,descriptor]})));
});
test('pack hash and exact count are checked before data enters cache',async()=>{
 assert.deepEqual(await decodePack(text,descriptor),[row]);
 await assert.rejects(decodePack(text.replace('abc01','abc02'),descriptor));
 await assert.rejects(decodePack(text,{...descriptor,count:2}));
});
test('cache evicts oldest entries, replacement does not double count',()=>{
 const items=[{key:'a',size:20,used:1},{key:'b',size:20,used:2},{key:'c',size:10,used:3}];
 assert.deepEqual(evictions(items,'d',25,50),['a','b']);
 assert.deepEqual(evictions(items,'b',20,50),[]);
});
