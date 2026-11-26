import test from 'node:test';
import assert from 'node:assert/strict';
import {platformFetch,webLichessPgn,webChessComGame} from '../public/platform-api.js';
const response=data=>new Response(JSON.stringify(data));
test('native and local routes remain untouched',async()=>{
 const opts={cache:'no-store'};let called=false;
 await platformFetch('/api/games?user=me',opts,(p,o)=>{called=true;assert.equal(p,'/api/games?user=me');assert.equal(o,opts);return response({});},false);assert.ok(called);
});
test('Pages uses fixed Chess.com host, validates nick and normalizes standard games',async()=>{
 const seen=[];const fetcher=async url=>{seen.push(url);if(url.endsWith('/archives'))return response({archives:['https://untrusted.invalid/2026/10']});return response({games:[{rules:'chess',pgn:'1. e4 *',white:{username:'me'},black:{username:'other'},end_time:10},{rules:'chess960',pgn:'x'}]});};
 const result=await platformFetch('/api/games?user=ME',{},fetcher,true);assert.equal(result.status,200);assert.equal((await result.json()).games.length,1);assert.deepEqual(seen,['https://api.chess.com/pub/player/me/games/archives','https://api.chess.com/pub/player/me/games/2026/10']);
 assert.equal((await platformFetch('/api/games?user=../bad',{},fetcher,true)).status,400);assert.equal(seen.length,2);
});
test('Pages reports network failure and refuses a full release download',async()=>{
 const fail=()=>{throw Error('CORS');};assert.equal((await platformFetch('/api/player-stats?user=me',{},fail,true)).status,502);
 const path='/api/puzzle-data/pack?tag=lichess-data-123-1&asset=band-1-1.bin&offset=0&length=3';
 await assert.rejects(platformFetch(path,{},async()=>new Response('123'),true),/диапазона/);
 const r=await platformFetch(path,{},async(url,o)=>{assert.equal(o.headers.Range,'bytes=0-2');return new Response('123',{status:206,headers:{'Content-Range':'bytes 0-2/3'}});},true);assert.equal(await r.text(),'123');
});

test('web Lichess export uses only public IDs and bounded PGN',async()=>{
 const pgn='[Result "1-0"]\n\n1. e4 1-0';
 let calls=0;const fetcher=async(url,opts)=>{calls++;assert.equal(url,'https://lichess.org/game/export/Ab12Cd34');assert.equal(opts.credentials,'omit');assert.equal(opts.headers.Accept,'application/x-chess-pgn');return new Response(pgn);};
 assert.equal(await webLichessPgn('Ab12Cd34',fetcher),pgn);
 await assert.rejects(webLichessPgn('Ab12Cd34abcd',fetcher),/Некорректная/);assert.equal(calls,1);
 await assert.rejects(webLichessPgn('Ab12Cd34',async()=>new Response('x'.repeat(1048577))),/Не удалось/);
 await assert.rejects(webLichessPgn('Ab12Cd34',async()=>new Response('',{status:404})),/Не удалось/);
});

test('webChessComGame resolves game via local proxy or direct public archives on Pages',async()=>{
 const pgn='[Result "1-0"]\n\n1. e4 e5 1-0';
 const localFetcher=async url=>{assert.equal(url,'/api/chesscom-game?user=alice&kind=live&id=123456');return response({pgn});};
 assert.equal(await webChessComGame('Alice','live','123456',localFetcher,false),pgn);
 const pagesFetcher=async url=>{
  if(url.endsWith('/archives'))return response({archives:['https://api.chess.com/pub/player/alice/games/2026/11']});
  assert.equal(url,'https://api.chess.com/pub/player/alice/games/2026/11');
  return response({games:[{rules:'chess',url:'https://www.chess.com/game/live/123456',pgn}]});
 };
 assert.equal(await webChessComGame('Alice','live','123456',pagesFetcher,true),pgn);
 await assert.rejects(webChessComGame('../bad','live','123',localFetcher,false),/ник/);
 await assert.rejects(webChessComGame('alice','bullet','123',localFetcher,false),/ссылка/);
});

