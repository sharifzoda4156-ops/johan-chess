import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Chess} from 'chess.js';
import {parseOpenings,searchOpenings,openingLine,historicalPgn,ENDGAMES} from '../public/study-core.js';
const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
test('original opening TSVs parse and every line replays legally',()=>{
 const rows=['a','b','c','d','e'].flatMap(x=>parseOpenings(read('openings/'+x+'.tsv')));
 assert.ok(rows.length>=3800);
 for(const r of rows){const line=openingLine(r,Chess);assert.equal(line.positions.length,line.moves.length+1,r.name);}
 assert.ok(searchOpenings(rows,'C50 Italian Game').length);
 assert.equal(searchOpenings(rows,'nonsense').length,0);
});
test('historical PGNs replay with exact results and player headers',()=>{
 const {games}=JSON.parse(read('historical-games.json'));assert.equal(games.length,7);
 for(const r of games){const g=new Chess();g.loadPgn(historicalPgn(r,Chess));assert.equal(g.getHeaders().White,r.white);assert.equal(g.getHeaders().Black,r.black);assert.equal(g.getHeaders().Result,r.result);assert.ok(g.history().length>30);}
 const opera=new Chess();opera.loadPgn(historicalPgn(games.find(g=>g.id==='opera'),Chess));assert.equal(opera.history().at(-1),'Rd8#');assert.ok(opera.isCheckmate());
});
test('endgame topics are source tags, not invented exercise IDs',()=>{assert.deepEqual(Object.keys(ENDGAMES),['endgame','pawnEndgame','rookEndgame','bishopEndgame','knightEndgame','queenEndgame','queenRookEndgame']);});
