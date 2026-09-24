(()=>{
  const SUPABASE_URL='https://avwqjgiitxqphvmitolw.supabase.co';
  const SUPABASE_KEY='sb_publishable_7mYXjjkRrQq3iRig7UYHNQ_b6EZZiJA';
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
  let imageData=null,imageFile=null;
  let communityRows=[];
  let communityIntel=null;
  let activeSport='ALL';
  let intelLoading=false;

  function injectCss(){
    if(!q('link[data-pp-landing-hub]')){
      const link=document.createElement('link');
      link.rel='stylesheet';
      link.href='/landing-hub.css?v=20260924b';
      link.dataset.ppLandingHub='1';
      document.head.append(link);
    }
    if(!q('link[data-pp-intel-css]')){
      const link=document.createElement('link');
      link.rel='stylesheet';
      link.href='/landing-insights-trends.css?v=20260924a';
      link.dataset.ppIntelCss='1';
      document.head.append(link);
    }
  }

  function replaceHeader(){
    const old=q('.site-header');if(!old)return;
    old.className='site-header pp-home-header';
    old.innerHTML=`<div class="pp-header-shell"><a class="pp-header-brand" href="#betlab" aria-label="ParlayPing home"><img src="/parlayping-approved-lockup.svg" alt="ParlayPing"></a><nav class="pp-home-nav" aria-label="Primary navigation"><a class="active" href="#betlab"><span class="pp-nav-icon">⚡</span>Build</a><a href="#trending"><span class="pp-nav-icon">⊕</span>Explore</a><a href="/profile?tab=community"><span class="pp-nav-icon">♧</span>Community</a><a href="#communityInsights"><span class="pp-nav-icon">▥</span>Insights</a></nav><div class="pp-home-actions"><a class="pp-home-action" href="/profile" aria-label="Notifications">♧</a><a class="pp-home-action pp-profile" href="/profile" aria-label="Tracking profile">JT</a></div></div>`;
  }

  function hubHtml(){
    return `<section class="pp-landing-hub" id="betlab"><div class="pp-hub-shell"><div class="pp-hub-title"><div class="pp-hub-kicker">YOUR BETTING COMMAND CENTER</div><h1>What are we <span>building?</span></h1><p>Upload a sportsbook screenshot or type the bet you have in mind. ParlayPing turns it into a real, tuneable betslip you can compare, track, and share.</p></div><div class="pp-discovery-row"><article class="pp-feature-card" id="insights"><div class="pp-card-label">LIVE COMMUNITY INSIGHTS</div><h3 id="ppInsightHeadline">Reading public ParlayPing builds…</h3><p id="ppInsightCopy">Insights are calculated from real public builds — no filler stats.</p><div class="pp-insight-live" id="ppInsightLive"><span>Loading community data…</span></div><a class="pp-card-cta" href="#communityInsights">View live insights <span>→</span></a></article><article class="pp-feature-card alt" id="ppTrendFeature"><div class="pp-card-label">TRENDING BETSLIPS</div><h3 id="ppTrendFeatureHeadline">See what the community is building.</h3><p id="ppTrendFeatureCopy">Recent public activity and repeated players or markets determine what rises here.</p><a class="pp-card-cta" href="#trending">See trending builds <span>→</span></a></article></div><div class="pp-suggested"><strong>Try a prompt</strong><div class="pp-prompt-row"><button class="pp-prompt-chip" data-prompt="NFL: CeeDee Lamb over 109.5 receiving yards">🏈 NFL player prop</button><button class="pp-prompt-chip" data-prompt="NBA: Anthony Edwards 30+ points; 5+ assists">🏀 NBA builder</button><button class="pp-prompt-chip" data-prompt="MLB: Aaron Judge to hit a home run">⚾ Home run</button><button class="pp-prompt-chip" data-prompt="Build me an anytime touchdown parlay">🎯 Anytime TDs</button></div></div><div class="pp-bet-composer" id="ppBetComposer"><input id="ppBetImage" type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="pp-compose-main"><textarea id="ppBetText" maxlength="6000" placeholder="Type or paste your bet…  e.g. CeeDee Lamb over 109.5 receiving yards"></textarea></div><div class="pp-upload-preview" id="ppUploadPreview"><img class="pp-thumb" id="ppUploadThumb" alt=""><div><strong id="ppUploadName"></strong><span id="ppUploadMeta"></span></div><button type="button" id="ppRemoveImage" aria-label="Remove image">×</button></div><div class="pp-compose-footer"><button class="pp-upload-button" id="ppUploadButton" type="button"><span class="pp-upload-icon">▧</span>Image to Betslip</button><div class="pp-compose-spacer"></div><span class="pp-compose-status" id="ppComposeStatus">Drop a screenshot here or type a bet</span><button class="pp-create-button" id="ppCreateBet" type="button" aria-label="Create betslip">→</button></div></div><section class="pp-intel-section" id="communityInsights"><div class="pp-intel-head"><div><h2>Community insights</h2><p id="ppIntelSubtitle">Loading recent public build activity…</p></div><button class="pp-intel-refresh" type="button" data-pp-intel-refresh>↻ Refresh</button></div><div class="pp-intel-grid" id="ppIntelGrid"><div class="pp-intel-empty">Reading community data…</div></div><div class="pp-intel-pulse" id="ppIntelPulse"></div></section><section class="pp-trending" id="trending"><div class="pp-trending-head"><div><h2>Trending betslips</h2><p id="ppTrendingSubtitle">Recent public activity + repeated players and markets</p></div><div class="pp-trend-tools"><div class="pp-trend-filters" id="ppTrendFilters"></div><button class="pp-trend-refresh" type="button" data-pp-intel-refresh>↻ Refresh</button></div></div><div class="pp-trending-grid pp-trend-loading" id="ppTrendingGrid"><div class="pp-trend-empty">Calculating trends from public builds…</div></div></section></div></section>`;
  }

  function injectHub(){const main=q('main#top')||q('main');if(!main||q('#betlab'))return;main.insertAdjacentHTML('afterbegin',hubHtml());}
  function status(message,error=false){const node=q('#ppComposeStatus');if(!node)return;node.textContent=message;node.classList.toggle('error',error);}
  function clearImage(){imageData=null;imageFile=null;const input=q('#ppBetImage');if(input)input.value='';q('#ppUploadPreview')?.classList.remove('show');}
  function setImage(file){if(!file)return;if(!/^image\/(png|jpeg|webp)$/i.test(file.type)){status('Use a PNG, JPG or WebP screenshot.',true);return;}if(file.size>7*1024*1024){status('Screenshot must be under 7 MB.',true);return;}const reader=new FileReader();reader.onload=()=>{imageData=String(reader.result||'');imageFile=file;q('#ppUploadThumb').src=imageData;q('#ppUploadName').textContent=file.name;q('#ppUploadMeta').textContent=`${Math.max(1,Math.round(file.size/1024))} KB · ready to parse`;q('#ppUploadPreview')?.classList.add('show');status('Screenshot attached — create your betslip when ready.');};reader.onerror=()=>status('Could not read that screenshot.',true);reader.readAsDataURL(file);}

  async function createBetslip(){
    const text=String(q('#ppBetText')?.value||'').trim();
    if(!text&&!imageData){status('Type a bet or attach a sportsbook screenshot first.',true);q('#ppBetText')?.focus();return;}
    const button=q('#ppCreateBet');button.disabled=true;button.textContent='…';status(imageData?'Reading your screenshot…':'Building your betslip…');
    try{
      const response=await fetch('/api/landing-create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,imageData})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload?.error||`Could not create betslip (${response.status}).`);
      status(`${payload.legCount||0} leg${payload.legCount===1?'':'s'} found — opening Build…`);
      location.assign(payload.builderUrl);
    }catch(error){status(error.message||'Could not create this betslip.',true);button.disabled=false;button.textContent='→';}
  }

  function wireComposer(){
    q('#ppUploadButton')?.addEventListener('click',()=>q('#ppBetImage')?.click());
    q('#ppBetImage')?.addEventListener('change',event=>setImage(event.target.files?.[0]));
    q('#ppRemoveImage')?.addEventListener('click',clearImage);
    q('#ppCreateBet')?.addEventListener('click',createBetslip);
    q('#ppBetText')?.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter')createBetslip();});
    document.querySelectorAll('[data-prompt]').forEach(button=>button.addEventListener('click',()=>{const area=q('#ppBetText');area.value=button.dataset.prompt||'';area.focus();status('Prompt loaded — edit it or create the betslip.');}));
    const composer=q('#ppBetComposer');
    ['dragenter','dragover'].forEach(name=>composer?.addEventListener(name,event=>{event.preventDefault();composer.classList.add('dragging');}));
    ['dragleave','drop'].forEach(name=>composer?.addEventListener(name,event=>{event.preventDefault();composer.classList.remove('dragging');if(name==='drop')setImage(event.dataTransfer?.files?.[0]);}));
  }

  function bump(map,key,amount=1){const value=String(key||'').trim();if(!value)return;map.set(value,(map.get(value)||0)+amount);}
  function leaders(map,limit=3){return [...map.entries()].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]))).slice(0,limit).map(([name,count])=>({name,count}));}
  function marketLabel(value){const key=norm(value);const labels={atd:'Anytime TD',anytimetouchdown:'Anytime TD',receivingyards:'Receiving yards',rushingyards:'Rushing yards',passingyards:'Passing yards',receptions:'Receptions',points:'Points',rebounds:'Rebounds',assists:'Assists',homerun:'Home run',homeruns:'Home run'};return labels[key]||String(value||'Other props').replace(/_/g,' ');}
  function trendWindow(rows){const cutoff=Date.now()-7*24*60*60*1000;const recent=rows.filter(row=>{const time=Date.parse(row?.created_at||'');return Number.isFinite(time)&&time>=cutoff;});return recent.length?recent:rows;}

  function computeIntel(rows){
    const scope=trendWindow(rows),sportCounts=new Map(),bookCounts=new Map(),playerCounts=new Map(),marketCounts=new Map(),matchupCounts=new Map();
    let totalLegs=0,sameGameBuilds=0;
    for(const row of scope){
      bump(sportCounts,row?.sport||'Other');
      bump(bookCounts,row?.sportsbook||'Unselected');
      const rowLegs=Array.isArray(row?.legs)?row.legs:[];totalLegs+=rowLegs.length;
      const matchups=[...new Set(rowLegs.map(leg=>String(leg?.matchup||'').trim()).filter(Boolean))];if(rowLegs.length>1&&matchups.length===1)sameGameBuilds++;
      for(const leg of rowLegs){bump(playerCounts,leg?.player);bump(marketCounts,marketLabel(leg?.market||leg?.displayMarket));bump(matchupCounts,leg?.matchup);}
    }
    return {scope,totalBuilds:scope.length,totalLegs,avgLegs:scope.length?totalLegs/scope.length:0,sameGameBuilds,sportCounts,bookCounts,playerCounts,marketCounts,matchupCounts,sports:leaders(sportCounts),books:leaders(bookCounts),players:leaders(playerCounts),markets:leaders(marketCounts),matchups:leaders(matchupCounts)};
  }

  function countLabel(count,noun){return `${count} ${noun}${count===1?'':'s'}`;}
  function joinedLeaders(entries,limit=2){const rows=entries.slice(0,limit);return rows.length?rows.map(row=>row.name).join(' · '):'No data yet';}
  function promptMarket(value){const key=norm(value);if(key==='anytimetd'||key==='atd')return 'to score an anytime touchdown';if(key==='homerun')return 'to hit a home run';return value;}
  function promptForPlayer(name,intel){
    const sport=intel.sports[0]?.name||'Sports';
    const rawMarket=intel.markets[0]?.name||'';
    const market=promptMarket(rawMarket);
    return `${sport}: ${name}${market?` ${market}`:''}`.trim();
  }

  function renderFeatureCards(intel){
    const insight=q('#insights'),headline=q('#ppInsightHeadline'),copy=q('#ppInsightCopy'),live=q('#ppInsightLive');
    if(insight)insight.classList.add('pp-intel-ready');
    if(!intel.totalBuilds){
      if(headline)headline.textContent='Community insights will appear as public builds are posted.';
      if(copy)copy.textContent='No public build data is available yet. Post a build to Community and this panel will start calculating real signals.';
      if(live)live.innerHTML='<span>0 public builds</span><span>No trend data yet</span>';
    }else{
      const sport=intel.sports[0]?.name||'Community';
      const market=intel.markets[0]?.name||'player props';
      if(headline)headline.textContent=`${sport} · ${market} lead recent public activity.`;
      if(copy)copy.textContent=`Calculated from ${countLabel(intel.totalBuilds,'public build')} and ${countLabel(intel.totalLegs,'leg')} in the current trend window.`;
      if(live)live.innerHTML=`<span>${esc(countLabel(intel.totalBuilds,'build'))}</span><span>${esc(`${intel.avgLegs.toFixed(1)} avg legs`)}</span><span>${esc(`${market} · ${intel.markets[0]?.count||0} legs`)}</span><span>${esc(intel.books[0]?.name||'Book not selected')}</span>`;
    }
    const trendHeadline=q('#ppTrendFeatureHeadline'),trendCopy=q('#ppTrendFeatureCopy');
    if(!intel.totalBuilds){if(trendHeadline)trendHeadline.textContent='Trending builds will populate from Community.';if(trendCopy)trendCopy.textContent='Once public parlays are posted, recent activity and repeated players or markets will determine what rises.';}
    else{if(trendHeadline)trendHeadline.textContent=`${countLabel(intel.totalBuilds,'recent public build')} in the trend window.`;if(trendCopy)trendCopy.textContent='Ranking uses recency plus repeated players and markets across public Community builds — not paid placement.';}
  }

  function renderIntel(intel){
    const grid=q('#ppIntelGrid'),subtitle=q('#ppIntelSubtitle'),pulse=q('#ppIntelPulse');if(!grid||!subtitle||!pulse)return;
    if(!intel.totalBuilds){subtitle.textContent='No public build data yet.';grid.innerHTML='<div class="pp-intel-empty">Post a build to Community and live insight cards will appear here.</div>';pulse.innerHTML='';return;}
    const sameGamePct=Math.round((intel.sameGameBuilds/intel.totalBuilds)*100);
    subtitle.textContent=`Based on ${countLabel(intel.totalBuilds,'public build')} from the last 7 days${intel.scope===communityRows?'':' or latest available activity'}.`;
    const cards=[
      {label:'Most represented sport',value:joinedLeaders(intel.sports,2),meta:`${intel.sports[0]?.count||0} build${intel.sports[0]?.count===1?'':'s'}`},
      {label:'Most represented market',value:joinedLeaders(intel.markets,2),meta:`${intel.markets[0]?.count||0} leg${intel.markets[0]?.count===1?'':'s'}`},
      {label:'Player pulse',value:joinedLeaders(intel.players,2),meta:`${intel.players[0]?.count||0} recent appearance${intel.players[0]?.count===1?'':'s'}`},
      {label:'Build shape',value:`${intel.avgLegs.toFixed(1)} avg legs`,meta:`${sameGamePct}% same-matchup builds`}
    ];
    grid.innerHTML=cards.map(card=>`<article class="pp-intel-card"><small>${esc(card.label)}</small><strong>${esc(card.value)}</strong><span>${esc(card.meta)}</span></article>`).join('');
    const chips=intel.players.slice(0,3).map(row=>`<button class="pp-intel-chip" type="button" data-pp-insight-prompt="${esc(promptForPlayer(row.name,intel))}">Build with ${esc(row.name)} · ${row.count}</button>`);
    const book=intel.books[0];
    pulse.innerHTML=`<span>${book?`${esc(book.name)} appears on ${esc(countLabel(book.count,'build'))}.`:'Sportsbook data is still forming.'}</span>${chips.join('')}`;
  }

  function timeAgo(value){const time=Date.parse(value||'');if(!Number.isFinite(time))return 'recently';const mins=Math.max(0,Math.floor((Date.now()-time)/60000));if(mins<1)return 'just now';if(mins<60)return `${mins}m ago`;const hours=Math.floor(mins/60);if(hours<24)return `${hours}h ago`;return `${Math.floor(hours/24)}d ago`;}
  function trendScore(row,intel){const time=Date.parse(row?.created_at||''),ageHours=Number.isFinite(time)?Math.max(0,(Date.now()-time)/3600000):168;let score=Math.max(0,168-ageHours)/24;for(const leg of Array.isArray(row?.legs)?row.legs:[]){score+=Math.max(0,(intel.playerCounts.get(String(leg?.player||''))||0)-1)*3;score+=Math.max(0,(intel.marketCounts.get(marketLabel(leg?.market||leg?.displayMarket))||0)-1)*1.5;score+=Math.max(0,(intel.matchupCounts.get(String(leg?.matchup||''))||0)-1)*.5;}score+=Math.max(0,(intel.sportCounts.get(String(row?.sport||'Other'))||0)-1)*.5;return score;}
  function trendReason(row,intel){for(const leg of Array.isArray(row?.legs)?row.legs:[]){const player=String(leg?.player||'').trim(),count=intel.playerCounts.get(player)||0;if(player&&count>1)return `${player} appears in ${count} recent public legs.`;}for(const leg of Array.isArray(row?.legs)?row.legs:[]){const market=marketLabel(leg?.market||leg?.displayMarket),count=intel.marketCounts.get(market)||0;if(market&&count>1)return `${market} appears across ${count} recent public legs.`;}return `Posted ${timeAgo(row?.created_at)}.`;}

  function renderTrendFilters(intel){
    const root=q('#ppTrendFilters');if(!root)return;const sports=[...new Set(intel.scope.map(row=>String(row?.sport||'').toUpperCase()).filter(Boolean))].sort();if(activeSport!=='ALL'&&!sports.includes(activeSport))activeSport='ALL';
    root.innerHTML=['ALL',...sports].map(sport=>`<button class="pp-trend-filter${activeSport===sport?' active':''}" type="button" data-pp-trend-sport="${esc(sport)}">${esc(sport==='ALL'?'All':sport)}</button>`).join('');
  }

  function renderTrending(intel){
    const grid=q('#ppTrendingGrid'),subtitle=q('#ppTrendingSubtitle');if(!grid||!subtitle)return;grid.classList.remove('pp-trend-loading');renderTrendFilters(intel);
    if(!intel.totalBuilds){subtitle.textContent='No public Community builds yet.';grid.innerHTML='<div class="pp-trend-empty">Nothing is trending yet. Public Community posts will appear here automatically.</div>';return;}
    subtitle.textContent='Ranked from recent public activity, repeated players and repeated markets';
    const scope=intel.scope.filter(row=>activeSport==='ALL'||String(row?.sport||'').toUpperCase()===activeSport);
    const ranked=scope.map(row=>({...row,__score:trendScore(row,intel)})).sort((a,b)=>b.__score-a.__score||Date.parse(b.created_at||'')-Date.parse(a.created_at||''));
    if(!ranked.length){grid.innerHTML='<div class="pp-trend-empty">No public builds match this sport filter yet.</div>';return;}
    grid.innerHTML=ranked.slice(0,6).map((row,index)=>{
      const rowLegs=Array.isArray(row?.legs)?row.legs:[],players=rowLegs.map(leg=>leg?.player).filter(Boolean).slice(0,4).join(' · '),author=String(row?.author_name||'ParlayPing Community'),label=intel.totalBuilds>1&&index<3?'TRENDING SIGNAL':'NEW COMMUNITY BUILD';
      return `<a class="pp-trend-card" href="${esc(row.builder_url||'#communityInsights')}"><div class="pp-trend-top"><span>${esc(label)}</span><span>${esc(row.sport||'SPORTS')} · ${esc(row.leg_count||rowLegs.length)} LEGS</span></div><strong>${esc(row.title||'Community Parlay')}</strong><span class="pp-trend-players">${esc(players||'Public ParlayPing build')}</span><span class="pp-trend-reason">${esc(trendReason(row,intel))} <span class="pp-trend-author">${esc(author)}</span>${row.sportsbook?` · ${esc(row.sportsbook)}`:''}</span></a>`;
    }).join('');
  }

  function renderCommunityIntel(){const intel=computeIntel(communityRows);communityIntel=intel;renderFeatureCards(intel);renderIntel(intel);renderTrending(intel);}
  function setIntelLoading(value){intelLoading=value;qa('[data-pp-intel-refresh]').forEach(button=>{button.disabled=value;button.textContent=value?'↻ Updating…':'↻ Refresh';});}

  async function loadCommunityIntel(){
    if(intelLoading)return;setIntelLoading(true);
    try{
      const url=`${SUPABASE_URL}/rest/v1/community_parlays?is_active=eq.true&select=id,builder_url,title,author_name,x_username,sport,leg_count,legs,sportsbook,created_at&order=created_at.desc&limit=60`;
      const response=await fetch(url,{headers:{apikey:SUPABASE_KEY}});
      if(!response.ok)throw new Error(`Community data unavailable (${response.status})`);
      const rows=await response.json();communityRows=Array.isArray(rows)?rows:[];renderCommunityIntel();
    }catch(error){
      const subtitle=q('#ppIntelSubtitle'),grid=q('#ppIntelGrid'),trending=q('#ppTrendingGrid');if(subtitle)subtitle.textContent='Community insights are temporarily unavailable.';if(grid)grid.innerHTML=`<div class="pp-intel-empty">${esc(error.message||'Could not load Community insights.')}</div>`;if(trending)trending.innerHTML='<div class="pp-trend-empty">Could not refresh public trends right now.</div>';
    }finally{setIntelLoading(false);}
  }

  function wireIntelActions(){
    document.addEventListener('click',event=>{
      const refresh=event.target.closest('[data-pp-intel-refresh]');if(refresh){event.preventDefault();loadCommunityIntel();return;}
      const filter=event.target.closest('[data-pp-trend-sport]');if(filter){activeSport=String(filter.dataset.ppTrendSport||'ALL').toUpperCase();if(communityIntel)renderTrending(communityIntel);return;}
      const prompt=event.target.closest('[data-pp-insight-prompt]');if(prompt){const area=q('#ppBetText');if(!area)return;area.value=prompt.dataset.ppInsightPrompt||'';area.focus();q('#ppBetComposer')?.scrollIntoView({behavior:'smooth',block:'center'});status('Community trend loaded as a starting prompt.');}
    });
  }

  function init(){injectCss();replaceHeader();injectHub();wireComposer();wireIntelActions();loadCommunityIntel();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
