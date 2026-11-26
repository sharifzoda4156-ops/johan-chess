import {platformFetch} from './platform-api.js';
import {gameHistory,ratingCards} from './profile-core.js';
import {earnedAchievements,achievementCards} from './achievement-core.js';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const key=user=>user.trim().toLowerCase();
const modes={rapid:'Рапид',blitz:'Блиц',bullet:'Пуля',daily:'Заочные'};
export function initProfileDashboard({Chess,getUser,setUser,openGame,canSync}){
 let scope='',remote=[],ratings=[],data=null,expanded=false,awardsExpanded=false,earned=[],request=0,loading=false,notice='';
 const awardKey=()=> 'jc-treasure-achievements-v1:'+scope;
 function align(){
  const next=key(getUser());
  if(next===scope)return;
  scope=next;remote=[];ratings=[];expanded=false;awardsExpanded=false;request++;loading=false;notice='';earned=[];
  if(scope)try{const value=JSON.parse(localStorage.getItem(awardKey())||'[]');if(Array.isArray(value))earned=value;}catch{}
 }
 function render(){
  align();if(!data)return;
  if(document.activeElement!==$('profileUser'))$('profileUser').value=getUser();
  $('profileSync').disabled=loading||!scope;
  $('profileSyncStatus').textContent=notice||'Загрузи публичные рейтинги и последние партии Chess.com.';
  const rate=$('profileRatings');rate.replaceChildren();
  if(!ratings.length)rate.append(el('p','Нет загруженных рейтингов Chess.com.','muted'));
  for(const item of ratings){const card=el('div',undefined,'profile-rating');card.append(el('strong',String(item.rating)),el('small',item.label+' · Chess.com'));rate.append(card);}
  const rows=gameHistory(data.local,remote,data.reviews,getUser(),Chess),list=$('profileHistory');list.replaceChildren();
  $('profileHistoryCount').textContent=String(rows.length);
  if(!rows.length)list.append(el('p','Пока нет сохранённых партий. Сыграй с компьютером или загрузи историю Chess.com.','muted'));
  for(const row of rows.slice(0,expanded?rows.length:5)){
   const button=el('button',undefined,'profile-game');button.type='button';
   const result=el('span',row.result==='win'?'+':row.result==='loss'?'−':'½','profile-game-result '+row.result);result.setAttribute('aria-label',({win:'Победа',loss:'Поражение',draw:'Ничья'})[row.result]);
   const info=el('span',undefined,'profile-game-info');info.append(el('strong',row.opponent+(row.rating?' ('+row.rating+')':'')),el('small',[row.source==='training'?'Тренировка':modes[row.timeClass]||'Chess.com',row.color==='w'?'Белые':'Чёрные',row.date].filter(Boolean).join(' · ')));
   button.append(result,info,el('span',row.accuracy===null?'—':row.accuracy.toFixed(1)+'%','profile-game-score'),el('span','›','profile-game-chevron'));
   button.onclick=()=>{if(!openGame(row.pgn))$('profileSyncStatus').textContent='Не удалось открыть партию: закончи текущую игру или анализ.';};list.append(button);
  }
  $('profileMore').hidden=rows.length<=5;$('profileMore').textContent=expanded?'Свернуть историю':'Показать все партии';$('profileMore').setAttribute('aria-expanded',String(expanded));
  const awards=$('profileAwards');awards.replaceChildren();
  const nextEarned=earnedAchievements(rows,Chess,earned);
  if(scope&&JSON.stringify(nextEarned)!==JSON.stringify(earned)){earned=nextEarned;try{localStorage.setItem(awardKey(),JSON.stringify(earned));}catch{}}
  const cards=achievementCards(nextEarned).sort((a,b)=>Number(b.earned)-Number(a.earned)||a.id-b.id);
  $('profileAwardsCount').textContent=nextEarned.length+' / '+cards.length;
  $('profileAwardsMore').textContent=awardsExpanded?'Свернуть':'Все награды';$('profileAwardsMore').setAttribute('aria-expanded',String(awardsExpanded));
  for(const item of cards.slice(0,awardsExpanded?cards.length:6)){const card=el('div',undefined,'profile-award'+(item.earned?' earned':''));const symbol=el('img',undefined,'profile-award-icon');symbol.src='awards/'+item.icon+'.svg';symbol.alt='';symbol.width=32;symbol.height=32;card.append(symbol,el('strong',item.title),el('small',item.description),el('small',item.earned?'Получено':'Не получено','profile-award-state'));awards.append(card);}
 }
 $('profileMore').onclick=()=>{expanded=!expanded;render();};
 $('profileAwardsMore').onclick=()=>{awardsExpanded=!awardsExpanded;render();};
 $('profileSaveUser').onclick=()=>{
  const nick=$('profileUser').value.trim();
  if(!/^[a-zA-Z0-9_-]{1,40}$/.test(nick)){$('profileUserStatus').textContent='Введи корректный ник Chess.com.';return;}
  if(nick!==getUser()&&!setUser(nick)){$('profileUserStatus').textContent='Закончи текущую игру или анализ.';return;}
  $('profileUserStatus').textContent='Ник сохранён.';render();
 };
 async function get(path,user){const r=await platformFetch(path+'?user='+encodeURIComponent(user));if(!r.ok)throw Error('Chess.com недоступен');return r.json();}
 $('profileSync').onclick=async()=>{
  align();if(loading||!scope||!canSync())return;
  const id=++request,user=scope;loading=true;notice='Обновляю данные Chess.com…';render();
  const [stats,games]=await Promise.allSettled([get('/api/player-stats',user),get('/api/games',user)]);
  if(id!==request||key(getUser())!==user)return;
  loading=false;
  if(stats.status==='fulfilled')ratings=ratingCards(stats.value);
  if(games.status==='fulfilled')remote=Array.isArray(games.value.games)?games.value.games:[];
  notice=stats.status==='fulfilled'&&games.status==='fulfilled'?'Данные обновлены · '+new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}):'Не удалось обновить '+(stats.status==='rejected'&&games.status==='rejected'?'данные':stats.status==='rejected'?'рейтинги':'партии')+'. Повтори позже.';
  render();
 };
 return {update(next){data=next;render();}};
}
