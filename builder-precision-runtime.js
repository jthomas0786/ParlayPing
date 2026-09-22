const state=window.__PARLAYPING_BUILDER__||{};
const slip=state.slip||{legs:[]};
const legs=Array.isArray(slip.legs)?slip.legs:[];
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parlayPanel=q('.parlay-panel');
const picks=q('#picks');
const tuneBtn=q('#tuneBtn');
const saveBtn=q('#saveBtn');
const clearAllBtn=q('#clearAllBtn');
const addPickBtn=q('#addPickBtn');
const legCount=q('#legCount');
const combinedOdds=q('#combinedOdds');
const impliedProbability=q('#impliedProbability');
const selectedBookLabel=q('#selectedBookLabel');
const openBookBtn=q('#openBookBtn');
const toast=q('#toast');
let toastTimer=null;

function icon(name){
  const icons={
    build:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13 2-8 12h6l-1 8 9-13h-6z"/></svg>',
    explore:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
    community:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 19c.6-4 2.7-6 5.5-6s5 2 5.5 6M14 14c2.8 0 4.8 1.7 5.5 4.5"/></svg>',
    insights:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9M12 19V4M19 19v-7"/></svg>',
    search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m15.6 15.6 4.4 4.4"/></svg>',
    bell:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 6 2.2 6.1 2.2 7.8H4.3c0-1.7 2.2-1.8 2.2-7.8Z"/><path d="M9.5 20h5"/></svg>',
    sliders:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h8M16 18h4"/><circle cx="16" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="18" r="2"/></svg>',
    link:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a4 4 0 0 0 5.7.1l2.4-2.4a4 4 0 0 0-5.7-5.7L11 6.4"/><path d="M14 11a4 4 0 0 0-5.7-.1l-2.4 2.4a4 4 0 0 0 5.7 5.7l1.4-1.4"/></svg>',
    users:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 19c.6-4 2.7-6 5.5-6s5 2 5.5 6M14 14c2.8 0 4.8 1.7 5.5 4.5"/></svg>',
    bars:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9M12 19V4M19 19v-7"/></svg>',
    save:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
    copy:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',
    message:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v11H9l-5 4z"/></svg>',
    more:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none"/></svg>'
  };
  return icons[name]||'';
}

function say(message){
  if(!toast)return;
  toast.textContent=message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove('show'),1700);
}

function formatOdds(v){const n=Number(v);if(!Number.isFinite(n))return '—';return n>0?`+${Math.round(n)}`:`${Math.round(n)}`;}
function impliedFromAmerican(v){const n=Number(v);if(!Number.isFinite(n)||n===0)return null;return n>0?100/(n+100):(-n)/((-n)+100);}
function initials(name){return String(name||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'?';}
function titleCase(value){return String(value||'').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());}

function installHeader(){
  const brand=q('.brand');
  if(brand){
    brand.innerHTML='<img class="pp-brand-mark" src="/parlayping-logo.svg" alt=""/><span class="pp-brand-copy"><span class="pp-brand-name">Parlay<em>Ping</em></span><span class="pp-brand-tag">BET SMARTER TOGETHER</span></span>';
    brand.href='#top';
  }
  const navIcons=['build','explore','community','insights'];
  qa('.main-nav .nav-item').forEach((item,i)=>{const slot=q('.nav-icon',item);if(slot)slot.innerHTML=icon(navIcons[i]||'');});
  const search=q('.search-button');if(search)search.innerHTML=icon('search');
  const bell=q('.notification-button');if(bell)bell.innerHTML=`${icon('bell')}<span class="notification-badge">3</span>`;
  qa('.hero-tool-icon').forEach((slot,i)=>slot.innerHTML=icon(['sliders','link','users','bars'][i]||''));
  if(tuneBtn)tuneBtn.innerHTML=`${icon('sliders')}Parlay Tune`;
  if(saveBtn)saveBtn.innerHTML=`${icon('save')}Save`;
}

