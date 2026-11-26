import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {displayName,profileStats,gameHistory,ratingCards,profileAwards} from '../public/profile-core.js';
test('display name only from connected identity, with nickname fallback',()=>{
 assert.equal(displayName({connected:true,name:'  Alice  '},'Johan'),'Alice');
 assert.equal(displayName({connected:false,name:'Alice'},'Johan'),'Johan');
 assert.equal(displayName({connected:true,email:'secret@example.com'},'Johan'),'Johan');
});
test('local stats respect player color, invalid PGN and separate users',()=>{
 const pgn=(white,black,result)=>'[White "'+white+'"]\n[Black "'+black+'"]\n[Result "'+result+'"]\n\n1. e4 '+result;
 const rows=[{user:'Johan',pgn:pgn('Johan','Stockfish 3','1-0')},{user:'Johan',pgn:pgn('Stockfish 3','Johan','1-0')},{user:'Johan',pgn:pgn('Stockfish 3','Johan','1/2-1/2')},{user:'Other',pgn:pgn('Other','Stockfish 3','1-0')}];
 assert.deepEqual(profileStats(rows,[{color:'w',accuracy:80},{color:'b',accuracy:60}],'johan',Chess),{played:3,wins:1,losses:1,draws:1,reviewed:2,accuracy:70});
 assert.equal(profileStats([],[],'johan',Chess).accuracy,null);
});

test('ratings show only real current Chess.com categories',()=>{
 assert.deepEqual(ratingCards({chess_rapid:{last:{rating:1029}},chess_blitz:{best:{rating:1800}},chess_bullet:{last:{rating:'1000'}}}),[{key:'rapid',label:'Рапид',rating:1029}]);
 assert.deepEqual(ratingCards(null),[]);
});
test('history is player scoped, uses PGN result and matches review fingerprint',()=>{
 const pgn='[White "Bot"]\\n[Black "Johan"]\\n[WhiteElo "1200"]\\n[Date "2026.11.26"]\\n[Result "0-1"]\\n\\n1. e4 e5 0-1'.replaceAll('\\n','\n');
 const c=new Chess();c.loadPgn(pgn);const m=c.history({verbose:true});
 const id=['Bot','Johan','2026.11.26',m[0].before,m.map(x=>x.san).join(' ')].join('|');
 const rows=gameHistory([{pgn,user:'other'},{pgn,user:'Johan',date:'2026-11-25'}],[{pgn,ended:1795690000},{pgn,ended:1795690000}],[{id,accuracy:88}], 'johan',Chess);
 assert.equal(rows.length,2);const imported=rows.find(r=>r.source==='chesscom');
 assert.equal(imported.result,'win');assert.equal(imported.color,'b');assert.equal(imported.rating,1200);assert.equal(imported.accuracy,88);
 assert.equal(rows.find(r=>r.source==='training').rating,null);
 assert.deepEqual(gameHistory([], [{pgn}], [], 'other',Chess),[]);
});
test('awards reflect actual progress without awarding empty profiles',()=>{
 const empty={played:0,wins:0,reviewed:0},puzzles={solved:[],bestStreak:0};
 assert.ok(profileAwards(empty,puzzles).every(x=>!x.earned));
 const rows=profileAwards({...empty,played:1,wins:1},{solved:Array(10).fill('x'),bestStreak:5});
 assert.equal(rows.filter(x=>x.earned).length,4);
});
