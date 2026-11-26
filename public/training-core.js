export const LEVELS=[0,3,6,10,15,20];
export const DEFAULT_ADAPTIVE=1;
export const CONTROLS={'free':{base:null,increment:0},'10+0':{base:600000,increment:0},'15+10':{base:900000,increment:10000},'30+0':{base:1800000,increment:0}};
export const opposite=c=>c==='w'?'b':'w';
export const resultFor=c=>c==='w'?'1-0':'0-1';
export function clockText(ms){if(ms===null)return '∞';const s=Math.max(0,Math.ceil(ms/1000));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
export function makeClock(control,turn,now){const x=CONTROLS[control];if(!x)throw Error('Unknown time control');return {w:x.base,b:x.base,increment:x.increment,turn,since:now};}
export function remaining(clock,now){const next={w:clock.w,b:clock.b};if(next[clock.turn]!==null)next[clock.turn]=Math.max(0,next[clock.turn]-Math.max(0,now-clock.since));return next;}
export function nextClock(clock,now){const r=remaining(clock,now),c=clock.turn;if(r[c]===0)return null;if(r[c]!==null)r[c]+=clock.increment;return {...clock,...r,turn:opposite(c),since:now};}
export function terminal(game){if(game.isCheckmate())return {result:resultFor(opposite(game.turn())),reason:'Мат'};if(game.isStalemate())return {result:'1/2-1/2',reason:'Пат'};if(game.isInsufficientMaterial())return {result:'1/2-1/2',reason:'Недостаточно материала'};if(game.isThreefoldRepetition())return {result:'1/2-1/2',reason:'Троекратное повторение'};if(game.isDrawByFiftyMoves())return {result:'1/2-1/2',reason:'Правило 50 ходов'};return null;}
export function flagResult(game,loser){const winner=opposite(loser),pieces=game.board().flat().filter(p=>p&&p.color===winner&&p.type!=='k');return {result:pieces.length?resultFor(winner):'1/2-1/2',reason:pieces.length?'Время истекло':'Время истекло · у соперника только король'};}
export function adaptiveLevel(index,result,color){const i=Number.isInteger(index)?Math.max(0,Math.min(LEVELS.length-1,index)):DEFAULT_ADAPTIVE;return result===resultFor(color)?Math.min(LEVELS.length-1,i+1):result===resultFor(opposite(color))?Math.max(0,i-1):i;}
export function parseUci(uci){if(typeof uci!=='string'||!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))throw Error('Некорректный ход Stockfish');return {from:uci.slice(0,2),to:uci.slice(2,4),...(uci.length===5?{promotion:uci[4]}:{})};}
