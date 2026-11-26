export function normalizeScreen(requested,playing){return playing?'play':['home','puzzles','play','review','coach'].includes(requested)?requested:'home';}
export function parentTab(screen){return ['play','review'].includes(screen)?'home':screen;}
export function initNavigation(){
 let playing=false,screen='home';
 const buttons=[...document.querySelectorAll('[data-tab]')],links=[...document.querySelectorAll('[data-go]')],screens=[...document.querySelectorAll('[data-screen]')];
 function show(requested,{scroll=true}={}){
  screen=normalizeScreen(requested,playing);
  for(const panel of screens)panel.hidden=panel.dataset.screen!==screen;
  for(const b of buttons){const active=b.dataset.tab===parentTab(screen);b.setAttribute('aria-current',active?'page':'false');b.disabled=playing;}
  for(const link of links)link.disabled=playing;
  if(scroll)window.scrollTo({top:0,behavior:'auto'});
  document.dispatchEvent(new CustomEvent('jc-screen',{detail:screen}));
 }
 for(const b of buttons)b.addEventListener('click',()=>show(b.dataset.tab));
 for(const link of links)link.addEventListener('click',()=>show(link.dataset.go));
 show('home',{scroll:false});
 return {show,setPlaying(value){playing=value;document.body.classList.toggle('is-playing',value);show(value?'play':screen,{scroll:value});}};
}
