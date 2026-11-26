// Lightweight Web Audio API chess sound synthesizer — zero external audio assets.
const KEY='jc-sound-v1';
let enabled=true;
let ctx=null;

export function readSoundEnabled(storage=globalThis.localStorage){
 try{const v=storage?.getItem(KEY);return v===null||v===undefined?true:v!=='0';}catch{return true;}
}
export function saveSoundEnabled(value,storage=globalThis.localStorage){
 enabled=Boolean(value);
 try{storage?.setItem(KEY,enabled?'1':'0');return true;}catch{return false;}
}
export function isSoundEnabled(){return enabled;}

export function initSoundSetting(storage=globalThis.localStorage){
 enabled=readSoundEnabled(storage);
 const el=globalThis.document?.getElementById('soundEnabled');
 if(!el)return;
 el.checked=enabled;
 el.onchange=()=>{saveSoundEnabled(el.checked,storage);if(enabled)playSound('move');};
}

export function soundForMove(move,game=null){
 if(!move)return 'move';
 if(game?.isGameOver?.())return 'end';
 if(game?.isCheck?.()||/[+#]$/.test(move.san||''))return 'check';
 if(move.promotion)return 'promote';
 if(typeof move.flags==='string'&&(move.flags.includes('k')||move.flags.includes('q')))return 'castle';
 if(move.captured||(typeof move.flags==='string'&&(move.flags.includes('c')||move.flags.includes('e'))))return 'capture';
 return 'move';
}

function audio(){
 if(!enabled)return null;
 const Ctor=globalThis.AudioContext||globalThis.webkitAudioContext;
 if(!Ctor)return null;
 if(!ctx)try{ctx=new Ctor();}catch{return null;}
 if(ctx.state==='suspended')ctx.resume().catch(()=>{});
 return ctx;
}

function tone(ac,start,{freq=220,endFreq=120,dur=0.06,gain=0.14,type='triangle'}){
 const osc=ac.createOscillator(),g=ac.createGain();
 osc.type=type;
 osc.frequency.setValueAtTime(freq,start);
 if(endFreq!==freq)osc.frequency.exponentialRampToValueAtTime(Math.max(20,endFreq),start+dur);
 g.gain.setValueAtTime(0.0001,start);
 g.gain.exponentialRampToValueAtTime(gain,start+0.006);
 g.gain.exponentialRampToValueAtTime(0.0001,start+dur);
 osc.connect(g);g.connect(ac.destination);
 osc.start(start);osc.stop(start+dur+0.01);
}

export function playSound(kind='move'){
 const ac=audio();
 if(!ac)return;
 try{
  const t=ac.currentTime;
  if(kind==='move'){
   tone(ac,t,{freq:210,endFreq:115,dur:0.055,gain:0.13,type:'triangle'});
  }else if(kind==='capture'){
   tone(ac,t,{freq:340,endFreq:95,dur:0.075,gain:0.17,type:'sawtooth'});
   tone(ac,t+0.012,{freq:150,endFreq:80,dur:0.06,gain:0.12,type:'triangle'});
  }else if(kind==='castle'){
   tone(ac,t,{freq:210,endFreq:120,dur:0.05,gain:0.12,type:'triangle'});
   tone(ac,t+0.075,{freq:260,endFreq:140,dur:0.055,gain:0.13,type:'triangle'});
  }else if(kind==='check'){
   tone(ac,t,{freq:520,endFreq:440,dur:0.09,gain:0.14,type:'sine'});
   tone(ac,t+0.055,{freq:660,endFreq:580,dur:0.11,gain:0.12,type:'triangle'});
  }else if(kind==='promote'){
   tone(ac,t,{freq:440,endFreq:554,dur:0.08,gain:0.12,type:'triangle'});
   tone(ac,t+0.07,{freq:659,endFreq:880,dur:0.12,gain:0.13,type:'sine'});
  }else if(kind==='end'){
   tone(ac,t,{freq:392,endFreq:392,dur:0.12,gain:0.11,type:'sine'});
   tone(ac,t+0.1,{freq:523,endFreq:523,dur:0.18,gain:0.12,type:'sine'});
  }else if(kind==='illegal'){
   tone(ac,t,{freq:140,endFreq:90,dur:0.09,gain:0.11,type:'sawtooth'});
  }
 }catch{}
}
