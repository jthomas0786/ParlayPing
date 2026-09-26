(()=>{
  const SUPABASE_URL='https://avwqjgiitxqphvmitolw.supabase.co';
  const SUPABASE_KEY='sb_publishable_7mYXjjkRrQq3iRig7UYHNQ_b6EZZiJA';
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let imageData=null,imageFile=null;
  let insightRows=[];
  let trendingRows=[];
  let activeSport='ALL';
  let discoveryLoading=false;

  function injectCss(){
    if(!q('link[data-pp-landing-hub]')){
      const link=document.createElement('link');link.rel='stylesheet';link.href='/landing-hub.css?v=20260924b';link.dataset.ppLandingHub='1';document.head.append(link);
    }
    if(!q('link[data-pp-intel-css]')){
      const link=document.createElement('link');link.rel='stylesheet';link.href='/landing-insights-trends.css?v=20260925b';link.dataset.ppIntelCss='1';document.head.append(link);
    }
  }

  function hubHtml(){
    return `<section class="pp-landing-hub" id="betlab"><div class="pp-hub-shell"><div class="pp-hub-title"><div class="pp-hub-kicker">YOUR BETTING COMMAND CENTER</div><h1>What are we <span>building?</span></h1><p>Upload a sportsbook screenshot or type the bet you have in mind. ParlayPing turns it into a real, tuneable betslip you can compare, track, and share.</p></div><div class="pp-discovery-row"><article class="pp-feature-card" id="insights"><div class="pp-card-label">LIVE SPORTS INSIGHTS</div><h3 id="ppInsightHeadline">Scanning current team and player news…</h3><p id="ppInsightCopy">Fresh sports intelligence from public sources — never your bet history or Community activity.</p><div class="pp-insight-live" id="ppInsightLive"><span>Hourly sports discovery</span><span>Loading fresh sources…</span></div><a class="pp-card-cta" href="#communityInsights">View sports insights <span>→</span></a></article><article class="pp-feature-card alt" id="ppTrendFeature"><div class="pp-card-label">TRENDING BETSLIPS</div><h3 id="ppTrendFeatureHeadline">Finding high-attention public betslips on X…</h3><p id="ppTrendFeatureCopy">Ranked by public engagement, traffic signals, and freshness — refreshed every hour.</p><a class="pp-card-cta" href="#trending">See trending betslips <span>→</span></a></article></div><div class="pp-suggested"><strong>Try a prompt</strong><div class="pp-prompt-row"><button class="pp-prompt-chip" data-prompt="NFL: CeeDee Lamb over 109.5 receiving yards">🏈 NFL player prop</button><button class="pp-prompt-chip" data-prompt="NBA: Anthony Edwards 30+ points; 5+ assists">🏀 NBA builder</button><button class="pp-prompt-chip" data-prompt="MLB: Aaron Judge to hit a home run">⚾ Home run</button><button class="pp-prompt-chip" data-prompt="Build me an anytime touchdown parlay">🎯 Anytime TDs</button></div></div><div class="pp-bet-composer" id="ppBetComposer"><input id="ppBetImage" type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="pp-compose-main"><textarea id="ppBetText" maxlength="6000" placeholder="Type or paste your bet…  e.g. CeeDee Lamb over 109.5 receiving yards"></textarea></div><div class="pp-upload-preview" id="ppUploadPreview"><img class="pp-thumb" id="ppUploadThumb" alt=""><div><strong id="ppUploadName"></strong><span id="ppUploadMeta"></span></div><button type="button" id="ppRemoveImage" aria-label="Remove image">×</button></div><div class="pp-compose-footer"><button class="pp-upload-button" id="ppUploadButton" type="button"><span class="pp-upload-icon">▧</span>Image to Betslip</button><div class="pp-compose-spacer"></div><span class="pp-compose-status" id="ppComposeStatus">Drop a screenshot here or type a bet</span><button class="pp-create-button" id="ppCreateBet" type="button" aria-label="Create betslip">→</button></div></div><section class="pp-intel-section" id="communityInsights"><div class="pp-intel-head"><div><h2>Sports insights</h2><p id="ppIntelSubtitle">Current team and player developments from public sports sources</p></div><button class="pp-intel-refresh" type="button" data-pp-discovery-refresh>↻ Refresh</button></div><div class="pp-intel-grid" id="ppIntelGrid"><div class="pp-intel-empty">Loading the latest sports insights…</div></div><div class="pp-intel-pulse" id="ppIntelPulse"></div></section><section class="pp-trending" id="trending"><div class="pp-trending-head"><div><h2>Trending betslips</h2><p id="ppTrendingSubtitle">High-attention public betslips on X · refreshed hourly</p></div><div class="pp-trend-tools"><div class="pp-trend-filters" id="ppTrendFilters"></div><button class="pp-trend-refresh" type="button" data-pp-discovery-refresh>↻ Refresh</button></div></div><div class="pp-trending-grid pp-trend-loading" id="ppTrendingGrid"><div class="pp-trend-empty">Loading high-attention public betslips from X…</div></div></section></div></section>`;
  }

  function injectHub(){const main=q('main#top')||q('main');if(!main||q('#betlab'))return;main.insertAdjacentHTML('afterbegin',hubHtml());}
  function status(message,error=false){const node=q('#ppComposeStatus');if(!node)return;node.textContent=message;node.classList.toggle('error',error);}
  function clearImage(){imageData=null;imageFile=null;const input=q('#ppBetImage');if(input)input.value='';q('#ppUploadPreview')?.classList.remove('show');}
  function setImage(file){
    if(!file)return;
    if(!/^image\/(png|jpeg|webp)$/i.test(file.type)){status('Use a PNG, JPG or WebP screenshot.',true);return;}
    if(file.size>7*1024*1024){status('Screenshot must be under 7 MB.',true);return;}
    const reader=new FileReader();
    reader.onload=()=>{imageData=String(reader.result||'');imageFile=file;q('#ppUploadThumb').src=imageData;q('#ppUploadName').textContent=file.name;q('#ppUploadMeta').textContent=`${Math.max(1,Math.round(file.size/1024))} KB · ready to parse`;q('#ppUploadPreview')?.classList.add('show');status('Screenshot attached — create your betslip when ready.');};
    reader.onerror=()=>status('Could not read that screenshot.',true);reader.readAsDataURL(file);
  }

  async function createBetslip(){
    const text=String(q('#ppBetText')?.value||'').trim();
    if(!text&&!imageData){status('Type a bet or attach a sportsbook screenshot first.',true);q('#ppBetText')?.focus();return;}
    const button=q('#ppCreateBet');button.disabled=true;button.textContent='…';status(imageData?'Reading your screenshot…':'Building your betslip…');
    try{
      const response=await fetch('/api/landing-create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,imageData})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload?.error||`Could not create betslip (${response.status}).`);
      status(`${payload.legCount||0} leg${payload.legCount===1?'':'s'} found — opening Build…`);location.assign(payload.builderUrl);
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

  function timeAgo(value){
    const time=Date.parse(value||'');if(!Number.isFinite(time))return 'recently';
    const mins=Math.max(0,Math.floor((Date.now()-time)/60000));if(mins<1)return 'just now';if(mins<60)return `${mins}m ago`;
    const hours=Math.floor(mins/60);if(hours<24)return `${hours}h ago`;return `${Math.floor(hours/24)}d ago`;
  }
  function compactNumber(value){const n=Number(value)||0;if(n>=1000000)return `${(n/1000000).toFixed(n>=10000000?0:1)}M`;if(n>=1000)return `${(n/1000).toFixed(n>=10000?0:1)}K`;return String(Math.round(n));}
  function freshest(rows,field='refreshed_at'){return rows.reduce((best,row)=>Math.max(best,Date.parse(row?.[field]||'')||0),0);}
  function uniqueSources(rows){return [...new Set(rows.map(row=>String(row?.source_name||'').trim()).filter(Boolean))];}

  function renderFeatureCards(){
    const insight=q('#insights'),headline=q('#ppInsightHeadline'),copy=q('#ppInsightCopy'),live=q('#ppInsightLive');if(insight)insight.classList.add('pp-intel-ready');
    const top=insightRows[0];
    if(top){
      if(headline)headline.textContent=top.headline;
      if(copy)copy.textContent=`${top.sport||'Sports'} · ${top.category||'Team / player update'} · ${top.source_name||'Public source'} · ${timeAgo(top.source_published_at||top.refreshed_at)}`;
      const sources=uniqueSources(insightRows);if(live)live.innerHTML=`<span>${esc(`${insightRows.length} current insights`)}</span><span>${esc(`${sources.length} source${sources.length===1?'':'s'} · hourly refresh`)}</span><span>${esc(top.sport||'SPORTS')}</span><span>${esc(top.category||'Team / player update')}</span>`;
    }else{
      if(headline)headline.textContent='Sports discovery is warming up.';if(copy)copy.textContent='Fresh team and player developments will populate here after the hourly worker completes.';if(live)live.innerHTML='<span>Hourly sports discovery</span><span>Waiting for fresh sources…</span>';
    }
    const trendHeadline=q('#ppTrendFeatureHeadline'),trendCopy=q('#ppTrendFeatureCopy'),trend=trendingRows[0];
    if(trend){
      const engagement=(Number(trend.like_count)||0)+(Number(trend.repost_count)||0)+(Number(trend.reply_count)||0)+(Number(trend.quote_count)||0);
      if(trendHeadline)trendHeadline.textContent=`@${trend.author_username||'X'} · ${compactNumber(engagement)} interactions`;
      if(trendCopy)trendCopy.textContent=`${trend.sport||'Sports'} betslip · ${compactNumber(trend.impression_count)} views · posted ${timeAgo(trend.created_at)}. Ranked from public X attention signals.`;
    }else{
      if(trendHeadline)trendHeadline.textContent='X betslip discovery is warming up.';if(trendCopy)trendCopy.textContent='High-attention public betslips will appear here after the hourly X scan completes.';
    }
  }

  function renderInsights(){
    const grid=q('#ppIntelGrid'),subtitle=q('#ppIntelSubtitle'),pulse=q('#ppIntelPulse');if(!grid||!subtitle||!pulse)return;
    if(!insightRows.length){subtitle.textContent='No fresh team/player insight rows are available yet.';grid.innerHTML='<div class="pp-intel-empty">The hourly sports worker is waiting for fresh public team and player developments.</div>';pulse.innerHTML='<span>No Community or personal betting data is used here.</span>';return;}
    const last=freshest(insightRows);subtitle.textContent=`Team and player news from public sports sources · feed refreshed ${timeAgo(last)}`;
    grid.innerHTML=insightRows.slice(0,12).map(row=>`<a class="pp-intel-card pp-intel-link" href="${esc(row.source_url)}" target="_blank" rel="noopener noreferrer"><small>${esc(`${row.sport||'SPORTS'} · ${row.category||'UPDATE'}`)}</small><strong>${esc(row.headline)}</strong>${row.summary?`<span class="pp-intel-summary">${esc(row.summary)}</span>`:''}<span class="pp-intel-source">${esc(row.source_name||'Public source')} · ${esc(timeAgo(row.source_published_at||row.refreshed_at))} ↗</span></a>`).join('');
    const sports=[...new Set(insightRows.map(row=>row.sport).filter(Boolean))];const sources=uniqueSources(insightRows);
    pulse.innerHTML=`<span>Hourly sports discovery · ${esc(`${sports.length} sport${sports.length===1?'':'s'}`)} · ${esc(`${sources.length} source${sources.length===1?'':'s'}`)} · no Community/history signals</span>`;
  }

  function renderTrendFilters(){
    const root=q('#ppTrendFilters');if(!root)return;
    const sports=[...new Set(trendingRows.map(row=>String(row?.sport||'').toUpperCase()).filter(Boolean))].sort();if(activeSport!=='ALL'&&!sports.includes(activeSport))activeSport='ALL';
    root.innerHTML=['ALL',...sports].map(sport=>`<button class="pp-trend-filter${activeSport===sport?' active':''}" type="button" data-pp-trend-sport="${esc(sport)}">${esc(sport==='ALL'?'All':sport)}</button>`).join('');
  }
  function renderTrending(){
    const grid=q('#ppTrendingGrid'),subtitle=q('#ppTrendingSubtitle');if(!grid||!subtitle)return;grid.classList.remove('pp-trend-loading');renderTrendFilters();
    if(!trendingRows.length){subtitle.textContent='No fresh public X betslips are available yet.';grid.innerHTML='<div class="pp-trend-empty">The hourly X worker is waiting for public betslips with enough traffic and attention.</div>';return;}
    const scope=trendingRows.filter(row=>activeSport==='ALL'||String(row?.sport||'').toUpperCase()===activeSport);
    const last=freshest(trendingRows);subtitle.textContent=`Ranked from public X engagement, traffic, and freshness · refreshed ${timeAgo(last)}`;
    if(!scope.length){grid.innerHTML='<div class="pp-trend-empty">No high-attention X betslips match this sport filter right now.</div>';return;}
    grid.innerHTML=scope.slice(0,8).map((row,index)=>{
      const interactions=(Number(row.like_count)||0)+(Number(row.repost_count)||0)+(Number(row.reply_count)||0)+(Number(row.quote_count)||0);
      const author=row.author_username?`@${row.author_username}`:(row.author_name||'X user');
      const media=row.media_url?`<span class="pp-trend-media"><img src="${esc(row.media_url)}" alt="Public betslip media from ${esc(author)}" loading="lazy"></span>`:'';
      return `<a class="pp-trend-card pp-x-trend-card" href="${esc(row.tweet_url)}" target="_blank" rel="noopener noreferrer"><div class="pp-trend-top"><span>${index<3?'HIGH ATTENTION':'TRENDING ON X'}</span><span>${esc(row.sport||'SPORTS')} · ${esc(timeAgo(row.created_at))}</span></div>${media}<strong>${esc(author)}</strong><span class="pp-trend-players">${esc(row.text||'Public betslip on X')}</span><span class="pp-trend-metrics"><b>♥ ${esc(compactNumber(row.like_count))}</b><b>↻ ${esc(compactNumber(row.repost_count))}</b><b>↩ ${esc(compactNumber(row.reply_count))}</b>${Number(row.impression_count)>0?`<b>◉ ${esc(compactNumber(row.impression_count))}</b>`:''}</span><span class="pp-trend-reason">${esc(`${compactNumber(interactions)} public interactions · attention ${Math.round(Number(row.attention_score)||0)}`)} <span class="pp-trend-author">Open on X ↗</span></span></a>`;
    }).join('');
  }

  function setDiscoveryLoading(value){discoveryLoading=value;qa('[data-pp-discovery-refresh]').forEach(button=>{button.disabled=value;button.textContent=value?'↻ Updating…':'↻ Refresh';});}
  async function fetchFeed(path){const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:{apikey:SUPABASE_KEY}});if(!response.ok)throw new Error(`Feed unavailable (${response.status})`);const rows=await response.json();return Array.isArray(rows)?rows:[];}
  async function loadDiscovery(){
    if(discoveryLoading)return;setDiscoveryLoading(true);
    const [insights,trends]=await Promise.allSettled([
      fetchFeed('sports_insights?is_active=eq.true&select=source_key,sport,category,headline,summary,source_name,source_url,source_published_at,score,refreshed_at,expires_at&order=score.desc,source_published_at.desc&limit=16'),
      fetchFeed('x_trending_betslips?is_active=eq.true&select=tweet_id,tweet_url,author_username,author_name,text,sport,media_url,created_at,like_count,repost_count,reply_count,quote_count,bookmark_count,impression_count,attention_score,refreshed_at,expires_at&order=attention_score.desc,created_at.desc&limit=16')
    ]);
    if(insights.status==='fulfilled')insightRows=insights.value;else{q('#ppIntelSubtitle').textContent='Sports insights are temporarily unavailable.';q('#ppIntelGrid').innerHTML=`<div class="pp-intel-empty">${esc(insights.reason?.message||'Could not refresh sports insights.')}</div>`;}
    if(trends.status==='fulfilled')trendingRows=trends.value;else{q('#ppTrendingSubtitle').textContent='X betslip trends are temporarily unavailable.';q('#ppTrendingGrid').innerHTML=`<div class="pp-trend-empty">${esc(trends.reason?.message||'Could not refresh X trends.')}</div>`;}
    if(insights.status==='fulfilled')renderInsights();if(trends.status==='fulfilled')renderTrending();renderFeatureCards();setDiscoveryLoading(false);
  }

  function wireDiscoveryActions(){
    document.addEventListener('click',event=>{
      const refresh=event.target.closest('[data-pp-discovery-refresh]');if(refresh){event.preventDefault();loadDiscovery();return;}
      const filter=event.target.closest('[data-pp-trend-sport]');if(filter){activeSport=String(filter.dataset.ppTrendSport||'ALL').toUpperCase();renderTrending();}
    });
  }

  function init(){injectCss();injectHub();wireComposer();wireDiscoveryActions();loadDiscovery();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
