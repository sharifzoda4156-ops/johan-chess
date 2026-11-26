export function normalizeScreen(requested,playing){return playing?'play':['play','review','coach'].includes(requested)?requested:'play';}
export function initNavigation(){
 let playing=false,screen='play';
 const buttons=[...document.querySelectorAll('[data-tab]')];
 const screens=[...document.querySelectorAll('[data-screen]')];
 function show(requested,{scroll=true}={}){
  screen=normalizeScreen(requested,playing);
  for(const panel of screens)panel.hidden=panel.dataset.screen!==screen;
  for(const b of buttons){const active=b.dataset.tab===screen;b.setAttribute('aria-current',active?'page':'false');b.disabled=playing&&!active;}
  if(scroll)window.scrollTo({top:0,behavior:'instant'});
 }
 for(const b of buttons)b.addEventListener('click',()=>show(b.dataset.tab));
 return {show,setPlaying(value){playing=value;document.body.classList.toggle('is-playing',value);show(value?'play':screen,{scroll:value});}};
}