const ESPN_TEAM_SLUGS={
  NFL:{ARI:'ari',ATL:'atl',BAL:'bal',BUF:'buf',CAR:'car',CHI:'chi',CIN:'cin',CLE:'cle',DAL:'dal',DEN:'den',DET:'det',GB:'gb',HOU:'hou',IND:'ind',JAX:'jax',KC:'kc',LV:'lv',LAC:'lac',LAR:'lar',MIA:'mia',MIN:'min',NE:'ne',NO:'no',NYG:'nyg',NYJ:'nyj',PHI:'phi',PIT:'pit',SEA:'sea',SF:'sf',TB:'tb',TEN:'ten',WSH:'wsh'},
  NBA:{ATL:'atl',BOS:'bos',BKN:'bkn',CHA:'cha',CHI:'chi',CLE:'cle',DAL:'dal',DEN:'den',DET:'det',GS:'gs',GSW:'gs',HOU:'hou',IND:'ind',LAC:'lac',LAL:'lal',MEM:'mem',MIA:'mia',MIL:'mil',MIN:'min',NO:'no',NOP:'no',NY:'ny',NYK:'ny',OKC:'okc',ORL:'orl',PHI:'phi',PHX:'phx',POR:'por',SAC:'sac',SA:'sa',SAS:'sa',TOR:'tor',UTA:'utah',UTAH:'utah',WAS:'wsh',WSH:'wsh'},
  NHL:{ANA:'ana',BOS:'bos',BUF:'buf',CGY:'cgy',CAR:'car',CHI:'chi',COL:'col',CBJ:'cbj',DAL:'dal',DET:'det',EDM:'edm',FLA:'fla',LA:'la',MIN:'min',MTL:'mtl',NSH:'nsh',NJ:'nj',NYI:'nyi',NYR:'nyr',OTT:'ott',PHI:'phi',PIT:'pit',SEA:'sea',SJ:'sj',STL:'stl',TB:'tb',TOR:'tor',UTA:'utah',VAN:'van',VGK:'vgk',WSH:'wsh',WPG:'wpg'},
  MLB:{ARI:'ari',ATL:'atl',BAL:'bal',BOS:'bos',CHC:'chc',CWS:'chw',CHW:'chw',CIN:'cin',CLE:'cle',COL:'col',DET:'det',HOU:'hou',KC:'kc',LAA:'laa',LAD:'lad',MIA:'mia',MIL:'mil',MIN:'min',NYM:'nym',NYY:'nyy',ATH:'ath',OAK:'oak',PHI:'phi',PIT:'pit',SD:'sd',SEA:'sea',SF:'sf',STL:'stl',TB:'tb',TEX:'tex',TOR:'tor',WSH:'wsh'}
};
const ESPN_SPORT_PATH={NFL:'nfl',NBA:'nba',NHL:'nhl',MLB:'mlb',WNBA:'wnba'};
function matchupTeams(matchup){
  const raw=String(matchup||'').toUpperCase();
  const m=raw.match(/\b([A-Z]{2,4})\s*(?:@|VS\.?|V\.?|AT)\s*([A-Z]{2,4})\b/);
  return m?[m[1],m[2]]:[];
}
function teamLogoUrl(sport,abbr){
  const s=String(sport||'').toUpperCase(),a=String(abbr||'').toUpperCase();
  const path=ESPN_SPORT_PATH[s],slug=ESPN_TEAM_SLUGS[s]?.[a];
  return path&&slug?`https://a.espncdn.com/i/teamlogos/${path}/500/${slug}.png`:null;
}
function teamToken(sport,abbr,explicit,primary){
  const code=String(abbr||primary||sport||'?').toUpperCase();
  const url=(explicit&&String(primary||'').toUpperCase()===code)?explicit:teamLogoUrl(sport,code);
  if(url)return `<img src="${esc(url)}" alt="${esc(code)}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"/><span class="team-token" style="display:none">${esc(code.slice(0,3))}</span>`;
  return `<span class="team-token">${esc(code.slice(0,3))}</span>`;
}
function teamPair(leg){
  const teams=matchupTeams(leg.matchup);
  if(teams.length===2)return `${teamToken(leg.sport,teams[0],leg.teamLogoUrl,leg.team)}${teamToken(leg.sport,teams[1],leg.teamLogoUrl,leg.team)}`;
  return `${teamToken(leg.sport,leg.team,leg.teamLogoUrl,leg.team)}<span class="team-token">${esc(String(leg.sport||'').slice(0,3))}</span>`;
}
function playerPhoto(leg){
  if(leg.playerImageUrl)return `<img class="player-photo" src="${esc(leg.playerImageUrl)}" alt="${esc(leg.player||'Player')}" onerror="this.outerHTML='<span class=&quot;player-photo player-fallback&quot;>${esc(initials(leg.player))}</span>'"/>`;
  return `<span class="player-photo player-fallback">${esc(initials(leg.player))}</span>`;
}
function marketText(leg){
  if(leg.displayMarket)return String(leg.displayMarket);
  const market=String(leg.market||'Prop');
  if(/atd|anytime.*touchdown/i.test(market))return 'Anytime TD Scorer';
  if(/atg|anytime.*goal/i.test(market))return 'Anytime Goal Scorer';
  if(leg.side&&leg.line!=null)return `${titleCase(leg.side)} ${leg.line} ${market}`;
  return market;
}
function matchupText(leg){return String(leg.matchup||leg.team||`${leg.sport||'Sport'} matchup`);}
function formatStart(value){
  if(!value)return {date:'',time:''};
  const d=new Date(value);if(Number.isNaN(d.getTime()))return {date:'',time:''};
  return {date:d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}),time:d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})};
}
function probabilityDisplay(leg){
  const status=String(leg.status||'PENDING').toUpperCase();
  if(['HIT','MISS','PUSH','VOID','UNRESOLVED'].includes(status))return {label:status,value:0,status:true};
  if(status==='LIVE'&&Number.isFinite(Number(leg.liveProbability)))return {label:`${(Number(leg.liveProbability)*100).toFixed(1)}%`,value:Number(leg.liveProbability)*100,status:false};
  if(status==='LIVE'&&Number.isFinite(Number(leg.pregameProbability)))return {label:`PG ${(Number(leg.pregameProbability)*100).toFixed(1)}%`,value:Number(leg.pregameProbability)*100,status:false};
  if(Number.isFinite(Number(leg.pregameProbability)))return {label:`${(Number(leg.pregameProbability)*100).toFixed(1)}%`,value:Number(leg.pregameProbability)*100,status:false};
  return {label:'—',value:0,status:false};
}
function altButtons(leg){
  const source=Array.isArray(leg.altLines)?leg.altLines.slice(0,5):[];
  const options=source.length?source:[{line:leg.line!=null?leg.line:'Current',oddsAmerican:leg.oddsAmerican,probability:leg.pregameProbability,current:true}];
  const buttons=options.map((opt,i)=>{
    const p=Number(opt.probability),odds=Number(opt.oddsAmerican);
    const current=opt.current===true||(!source.length&&i===0);
    return `<button class="alt-option ${current?'selected':''}" type="button" data-line="${esc(opt.line??'—')}" data-prob="${Number.isFinite(p)?p:''}" data-odds="${Number.isFinite(odds)?odds:''}">${esc(opt.line??'—')}</button>`;
  });
  while(buttons.length<5)buttons.push('<button class="alt-option" type="button" disabled>—</button>');
  return buttons.join('');
}
function renderLeg(leg,index){
  const prob=probabilityDisplay(leg),meter=Math.max(0,Math.min(100,Number(prob.value)||0)),start=formatStart(leg.startTimeUTC),match=matchupText(leg);
  const time=start.date?`<div class="game-time"><span>${esc(start.date)}</span><i>•</i><span>${esc(start.time)}</span></div>`:'';
  return `<article class="pick-card" data-pick="${esc(leg.id||`leg-${index+1}`)}">
    <header class="game-bar"><span class="sport-shield">${esc(String(leg.sport||'').slice(0,4))}</span><div class="team-pair">${teamPair(leg)}</div><strong>${esc(match)}</strong>${time}</header>
    <div class="pick-main">
      <div class="player-block">${playerPhoto(leg)}<div class="player-copy"><strong>${esc(leg.player||'Selection')}</strong><span>${esc(marketText(leg))}</span><small>${esc(match)}</small></div></div>
      <div class="probability-meter"><span class="meter-track"><i style="--meter:${meter}%"></i></span><strong class="pick-probability ${prob.status?'status-label':''}">${esc(prob.label)}</strong></div>
      <div class="pick-odds">${esc(formatOdds(leg.oddsAmerican))}</div><button class="kebab" type="button" aria-label="${esc(leg.player||'Bet')} options">⋮</button>
    </div>
    <div class="alt-lines" aria-hidden="true"><div class="alt-title">Alt Lines <span class="info-dot">i</span></div><div class="alt-options" role="group" aria-label="${esc(leg.player||'Player')} alternate lines">${altButtons(leg)}</div></div>
  </article>`;
}

