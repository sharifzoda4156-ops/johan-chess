import test from 'node:test';
import { Chess } from 'chess.js';
import {spawn} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {createInterface} from 'node:readline';
import assert from 'node:assert/strict';
const games=[
'e4 e5 Nf3 Nc6 Bc4 Bc5 d3 d6 Ng5 Nh6 Qh5 Bg4 Bxf7+ Nxf7 Qxf7#',
'e4 e5 Nf3 Nc6 Bc4 Nd4 Nxd4 exd4 O-O Bc5 Bxf7+ Kxf7 Qh5+ g6 Qxc5 d6 Qxd4 Nf6 d3 Be6 Nc3 Re8 Bg5 c5 Bxf6 Qxf6 Qxd6 Kg8 Nd5 Qf7 Nc7 Red8 Qxe6 Qxe6 Nxe6 Rd7 f4 Rc8 f5 gxf5 Rxf5 c4 Raf1 cxd3 Rf8+ Rxf8 Rxf8#'];
test('one-off Stockfish analysis, no product changes', {timeout:240000}, async()=>{
 const dir='node_modules/stockfish/bin/';
 const files=readdirSync(dir);
 const engine=files.find(f=>/^stockfish-18-single(?:-[\w]+)?\.js$/.test(f))||files.find(f=>/^stockfish-18-lite-single(?:-[\w]+)?\.js$/.test(f));
 assert.ok(engine,files.join(','));
 const p=spawn(process.execPath,[dir+engine],{stdio:['pipe','pipe','inherit']});
 const reader=createInterface({input:p.stdout});
 const it=reader[Symbol.asyncIterator]();
 const send=s=>p.stdin.write(s+'\n');
 async function until(re){let last;while(true){const n=await it.next();if(n.done)throw Error('engine ended');if(re.test(n.value))return {line:n.value,last};if(/^info depth \d+.* score (cp|mate) /.test(n.value)&&!n.value.includes('bound'))last=n.value;}}
 try{
 send('uci');await until(/^uciok/);send('setoption name Hash value 64');send('isready');await until(/^readyok/);
 console.log('ENGINE '+engine);
 async function evalpos(board){if(board.isCheckmate())return {mate:0}; send('position fen '+board.fen());send('go depth 18 movetime 1800');const {line,last}=await until(/^bestmove/);const m=last?.match(/score (cp|mate) (-?\d+)/);const depth=last?.match(/depth (\d+)/)?.[1];const pv=last?.split(' pv ')[1];return {depth:Number(depth),type:m?.[1],value:Number(m?.[2])*(board.turn()==='w'?1:-1),best:line.split(' ')[1],pv};}
 for(const [i,game] of games.entries()){const b=new Chess();send('ucinewgame');send('isready');await until(/^readyok/);let before=await evalpos(b);for(const san of game.split(' ')){const num=b.moveNumber(), color=b.turn();b.move(san);const after=await evalpos(b);console.log('SF '+JSON.stringify({game:i+1,num,color,san,before,after}));before=after;}}
 } finally {send('quit');p.kill();}
});
