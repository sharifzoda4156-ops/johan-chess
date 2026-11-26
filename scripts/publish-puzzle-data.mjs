import {Chess} from 'chess.js';
import {preparePuzzle} from '../public/puzzle-core.js';
import {createInterface} from 'node:readline';
import {mkdirSync,appendFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const [dir,tag]=process.argv.slice(2);
if(!dir||!/^lichess-data-\d+-\d+$/.test(tag||''))throw Error('Usage: output-dir version-tag');
mkdirSync(dir,{recursive:true});
const source='https://database.lichess.org/lichess_db_puzzle.csv.zst',license='CC0-1.0';
const groups=new Map(),packs=[],starter=new Map();
let header,total=0,rejected=0;
const sha=b=>createHash('sha256').update(b).digest('hex');
function flush(g){
 if(!g.rows.length)return;
 const rows=g.rows,buf=Buffer.from(JSON.stringify({license,puzzles:rows}));
 if(buf.length>1024*1024)throw Error('Pack exceeds size limit');
 if(g.offset+buf.length>128*1024*1024){g.part++;g.offset=0;}
 const asset='band-'+g.band+'-'+g.part+'.bin';
 appendFileSync(join(dir,asset),buf);
 packs.push({asset,offset:g.offset,length:buf.length,sha256:sha(buf),count:rows.length,min:Math.min(...rows.map(p=>p.rating)),max:Math.max(...rows.map(p=>p.rating)),themes:[...new Set(rows.flatMap(p=>p.themes))].sort()});
 g.offset+=buf.length;g.rows=[];
}
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 if(!header){header=line.replace(/^\uFEFF/,'').split(',');for(const k of ['PuzzleId','FEN','Moves','Rating','Popularity','NbPlays','Themes'])if(!header.includes(k))throw Error('Missing '+k);continue;}
 const a=line.split(','),get=k=>a[header.indexOf(k)],id=get('PuzzleId'),fen=get('FEN'),rating=Number(get('Rating')),moves=(get('Moves')||'').split(' '),themes=(get('Themes')||'').split(' ');
 if(!/^[A-Za-z0-9]{5}$/.test(id||'')||!fen||!Number.isInteger(rating)||rating<0||rating>9999||moves.length<2||moves.length%2||moves.some(m=>!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))||themes.some(t=>!/^[A-Za-z0-9]+$/.test(t))){rejected++;continue;}
 const p={id,fen,moves,rating,themes},band=Math.floor(rating/200);
 if(!groups.has(band))groups.set(band,{band,part:0,offset:0,rows:[]});
 const g=groups.get(band);g.rows.push(p);total++;if(g.rows.length===1000)flush(g);
 // Starter: 100 popular positions in each of ten rating bands, 600–2599.
 if(band>=3&&band<=12&&Number(get('Popularity'))>=80&&Number(get('NbPlays'))>=100){
  if(!starter.has(band))starter.set(band,[]);if(starter.get(band).length<100&&preparePuzzle(p,Chess))starter.get(band).push(p);
 }
}
for(const g of groups.values())flush(g);
const puzzles=[...starter.values()].flat();
if(total<1000000||puzzles.length!==1000)throw Error('Incomplete source or starter: '+total+' / '+puzzles.length);
const catalog={schema:1,tag,source,license,total,rejected,packs};
const catalogText=JSON.stringify(catalog);if(Buffer.byteLength(catalogText)>8*1024*1024||new Set(packs.map(p=>p.asset)).size>998)throw Error('Catalog exceeds client or release limits');
writeFileSync(join(dir,'catalog.json'),catalogText);
writeFileSync(join(dir,'starter.json'),JSON.stringify({source,license,puzzles}));
console.log(JSON.stringify({total,rejected,starter:puzzles.length,packs:packs.length}));