function renderMetrics(){
  if(legCount)legCount.textContent=String(legs.length);
  const verified=slip.combinedOddsVerified===true&&Number.isFinite(Number(slip.combinedOddsAmerican));
  if(combinedOdds)combinedOdds.textContent=verified?formatOdds(slip.combinedOddsAmerican):'—';
  const implied=verified?impliedFromAmerican(slip.combinedOddsAmerican):null;
  if(impliedProbability)impliedProbability.textContent=implied!=null?`${(implied*100).toFixed(1)}%`:'—';
}
function renderPicks(){
  if(!picks)return;
  picks.innerHTML=legs.length?legs.map(renderLeg).join(''):'<div class="empty-state"><strong>No legs available.</strong><p>This signed betslip does not contain any valid selections.</p></div>';
}
function setTuneState(open){
  parlayPanel?.classList.toggle('tune-open',open);
  tuneBtn?.classList.toggle('active',open);
  tuneBtn?.setAttribute('aria-expanded',String(open));
  qa('.alt-lines').forEach(el=>el.setAttribute('aria-hidden',String(!open)));
}
function bindAltLines(){
  qa('.alt-option:not(:disabled)').forEach(btn=>btn.addEventListener('click',()=>{
    const card=btn.closest('.pick-card');
    qa('.alt-option',card).forEach(x=>x.classList.remove('selected'));
    btn.classList.add('selected');
    const p=Number(btn.dataset.prob),odds=Number(btn.dataset.odds),meter=q('.meter-track i',card),label=q('.pick-probability',card),price=q('.pick-odds',card);
    if(Number.isFinite(p)&&p>=0&&p<=1){if(label){label.textContent=`${(p*100).toFixed(1)}%`;label.classList.remove('status-label');}if(meter)meter.style.setProperty('--meter',`${p*100}%`);}
    if(Number.isFinite(odds)&&price)price.textContent=formatOdds(odds);
    if(combinedOdds)combinedOdds.textContent='CUSTOM';
    if(impliedProbability)impliedProbability.textContent='Repricing';
    say(`${q('.player-copy strong',card)?.textContent||'Pick'} moved to ${btn.dataset.line}`);
  }));
  qa('.kebab').forEach(btn=>btn.addEventListener('click',()=>say('Bet options are being connected.')));
}

