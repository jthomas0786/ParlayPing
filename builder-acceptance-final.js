(()=>{
  const state=window.__PARLAYPING_BUILDER__||{};
  const slip=state.slip||{legs:[]};
  const legs=Array.isArray(slip.legs)?slip.legs:[];
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function initials(name){
    return String(name||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join('')||'?';
  }

  const headshotSport={NFL:'nfl',NBA:'nba',WNBA:'wnba',NCAAB:'mens-college-basketball',NCAAF:'college-football',MLB:'mlb',NHL:'nhl'};
  function headshotUrl(leg){
    if(leg?.playerImageUrl)return String(leg.playerImageUrl);
    const sport=headshotSport[String(leg?.sport||'').toUpperCase()];
    return sport&&leg?.playerId?`https://a.espncdn.com/i/headshots/${sport}/players/full/${encodeURIComponent(String(leg.playerId))}.png`:null;
  }

  function playerPhoto(leg){
    const src=headshotUrl(leg);
    if(src)return `<img class="pp-player-photo" src="${esc(src)}" alt="${esc(leg.player||'Player')}" loading="lazy" onerror="this.outerHTML='<span class=&quot;pp-player-photo pp-player-fallback&quot;>${esc(initials(leg.player))}</span>'"/>`;
    return `<span class="pp-player-photo pp-player-fallback">${esc(initials(leg.player))}</span>`;
  }

  const ESPN_SLUGS={
    NFL:{ARI:'ari',ATL:'atl',BAL:'bal',BUF:'buf',CAR:'car',CHI:'chi',CIN:'cin',CLE:'cle',DAL:'dal',DEN:'den',DET:'det',GB:'gb',HOU:'hou',IND:'ind',JAX:'jax',KC:'kc',LV:'lv',LAC:'lac',LAR:'lar',MIA:'mia',MIN:'min',NE:'ne',NO:'no',NYG:'nyg',NYJ:'nyj',PHI:'phi',PIT:'pit',SEA:'sea',SF:'sf',TB:'tb',TEN:'ten',WSH:'wsh'},
    NBA:{ATL:'atl',BOS:'bos',BKN:'bkn',CHA:'cha',CHI:'chi',CLE:'cle',DAL:'dal',DEN:'den',DET:'det',GS:'gs',GSW:'gs',HOU:'hou',IND:'ind',LAC:'lac',LAL:'lal',MEM:'mem',MIA:'mia',MIL:'mil',MIN:'min',NO:'no',NOP:'no',NY:'ny',NYK:'ny',OKC:'okc',ORL:'orl',PHI:'phi',PHX:'phx',POR:'por',SAC:'sac',SA:'sa',SAS:'sa',TOR:'tor',UTA:'utah',UTAH:'utah',WAS:'wsh',WSH:'wsh'},
    WNBA:{ATL:'atl',CHI:'chi',CON:'conn',CT:'conn',DAL:'dal',GS:'gs',GSV:'gs',IND:'ind',LA:'la',LAS:'la',LV:'lv',LVA:'lv',MIN:'min',NY:'ny',NYL:'ny',PHX:'phx',SEA:'sea',WAS:'wsh',WSH:'wsh'},
    NHL:{ANA:'ana',BOS:'bos',BUF:'buf',CGY:'cgy',CAR:'car',CHI:'chi',COL:'col',CBJ:'cbj',DAL:'dal',DET:'det',EDM:'edm',FLA:'fla',LA:'la',MIN:'min',MTL:'mtl',NSH:'nsh',NJ:'nj',NYI:'nyi',NYR:'nyr',OTT:'ott',PHI:'phi',PIT:'pit',SEA:'sea',SJ:'sj',STL:'stl',TB:'tb',TOR:'tor',UTA:'utah',VAN:'van',VGK:'vgk',WSH:'wsh',WPG:'wpg'},
    MLB:{ARI:'ari',ATL:'atl',BAL:'bal',BOS:'bos',CHC:'chc',CWS:'chw',CHW:'chw',CIN:'cin',CLE:'cle',COL:'col',DET:'det',HOU:'hou',KC:'kc',LAA:'laa',LAD:'lad',MIA:'mia',MIL:'mil',MIN:'min',NYM:'nym',NYY:'nyy',ATH:'ath',OAK:'oak',PHI:'phi',PIT:'pit',SD:'sd',SEA:'sea',SF:'sf',STL:'stl',TB:'tb',TEX:'tex',TOR:'tor',WSH:'wsh'}
  };
  const ESPN_PATH={NFL:'nfl',NBA:'nba',WNBA:'wnba',NHL:'nhl',MLB:'mlb'};

  function matchupCodes(matchup){
    const match=String(matchup||'').toUpperCase().match(/\b([A-Z]{2,4})\s*(?:@|VS\.?|V\.?|AT)\s*([A-Z]{2,4})\b/);
    return match?[match[1],match[2]]:[];
  }

  function logoFromCode(sport,code){
    const upper=String(sport||'').toUpperCase();
    const slug=ESPN_SLUGS[upper]?.[String(code||'').toUpperCase()];
    const path=ESPN_PATH[upper];
    return path&&slug?`https://a.espncdn.com/i/teamlogos/${path}/500/${slug}.png`:null;
  }

  function groupKey(leg,index){
    const sport=String(leg.sport||'SPORT').toUpperCase();
    if(leg.gameId)return `${sport}|id:${leg.gameId}`;
    if(leg.matchup)return `${sport}|match:${String(leg.matchup).toLowerCase().replace(/\s+/g,' ')}`;
    return `${sport}|leg:${index}`;
  }

  function groupLegs(rows){
    const groups=new Map();
    rows.forEach((leg,index)=>{
      const key=groupKey(leg,index);
      if(!groups.has(key))groups.set(key,{key,sport:String(leg.sport||'').toUpperCase(),matchup:leg.matchup||null,startTimeUTC:leg.startTimeUTC||null,legs:[]});
      const group=groups.get(key);
      group.legs.push({...leg,__index:index});
      if(!group.matchup&&leg.matchup)group.matchup=leg.matchup;
      if(!group.startTimeUTC&&leg.startTimeUTC)group.startTimeUTC=leg.startTimeUTC;
    });
    return [...groups.values()];
  }

  function formatStart(value){
    if(!value)return '';
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return '';
    return `${date.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})} • ${date.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}`;
  }

  function marketText(leg){
    if(leg.displayMarket)return String(leg.displayMarket).replace(/^O(?=\d)/i,'Over ').replace(/^U(?=\d)/i,'Under ');
    const market=String(leg.market||'Prop');
    if(/atd|anytime.*touchdown/i.test(market))return 'Anytime TD Scorer';
    if(/atg|anytime.*goal/i.test(market))return 'Anytime Goal Scorer';
    if(leg.line!=null&&leg.side){
      const side=String(leg.side).toLowerCase()==='under'?'Under':'Over';
      return `${side} ${leg.line} ${market}`;
    }
    return market;
  }

  function statusText(leg){
    const status=String(leg.status||'PENDING').toUpperCase();
    if(status==='LIVE')return String(leg.progressText||'LIVE').replace(/^LIVE\s*[•·-]?\s*/i,'')||'LIVE';
    if(status==='PENDING')return 'PREGAME';
    return status;
  }

  function statusClass(leg){
    return String(leg.status||'PENDING').toLowerCase().replace(/[^a-z]/g,'')||'pending';
  }

  function groupLogos(group){
    const found=[];
    for(const leg of group.legs){
      if(leg.teamLogoUrl&&!found.includes(leg.teamLogoUrl))found.push(leg.teamLogoUrl);
    }
    const codes=matchupCodes(group.matchup);
    for(const code of codes){
      const url=logoFromCode(group.sport,code);
      if(url&&!found.includes(url))found.push(url);
    }
    return found.slice(0,2);
  }

  function renderGroupHeader(group){
    const logos=groupLogos(group);
    const codes=matchupCodes(group.matchup);
    const tokens=[0,1].map(index=>{
      const url=logos[index];
      if(url)return `<span class="pp-team-token"><img src="${esc(url)}" alt="" loading="lazy"/></span>`;
      const label=codes[index]||String(group.legs[index]?.team||group.sport||'?').slice(0,3).toUpperCase();
      return `<span class="pp-team-token pp-team-fallback">${esc(label)}</span>`;
    }).join('<span class="pp-vs">vs</span>');
    const matchup=group.matchup||group.legs.map(leg=>leg.team).filter(Boolean).filter((value,index,array)=>array.indexOf(value)===index).join(' vs ')||`${group.sport} matchup`;
    const start=formatStart(group.startTimeUTC);
    return `<header class="pp-game-header"><div class="pp-game-logos">${tokens}</div><div class="pp-game-copy"><strong>${esc(matchup)}</strong>${start?`<span>${esc(start)}</span>`:''}</div><div class="pp-game-count">${group.legs.length} leg${group.legs.length===1?'':'s'}</div></header>`;
  }

  function renderLeg(leg){
    const status=statusText(leg);
    return `<div class="pp-leg-row ${esc(statusClass(leg))}" data-leg-id="${esc(leg.id||'')}"><div class="pp-leg-player">${playerPhoto(leg)}<div class="pp-leg-copy"><strong>${esc(leg.player||'Selection')}</strong><span>${esc(marketText(leg))}</span></div></div><div class="pp-leg-status"><span>${esc(status)}</span></div><button class="pp-leg-more" type="button" aria-label="${esc(leg.player||'Bet')} options">⋮</button></div>`;
  }

  function renderPicks(){
    const picks=q('#picks');
    if(!picks)return;
    const groups=groupLegs(legs);
    picks.innerHTML=groups.length?groups.map(group=>`<section class="pp-game-group">${renderGroupHeader(group)}<div class="pp-game-legs">${group.legs.map(renderLeg).join('')}</div></section>`).join(''):'<div class="empty-state"><strong>No legs available.</strong><p>This signed betslip does not contain any valid selections.</p></div>';
  }

  function installBrand(){
    const brand=q('.brand');
    if(!brand)return;
    brand.innerHTML='<img class="pp-acceptance-lockup" src="/parlayping-approved-lockup.svg" alt="ParlayPing"/>';
    brand.href='#top';
  }

  function cleanHero(){
    const hero=q('.concept-hero');
    if(!hero)return;
    hero.classList.add('pp-acceptance-hero');
    hero.style.removeProperty('--pp-hero-image');
    qa('.hero-tool',hero).forEach(tool=>{
      const label=q('strong',tool)?.textContent?.trim()||'';
      if(/^Link to Sportsbooks$/i.test(label))tool.remove();
    });
    const copy=q('.hero-copy p',hero);
    if(copy)copy.textContent='Build your slip. Keep every game organized. Tune only verified lines. Share it cleanly.';
  }

  function stripProbabilityAndOdds(){
    q('.odds-pill')?.remove();
    q('.probability-pill')?.remove();
    qa('.probability-meter,.pick-odds,.alt-lines').forEach(node=>node.remove());
    const legCount=q('#legCount');
    if(legCount)legCount.textContent=String(legs.length);
  }

  function tuneContent(){
    const rows=legs.map(leg=>({leg,alts:Array.isArray(leg.altLines)?leg.altLines.filter(row=>row&&row.line!=null):[]})).filter(row=>row.alts.length);
    if(!rows.length)return '<div class="pp-tune-empty"><strong>No verified alternate lines available.</strong><span>Parlay Tune will only show alternate lines after they are verified for this exact slip. No odds or model probabilities are shown here.</span></div>';
    return `<div class="pp-tune-list">${rows.map(({leg,alts})=>`<div class="pp-tune-row"><strong>${esc(leg.player||'Selection')}</strong><div>${alts.slice(0,6).map(alt=>`<button type="button" class="pp-tune-line">${esc(alt.line)}</button>`).join('')}</div></div>`).join('')}</div>`;
  }

  function installTune(){
    const original=q('#tuneBtn');
    const panel=q('.parlay-panel');
    if(!original||!panel)return;
    const button=original.cloneNode(true);
    original.replaceWith(button);
    button.classList.remove('active');
    button.setAttribute('aria-expanded','false');
    const tune=document.createElement('section');
    tune.id='ppAcceptanceTune';
    tune.className='pp-acceptance-tune';
    tune.hidden=true;
    tune.innerHTML=`<div class="pp-tune-head"><div><strong>Parlay Tune</strong><span>Verified alternate lines only</span></div><button type="button" class="pp-tune-close" aria-label="Close Parlay Tune">×</button></div>${tuneContent()}`;
    q('.parlay-toolbar',panel)?.insertAdjacentElement('afterend',tune);
    const setOpen=open=>{tune.hidden=!open;button.classList.toggle('active',open);button.setAttribute('aria-expanded',String(open));};
    button.addEventListener('click',()=>setOpen(tune.hidden));
    q('.pp-tune-close',tune)?.addEventListener('click',()=>setOpen(false));
  }

  installBrand();
  cleanHero();
  stripProbabilityAndOdds();
  renderPicks();
  installTune();
  document.documentElement.dataset.ppAcceptance='ready';
})();
