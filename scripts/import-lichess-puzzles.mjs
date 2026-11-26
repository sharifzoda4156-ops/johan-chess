import {createInterface} from 'node:readline';
import {writeFile,rename} from 'node:fs/promises';
import {Chess} from 'chess.js';
import {preparePuzzle} from '../public/puzzle-core.js';
const source='https://database.lichess.org/lichess_db_puzzle.csv.zst';
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
const bands=new Map(),ids=new Set();let header=null;
for await(const line of input){
 if(!header){header=line.replace(/^\uFEFF/,'').split(',');for(const k of ['PuzzleId','FEN','Moves','Rating','Popularity','NbPlays','Themes'])if(!header.includes(k))throw Error('Missing CSV column '+k);continue;}
 const a=line.split(',');const get=k=>a[header.indexOf(k)]; // official FEN, UCI and theme fields contain no commas
 const rating=Number(get('Rating')),pop=Number(get('Popularity')),plays=Number(get('NbPlays'));
 if(!Number.isInteger(rating)||rating<400||rating>=3000||pop<80||plays<100)continue;
 const band=Math.floor(rating/200);if((bands.get(band)?.length||0)>=1000)continue;
 const p={id:get('PuzzleId'),fen:get('FEN'),moves:(get('Moves')||'').split(' '),rating,themes:(get('Themes')||'').split(' ')};
 if(ids.has(p.id)||!preparePuzzle(p,Chess))continue;
 ids.add(p.id);if(!bands.has(band))bands.set(band,[]);bands.get(band).push(p);
}
const puzzles=[...bands.values()].flat();
if(puzzles.length<5000)throw Error('Incomplete official dataset: '+puzzles.length);
const output=process.argv[2]||'public/lichess-puzzles.json';
await writeFile(output+'.tmp',JSON.stringify({source,license:'CC0-1.0',puzzles}));
await rename(output+'.tmp',output);
console.log('Imported '+puzzles.length+' verified Lichess puzzles');