function logoMarkup(book){
  if(book==='DraftKings')return '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 7h5l4 6 4-6h5l-3 10-6 8-6-8z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 6l3 3 3-5 3 5 3-3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  if(book==='FanDuel')return '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 8c7-1 13-3 20-5-2 12-7 20-14 26-3-7-5-14-6-21Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 10c4-.5 7-1.5 11-3-2 6-5 11-8 14" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  if(book==='bet365')return '<span style="font-weight:950;letter-spacing:-.06em">bet<span style="color:#ffd33d">365</span></span>';
  if(book==='Caesars')return '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 11c-5-2-9 1-9 5s4 7 9 5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  if(book==='ESPN BET')return '<span style="font-weight:950;font-style:italic">B</span>';
  return '<span style="font-weight:950;letter-spacing:.13em">•••</span>';
}
function setupSportsbooks(){
  qa('.book-card').forEach(card=>{const book=card.dataset.book||'';const logo=q('.book-logo',card);if(logo)logo.innerHTML=logoMarkup(book);});
  const preferred=String(slip.sportsbook||legs.find(l=>l.sportsbook)?.sportsbook||'DraftKings').toLowerCase();
  let selected=null;
  qa('.book-card').forEach(card=>{const hit=String(card.dataset.book||'').toLowerCase()===preferred;card.classList.toggle('active',hit);if(hit)selected=card;});
  if(!selected){selected=q('.book-card[data-book="DraftKings"]');selected?.classList.add('active');}
  if(selectedBookLabel)selectedBookLabel.textContent=selected?.dataset.book||'DraftKings';
  qa('.book-card').forEach(button=>button.addEventListener('click',()=>{qa('.book-card').forEach(card=>card.classList.remove('active'));button.classList.add('active');if(selectedBookLabel)selectedBookLabel.textContent=button.dataset.book==='More Books'?'Your Sportsbook':button.dataset.book;}));
}
function verifiedBookLink(book){
  const matching=legs.filter(l=>String(l.sportsbook||'').toLowerCase()===String(book||'').toLowerCase());
  if(matching.length!==legs.length||!matching.length)return null;
  const links=[...new Set(matching.map(l=>l.sportsbookLink).filter(Boolean))];
  return links.length===1?links[0]:null;
}

