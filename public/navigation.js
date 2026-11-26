export function normalizeScreen(requested,playing){return playing?'play':['home','puzzles','play','review','coach','profile','library','online','account'].includes(requested)?requested:'home';}
export function parentTab(screen){return ['play','review','online'].includes(screen)?'home':screen==='library'?'coach':screen==='account'?'profile':screen;}
export function initNavigation(){
 let playing=false,online=false,screen='home';
 const buttons=[...document.querySelectorAll('[data-tab]')],links=[...document.querySelectorAll('[data-go]')],screens=[...document.querySelectorAll('[data-screen]')];
 function show(requested,{scroll=true}={}){
  const target=requested==='coach'&&!globalThis.JohanNative?'library':requested;
  screen=online?'online':normalizeScreen(target,playing);
  for(const panel of screens){const hidden=panel.dataset.screen!==screen;if(panel.hidden!==hidden)panel.hidden=hidden;}
  for(const b of buttons){const active=b.dataset.tab===parentTab(screen);b.setAttribute('aria-current',active?'page':'false');b.disabled=playing||online;}
  for(const link of links)link.disabled=playing||online;
  if(scroll)window.scrollTo({top:0,behavior:'auto'});
  document.dispatchEvent(new CustomEvent('jc-screen',{detail:screen}));
 }
 for(const b of buttons)b.addEventListener('click',()=>show(b.dataset.tab));
 for(const link of links)link.addEventListener('click',()=>show(link.dataset.go));
 show('home',{scroll:false});
 return {show,setOnline(value){if(online===value)return;online=value;document.body.classList.toggle('is-online-playing',value);show(value?'online':screen,{scroll:value});},setPlaying(value){playing=value;document.body.classList.toggle('is-playing',value);show(value?'play':screen,{scroll:value});}};
}
