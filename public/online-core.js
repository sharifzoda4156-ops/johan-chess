const END=new Set(['aborted','mate','resign','stalemate','timeout','draw','outoftime','cheat','noStart','unknownFinish','variantEnd']);
export const finishedStatus=s=>END.has(s);
export const validNick=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,30}$/.test(s);
export const validGameId=s=>typeof s==='string'&&/^[A-Za-z0-9]{8}$/.test(s);
export function matchControl(minutes,increment,direct=false){
 return [3,5,10,15,30].includes(minutes)&&[0,2,3,5,10,20].includes(increment)&&minutes*60+40*increment>=(direct?180:480);
}
 export function readOnlineGame(full,state,username,Chess){
 if(!full||!state||full.variant?.key!=='standard'||!validGameId(full.id))throw Error('Поддерживаются только стандартные шахматы');
 const nick=String(username).toLowerCase(),color=String(full.white?.id||'').toLowerCase()===nick?'w':String(full.black?.id||'').toLowerCase()===nick?'b':null;
 if(!color)throw Error('Эта партия не принадлежит аккаунту');
 if(typeof state.moves!=='string'||state.moves.length>12000)throw Error('Некорректные ходы сервера');
 const game=full.initialFen==='startpos'||!full.initialFen?new Chess():new Chess(full.initialFen);
 const moves=state.moves.trim()?state.moves.trim().split(/\s+/):[];
 for(const u of moves){if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u))throw Error('Неверный ход сервера');game.move({from:u.slice(0,2),to:u.slice(2,4),...(u.length===5?{promotion:u[4]}:{})});}
 const ms=x=>Number.isFinite(x)?Math.max(0,x):0;
 const done=finishedStatus(state.status);
 const expMs=Number(full.expiration?.millisToMove);
 const firstMoveMs=!done&&state.status==='started'&&moves.length<2?(Number.isFinite(expMs)&&expMs>0?expMs:30000):null;
 return {game,moves,color,done,status:state.status,winner:state.winner,white:full.white,black:full.black,wtime:ms(state.wtime),btime:ms(state.btime),firstMoveMs,drawOffer:color==='w'?!!state.bdraw:!!state.wdraw};
}
export function firstMoveRemaining(s,elapsed){
 if(!s||s.done||s.status!=='started'||s.moves.length>=2||!Number.isFinite(s.firstMoveMs))return null;
 return Math.max(0,s.firstMoveMs-Math.max(0,elapsed));
}
export function serverClock(s,elapsed){
 const e=!s.done&&s.moves.length>=2&&s.status==='started'?Math.max(0,elapsed):0;
 return {w:Math.max(0,s.wtime-(s.game.turn()==='w'?e:0)),b:Math.max(0,s.btime-(s.game.turn()==='b'?e:0))};
}
export function resultText(s){if(!s.done)return s.game.turn()===s.color?'Твой ход':'Ход соперника';if(s.status==='aborted'||s.status==='noStart')return 'Партия отменена';if(!s.winner)return 'Ничья';return (s.winner==='white'?'w':'b')===s.color?'Победа':'Поражение';}
export function completedPgn(text,Chess){const c=new Chess();c.loadPgn(text);return c.history().length>0&&['1-0','0-1','1/2-1/2'].includes(c.getHeaders().Result);}
