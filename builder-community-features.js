(()=>{
  const state=window.__PARLAYPING_BUILDER__||{};
  const slip=state.slip||{};
  const legs=Array.isArray(slip.legs)?slip.legs:[];
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const norm=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
  const SESSION_KEY='parlayping_supabase_session_v1';
  const SUPABASE_URL='https://avwqjgiitxqphvmitolw.supabase.co';
  const SUPABASE_KEY='sb_publishable_7mYXjjkRrQq3iRig7UYHNQ_b6EZZiJA';
  const BOOK_DOMAINS={
    draftkings:'draftkings.com',
    fanduel:'fanduel.com',
    bet365:'bet365.com',
    caesars:'caesars.com',
    caesarssportsbook:'caesars.com',
    thescorebet:'thescore.bet',
    thescore:'thescore.bet',
    betmgm:'betmgm.com',
    fanatics:'betfanatics.com',
    fanaticssportsbook:'betfanatics.com',
    espnbet:'espnbet.com'
  };
  const BOOK_ALIASES={draftkings:'DraftKings',dk:'DraftKings',fanduel:'FanDuel',fd:'FanDuel',bet365:'bet365','365':'bet365',caesars:'Caesars',caesarssportsbook:'Caesars',williamhill:'Caesars',thescorebet:'theScore Bet',thescore:'theScore Bet',betmgm:'BetMGM',mgm:'BetMGM',fanatics:'Fanatics',fanaticssportsbook:'Fanatics',espnbet:'ESPN BET'};
  let communityRows=[];
  let communityLoaded=false;
  let insightTimer=null;

  function normalizeBook(value){const raw=String(value||'').trim();return BOOK_ALIASES[norm(raw)]||raw;}
  function toast(message){const node=q('#toast');if(!node)return;node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),2600);}
  function getSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{return null;}}
  function setSession(value){try{if(value)localStorage.setItem(SESSION_KEY,JSON.stringify(value));else localStorage.removeItem(SESSION_KEY);}catch{}}
  function currentBook(){return normalizeBook(q('.sportsbook-grid .book-card.active')?.dataset?.book||slip.sportsbook||'');}
  function mapEntry(map,book){if(!map||typeof map!=='object'||!book)return null;const wanted=normalizeBook(book);for(const [key,value] of Object.entries(map)){if(normalizeBook(key)===wanted)return value;}return null;}
  function probability(leg){const live=Number(leg?.liveProbability),pre=Number(leg?.pregameProbability);if(Number.isFinite(live))return live;if(Number.isFinite(pre))return pre;return null;}
  function playerInitials(name){return String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join('')||'?';}
  function publicLeg(leg){return {id:leg.id||null,sport:leg.sport||null,player:leg.player||null,playerId:leg.playerId||null,playerImageUrl:leg.playerImageUrl||null,market:leg.market||null,displayMarket:leg.displayMarket||null,side:leg.side||null,line:leg.line??null,matchup:leg.matchup||null,startTimeUTC:leg.startTimeUTC||null,status:leg.status||null,pregameProbability:leg.pregameProbability??null,liveProbability:leg.liveProbability??null};}
  function sportLabel(rows=legs){const sports=[...new Set(rows.map(row=>String(row?.sport||'').toUpperCase()).filter(Boolean))];return sports.length===1?sports[0]:sports.length?'MULTI':'SPORTS';}
  function buildTitle(){return String(slip.title||`${legs.length}-Leg ${sportLabel()} Parlay`).slice(0,120);}

  function faviconUrl(book){const domain=BOOK_DOMAINS[norm(book)];return domain?`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`:null;}
  function applyBookLogos(){
    qa('.sportsbook-grid .book-card[data-book]').forEach(card=>{
      const logo=q('.book-logo',card),book=card.dataset.book||'';
      if(!logo||logo.dataset.ppLogoReady==='1')return;
      const src=faviconUrl(book);if(!src)return;
      const fallback=logo.textContent.trim()||book.slice(0,2).toUpperCase();
      logo.dataset.ppLogoReady='1';logo.dataset.ppLogoFallback=fallback;logo.textContent='';
      const img=document.createElement('img');img.src=src;img.alt=`${book} logo`;img.loading='lazy';img.referrerPolicy='no-referrer';
      img.addEventListener('error',()=>{logo.textContent=fallback;logo.dataset.ppLogoReady='fallback';},{once:true});
      logo.appendChild(img);
    });
  }

  function countGames(){const keys=new Set();legs.forEach((leg,index)=>keys.add(leg?.gameId||leg?.matchup||`${leg?.sport||'sport'}-${index}`));return keys.size;}
  function sameGameConcentration(){const counts=new Map();for(const leg of legs){const key=leg?.gameId||leg?.matchup;if(!key)continue;counts.set(key,(counts.get(key)||0)+1);}return Math.max(0,...counts.values());}
  function selectedBookCoverage(book=currentBook()){
    if(!book)return {priced:0,alts:0,total:legs.length};
    let priced=0,alts=0;
    for(const leg of legs){
      const offer=mapEntry(leg?.bookOffers,book);
      if(Number.isFinite(Number(offer?.oddsAmerican))||normalizeBook(leg?.sportsbook)===book&&Number.isFinite(Number(leg?.oddsAmerican)))priced++;
      const rows=mapEntry(leg?.altLinesByBook,book);if(Array.isArray(rows)&&rows.length)alts++;
    }
    return {priced,alts,total:legs.length};
  }
  function dynamicInsights(){
    const status={};for(const leg of legs){const key=String(leg?.status||'PENDING').toUpperCase();status[key]=(status[key]||0)+1;}
    const probs=legs.map(probability).filter(Number.isFinite);
    const avg=probs.length?probs.reduce((a,b)=>a+b,0)/probs.length:null;
    const games=countGames(),sport=sportLabel(),book=currentBook(),coverage=selectedBookCoverage(book),sameGame=sameGameConcentration();
    const items=[];
    items.push({icon:'▦',text:`${legs.length} leg${legs.length===1?'':'s'} across ${games} game${games===1?'':'s'}${sport&&sport!=='MULTI'?` · ${sport}`:''}.`});
    if(status.LIVE)items.push({icon:'●',text:`${status.LIVE} leg${status.LIVE===1?' is':'s are'} live right now.`});
    if(status.HIT||status.MISS)items.push({icon:'✓',text:`Tracked results: ${status.HIT||0} hit · ${status.MISS||0} miss.`});
    if(avg!=null)items.push({icon:'%',text:`Average displayed leg probability: ${(avg*100).toFixed(1)}%.`});
    if(book)items.push({icon:'↗',text:`${book} has current pricing for ${coverage.priced}/${coverage.total} legs and verified alt lines for ${coverage.alts}/${coverage.total}.`});
    if(sameGame>1)items.push({icon:'◎',text:`${sameGame} legs share one matchup; those outcomes may not be independent.`});
    if(state.liveDataAvailable===false)items.push({icon:'!',text:'Live hydration is unavailable for this share, so some values may reflect the saved snapshot.'});
    if(communityLoaded)items.push({icon:'♧',text:`${communityRows.length} public community parlay${communityRows.length===1?' is':'s are'} currently available to explore.`});
    return items.slice(0,7);
  }
  function renderInsights(){
    const list=q('#insights .insights-list');if(!list)return;
    list.innerHTML=dynamicInsights().map(item=>`<li><span>${esc(item.icon)}</span>${esc(item.text)}</li>`).join('');
    let detail=q('#ppAnalysisDetail');
    if(!detail){detail=document.createElement('div');detail.id='ppAnalysisDetail';detail.className='pp-analysis-detail';detail.hidden=true;q('#insights')?.insertBefore(detail,q('#analysisBtn'));}
    const book=currentBook(),coverage=selectedBookCoverage(book);
    detail.innerHTML=`<div><span>Games</span><strong>${countGames()}</strong></div><div><span>Sports</span><strong>${esc(sportLabel())}</strong></div><div><span>${esc(book||'Book')} priced</span><strong>${coverage.priced}/${coverage.total}</strong></div><div><span>Alt-line coverage</span><strong>${coverage.alts}/${coverage.total}</strong></div>`;
  }
  function wireAnalysisButton(){
    const original=q('#analysisBtn');if(!original||original.dataset.ppWired==='1')return;original.dataset.ppWired='1';
    original.addEventListener('click',()=>{const detail=q('#ppAnalysisDetail');if(!detail)return;detail.hidden=!detail.hidden;original.innerHTML=detail.hidden?'View Full Analysis <span>→</span>':'Hide Analysis <span>↑</span>';});
  }

  function similarityScore(post){
    const rows=Array.isArray(post?.legs)?post.legs:[];let score=0;
    for(const a of legs){for(const b of rows){if(!a||!b)continue;if(norm(a.player)&&norm(a.player)===norm(b.player))score+=8;if(a.matchup&&norm(a.matchup)===norm(b.matchup))score+=4;if(a.market&&norm(a.market)===norm(b.market))score+=2;if(a.sport&&norm(a.sport)===norm(b.sport))score+=1;}}
    score+=Math.max(0,3-Math.abs(Number(post?.leg_count||rows.length)-legs.length));return score;
  }
  function communityAvatar(post){const image=post?.legs?.find?.(leg=>leg?.playerImageUrl)?.playerImageUrl;if(image)return `<img src="${esc(image)}" alt="" loading="lazy"/>`;return `<span>${esc(playerInitials(post?.author_name))}</span>`;}
  function similarCommunity(){return communityRows.filter(row=>row.share_token!==state.token).map(row=>({...row,__score:similarityScore(row)})).filter(row=>row.__score>2).sort((a,b)=>b.__score-a.__score||new Date(b.created_at)-new Date(a.created_at)).slice(0,3);}
  function selectedLineButton(item){return q('.pp-alt-option.selected',item);}
  function directionTarget(item,side,mode){
    const buttons=qa('.pp-alt-option',item).sort((a,b)=>Number(a.dataset.line)-Number(b.dataset.line));if(!buttons.length)return null;
    const current=selectedLineButton(item);let index=Math.max(0,buttons.indexOf(current));if(index<0)index=0;
    const under=String(side||'').toLowerCase()==='under';
    const delta=mode==='safer'?(under?1:-1):(under?-1:1);
    const target=buttons[index+delta];return target&&target!==current?target:null;
  }
  async function applyLineVariant(mode){
    const tune=q('#tuneBtn');if(tune&&!tune.classList.contains('active'))tune.click();
    let changed=0;
    for(const leg of legs){
      const item=qa('.pp-leg-item').find(node=>String(node.dataset.legId||'')===String(leg.id||''));if(!item)continue;
      const target=directionTarget(item,leg.side,mode);if(target){target.click();changed++;await Promise.resolve();}
    }
    toast(changed?`${changed} line${changed===1?'':'s'} adjusted.`:'No adjacent verified lines are available for this variant.');
    setTimeout(refreshAll,0);
  }
  function coverageByBook(){
    const books=new Set();for(const leg of legs){Object.keys(leg?.bookOffers||{}).forEach(book=>books.add(normalizeBook(book)));Object.keys(leg?.altLinesByBook||{}).forEach(book=>books.add(normalizeBook(book)));}
    return [...books].filter(Boolean).map(book=>({book,...selectedBookCoverage(book)})).sort((a,b)=>b.priced-a.priced||b.alts-a.alts||a.book.localeCompare(b.book));
  }
  function applyBestCoverageBook(){const top=coverageByBook()[0];if(!top){toast('No sportsbook pricing is available on this slip.');return;}const card=qa('.sportsbook-grid .book-card').find(node=>normalizeBook(node.dataset.book)===top.book);if(card){card.click();toast(`${top.book} selected · ${top.priced}/${top.total} legs priced.`);}else toast(`${top.book} has the broadest coverage, but it is not available as an open-betslip target on this share.`);setTimeout(refreshAll,0);}
  function variantRows(){
    const current=currentBook(),coverage=coverageByBook()[0];
    return [
      {title:'Safer Line Variant',meta:'Moves each available threshold one verified step toward an easier line.',tag:'Adjust lines',action:'safer'},
      {title:'Higher Payout Variant',meta:'Moves each available threshold one verified step toward a harder line.',tag:'Adjust lines',action:'payout'},
      {title:'Best Book Coverage',meta:coverage?`${coverage.book} currently prices ${coverage.priced}/${coverage.total} legs${current===coverage.book?' · already selected':''}.`:'Compare available sportsbook coverage.',tag:'Compare books',action:'coverage'}
    ];
  }
  function renderSimilar(){
    const root=q('#similar .similar-list');if(!root)return;
    const matches=similarCommunity();
    if(matches.length){root.innerHTML=matches.map(post=>{const players=(post.legs||[]).map(leg=>leg.player).filter(Boolean).slice(0,4).join(', ');return `<div class="similar-row pp-similar-community"><div class="mini-avatars">${communityAvatar(post)}</div><div><strong>${esc(post.title)}</strong><small>${esc(players||`${post.leg_count} legs`)}</small></div><span class="tails">${esc(post.author_name)}</span><a class="pp-tail-small" href="${esc(post.builder_url)}">Tail →</a></div>`;}).join('');return;}
    root.innerHTML=variantRows().map(row=>`<div class="similar-row pp-variant-row"><div class="pp-variant-icon">↻</div><div><strong>${esc(row.title)}</strong><small>${esc(row.meta)}</small></div><span class="tails">${esc(row.tag)}</span><button type="button" class="pp-variant-apply" data-pp-variant="${esc(row.action)}">Apply</button></div>`).join('');
    qa('[data-pp-variant]',root).forEach(button=>button.addEventListener('click',()=>{const mode=button.dataset.ppVariant;if(mode==='safer'||mode==='payout')applyLineVariant(mode);else if(mode==='coverage')applyBestCoverageBook();}));
  }

  function ensureCommunitySection(){
    let section=q('#ppCommunity');if(section)return section;
    const footer=q('.app-footer');if(footer?.id==='community')footer.removeAttribute('id');
    section=document.createElement('section');section.id='ppCommunity';section.className='pp-community-panel';
    section.innerHTML=`<div class="pp-community-head"><div><span class="pp-eyebrow">PUBLIC BUILDS</span><h2 id="community">Community</h2><p>Share a public ParlayPing build or tail one another user already posted.</p></div><button type="button" id="ppPostCommunity">Post This Parlay</button></div><div id="ppCommunityStatus" class="pp-community-status">Loading community…</div><div id="ppCommunityGrid" class="pp-community-grid"></div>`;
    q('main.app-shell')?.appendChild(section);
    q('#ppPostCommunity')?.addEventListener('click',postCommunity);
    return section;
  }
  function timeAgo(value){const ms=Date.now()-new Date(value).getTime();if(!Number.isFinite(ms))return '';const mins=Math.floor(ms/60000);if(mins<1)return 'just now';if(mins<60)return `${mins}m ago`;const hrs=Math.floor(mins/60);if(hrs<24)return `${hrs}h ago`;const days=Math.floor(hrs/24);return `${days}d ago`;}
  function renderCommunity(){
    ensureCommunitySection();const grid=q('#ppCommunityGrid'),status=q('#ppCommunityStatus'),button=q('#ppPostCommunity');if(!grid||!status)return;
    const session=getSession();if(button)button.textContent=session?.access_token?'Post This Parlay':'Sign In to Post';
    if(!communityLoaded){status.textContent='Loading community…';return;}
    status.textContent=communityRows.length?`${communityRows.length} recent public build${communityRows.length===1?'':'s'}`:'No public builds yet. Be the first to post one.';
    grid.innerHTML=communityRows.map(post=>{const players=(post.legs||[]).map(leg=>leg.player).filter(Boolean).slice(0,5);const meta=[post.sport,`${post.leg_count} legs`,post.sportsbook,timeAgo(post.created_at)].filter(Boolean).join(' · ');return `<article class="pp-community-card"><div class="pp-community-author"><span class="pp-community-avatar">${esc(playerInitials(post.author_name))}</span><div><strong>${esc(post.author_name)}</strong>${post.x_username?`<small>@${esc(String(post.x_username).replace(/^@/,''))}</small>`:''}</div></div><h3>${esc(post.title)}</h3><p>${esc(players.join(' · ')||'Shared ParlayPing build')}</p><div class="pp-community-meta">${esc(meta)}</div><a class="pp-community-tail" href="${esc(post.builder_url)}">Tail This Build <span>→</span></a></article>`;}).join('');
  }

  async function supabase(path,{method='GET',body,token,prefer}={}){
    const headers={apikey:SUPABASE_KEY,'content-type':'application/json'};if(token)headers.authorization=`Bearer ${token}`;if(prefer)headers.Prefer=prefer;
    const response=await fetch(`${SUPABASE_URL}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    const text=await response.text();let payload=null;try{payload=text?JSON.parse(text):null;}catch{payload={message:text};}
    if(!response.ok)throw new Error(payload?.message||payload?.error_description||payload?.error||`Community request failed (${response.status})`);return payload;
  }
  async function validSession(){
    let session=getSession();if(!session)return null;const exp=Number(session.expires_at||0)*1000;if(exp&&exp-Date.now()>=60000)return session;if(!session.refresh_token)return session;
    try{session=await supabase('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});setSession(session);return session;}catch{setSession(null);return null;}
  }
  async function ownProfile(token,userId){try{const rows=await supabase(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=display_name,x_username&limit=1`,{token});return Array.isArray(rows)?rows[0]||{}:{};}catch{return {};}}
  async function loadCommunity(){
    ensureCommunitySection();
    try{const rows=await supabase('/rest/v1/community_parlays?select=id,user_id,share_token,builder_url,title,author_name,x_username,sport,leg_count,legs,sportsbook,created_at&is_active=eq.true&order=created_at.desc&limit=24');communityRows=Array.isArray(rows)?rows:[];communityLoaded=true;}catch(error){communityRows=[];communityLoaded=true;const status=q('#ppCommunityStatus');if(status)status.textContent=`Community unavailable: ${error.message}`;}
    renderCommunity();renderSimilar();renderInsights();
  }
  async function postCommunity(){
    const session=await validSession();if(!session?.access_token){location.assign('/account.html');return;}
    const token=state.token||'';const builderUrl=state.builderUrl||location.href;if(!token||!/^https:\/\/parlayping\.net\/build\//.test(builderUrl)){toast('This build needs a public ParlayPing share link before it can be posted.');return;}
    const user=await supabase('/auth/v1/user',{token:session.access_token});const userId=user?.id;if(!userId){toast('Please sign in again.');return;}
    const profile=await ownProfile(session.access_token,userId);const authorName=String(profile.display_name||user.user_metadata?.name||user.email?.split('@')[0]||'ParlayPing User').slice(0,80);
    const body={user_id:userId,share_token:token,builder_url:builderUrl,title:buildTitle(),author_name:authorName,x_username:profile.x_username||null,sport:sportLabel(),leg_count:legs.length,legs:legs.map(publicLeg),sportsbook:currentBook()||null,is_active:true,updated_at:new Date().toISOString()};
    const button=q('#ppPostCommunity');if(button){button.disabled=true;button.textContent='Posting…';}
    try{await supabase('/rest/v1/community_parlays?on_conflict=user_id,share_token',{method:'POST',token:session.access_token,prefer:'resolution=merge-duplicates,return=representation',body});toast('Parlay posted to Community.');await loadCommunity();document.getElementById('community')?.scrollIntoView({behavior:'smooth',block:'start'});}catch(error){toast(error.message);}finally{if(button){button.disabled=false;button.textContent='Post This Parlay';}}
  }

  function scheduleRefresh(){clearTimeout(insightTimer);insightTimer=setTimeout(refreshAll,60);}
  function refreshAll(){applyBookLogos();renderInsights();wireAnalysisButton();renderSimilar();renderCommunity();}
  function installObservers(){
    const grid=q('.sportsbook-grid');if(grid)new MutationObserver(scheduleRefresh).observe(grid,{childList:true,subtree:true});
    const picks=q('#picks');if(picks)new MutationObserver(scheduleRefresh).observe(picks,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-line','data-book']});
    document.addEventListener('click',event=>{if(event.target.closest('.book-card,.pp-alt-option,#tuneBtn'))scheduleRefresh();});
  }

  ensureCommunitySection();
  applyBookLogos();
  renderInsights();
  wireAnalysisButton();
  renderSimilar();
  installObservers();
  loadCommunity();
  document.documentElement.dataset.ppCommunityFeatures='ready';
})();