function preserveConceptPanels(){
  const rows=qa('.similar-row');
  const names=legs.slice(0,3).map(l=>l.player).filter(Boolean);
  const games=new Set(legs.map(l=>l.gameId||l.matchup).filter(Boolean));
  const similar=[
    ['Community Matches',names.join(', ')||'This betslip','Not yet tracked'],
    ['Alt Line Value',legs.some(l=>Array.isArray(l.altLines)&&l.altLines.length)?'Verified alternate lines available':'Verified lines only','Awaiting data'],
    ['Same-Slate Builds',`${games.size||legs.length} game${(games.size||legs.length)===1?'':'s'} represented`,'Awaiting data']
  ];
  rows.forEach((row,i)=>{
    const [title,sub,tail]=similar[i]||similar[similar.length-1];
    const text=q('div:nth-child(2)',row);if(text)text.innerHTML=`<strong>${esc(title)}</strong><small>${esc(sub)}</small>`;
    const tails=q('.tails',row);if(tails)tails.textContent=tail;
    const plus=q('button',row);if(plus){plus.disabled=true;plus.setAttribute('aria-label','Unavailable');}
    const avatars=q('.mini-avatars',row);if(avatars){const avatarLegs=legs.slice(i,i+2);avatars.innerHTML=avatarLegs.map(l=>l.playerImageUrl?`<img src="${esc(l.playerImageUrl)}" alt=""/>`:`<span class="team-token">${esc(initials(l.player))}</span>`).join('');}
  });
  const list=q('.insights-list');
  if(list){
    const live=legs.filter(l=>String(l.status||'').toUpperCase()==='LIVE').length;
    const facts=[`${legs.length} signed leg${legs.length===1?'':'s'} loaded`,`${games.size||legs.length} game${(games.size||legs.length)===1?'':'s'} represented`,slip.combinedOddsVerified?'Verified combined parlay price supplied':'Combined parlay price not supplied',live?`${live} live leg${live===1?'':'s'} currently tracked`:'No live legs currently reported'];
    list.innerHTML=facts.map(x=>`<li><span>✓</span> ${esc(x)}</li>`).join('');
  }
}

function setupShare(){
  const copy=q('#copyLinkBtn'),x=q('#shareXBtn'),message=q('#messageBtn'),more=q('#moreShareBtn');
  const copyCircle=copy&&q('.share-circle',copy);if(copyCircle)copyCircle.innerHTML=icon('copy');
  const msgCircle=message&&q('.share-circle',message);if(msgCircle)msgCircle.innerHTML=icon('message');
  const moreCircle=more&&q('.share-circle',more);if(moreCircle)moreCircle.innerHTML=icon('more');
  async function copyLink(){const url=state.builderUrl||location.href;try{await navigator.clipboard.writeText(url);say('Betslip link copied.');}catch{prompt('Copy this link',url);}}
  async function nativeShare(){const url=state.builderUrl||location.href;if(navigator.share){try{await navigator.share({title:'My ParlayPing Betslip',text:'Check out my ParlayPing betslip',url});return;}catch(error){if(error?.name==='AbortError')return;}}await copyLink();}
  copy?.addEventListener('click',copyLink);
  message?.addEventListener('click',nativeShare);
  more?.addEventListener('click',nativeShare);
  if(x)x.href=`https://x.com/intent/post?text=${encodeURIComponent('Check out my ParlayPing betslip')}&url=${encodeURIComponent(state.builderUrl||location.href)}`;
}

function bindActions(){
  tuneBtn?.addEventListener('click',()=>{const open=!parlayPanel?.classList.contains('tune-open');setTuneState(open);say(open?'Parlay Tune opened.':'Parlay Tune closed.');});
  saveBtn?.addEventListener('click',()=>{try{localStorage.setItem(`parlayping_builder_${state.token||'shared'}`,JSON.stringify({savedAt:Date.now(),url:state.builderUrl}));saveBtn.classList.add('saved');saveBtn.innerHTML='✓ Saved';say('Parlay saved on this device.');}catch{say('Unable to save in this browser.');}});
  clearAllBtn?.addEventListener('click',()=>{if(picks)picks.innerHTML='<div class="empty-state"><strong>Your parlay is clear.</strong><p>Reload the shared link to restore the signed picks.</p></div>';if(legCount)legCount.textContent='0';if(combinedOdds)combinedOdds.textContent='—';if(impliedProbability)impliedProbability.textContent='—';say('Parlay cleared locally.');});
  addPickBtn?.addEventListener('click',()=>say('Add Another Pick search is being connected.'));
  openBookBtn?.addEventListener('click',()=>{const book=q('.book-card.active')?.dataset.book||'DraftKings';const url=verifiedBookLink(book);if(url){window.open(url,'_blank','noopener,noreferrer');return;}say(`${book}: no verified full-betslip link is available for this shared parlay.`);});
  q('#analysisBtn')?.addEventListener('click',()=>say('Full analysis will only show verified research and live data.'));
  q('.search-button')?.addEventListener('click',()=>say('Search is being connected to player and market discovery.'));
  q('.notification-button')?.addEventListener('click',()=>say('Notifications are being connected.'));
  q('.edit-title')?.addEventListener('click',()=>say('Parlay naming is being connected for saved builds.'));
}

installHeader();
renderPicks();
renderMetrics();
setTuneState(false);
bindAltLines();
setupSportsbooks();
preserveConceptPanels();
setupShare();
bindActions();
