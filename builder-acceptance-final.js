(()=>{
  const state=window.__PARLAYPING_BUILDER__||{};
  const slip=state.slip||{legs:[]};
  const legs=Array.isArray(slip.legs)?slip.legs:[];
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function fmtOdds(value){
    const n=Number(value);
    if(!Number.isFinite(n))return '—';
    return n>0?`+${Math.round(n)}`:`${Math.round(n)}`;
  }

  function impliedFromAmerican(value){
    const n=Number(value);
    if(!Number.isFinite(n)||n===0)return null;
    return n>0?100/(n+100):(-n)/((-n)+100);
  }

  function initials(name){
    return String(name||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join('')||'?';
  }

  function probabilityState(leg){
    const status=String(leg?.status||'PENDING').toUpperCase();
    if(status==='LIVE'&&Number.isFinite(Number(leg?.liveProbability))){
      const value=Number(leg.liveProbability);
      return {value,label:`${(value*100).toFixed(1)}%`};
    }
    if(Number.isFinite(Number(leg?.pregameProbability))){
      const value=Number(leg.pregameProbability);
      return {value,label:`${(value*100).toFixed(1)}%`};
    }
    if(['HIT','MISS','PUSH','VOID'].includes(status))return {value:null,label:status};
    return {value:null,label:'—'};
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

  function altRows(leg){
    const rows=Array.isArray(leg.altLines)?leg.altLines.filter(row=>row&&row.line!=null):[];
    const current={line:leg.line,oddsAmerican:leg.oddsAmerican,probability:leg.pregameProbability,current:true};
    if(leg.line!=null&&!rows.some(row=>String(row.line)===String(leg.line)))rows.unshift(current);
    return rows.slice(0,6);
  }

  function altLabel(leg,line){
    if(!leg?.side)return String(line);
    const side=String(leg.side).toLowerCase()==='under'?'Under':'Over';
    return `${side} ${line}`;
  }

  function renderAltLines(leg){
    const rows=altRows(leg);
    if(!rows.length)return '<div class="pp-leg-alts pp-leg-alts-empty" hidden><span>No verified alt lines available.</span></div>';
    return `<div class="pp-leg-alts" hidden><div class="pp-alt-heading">Alt Lines</div><div class="pp-alt-options">${rows.map((alt,index)=>{
      const selected=alt.current||String(alt.line)===String(leg.line);
      const probability=Number(alt.probability);
      return `<button class="pp-alt-option${selected?' selected':''}" type="button" data-line="${esc(alt.line)}" data-odds="${esc(alt.oddsAmerican??'')}" data-prob="${Number.isFinite(probability)?probability:''}"><span>${esc(altLabel(leg,alt.line))}</span><strong>${esc(fmtOdds(alt.oddsAmerican))}</strong></button>`;
    }).join('')}</div></div>`;
  }

  function renderLeg(leg){
    const status=statusText(leg);
    const prob=probabilityState(leg);
    const meter=prob.value==null?0:Math.max(0,Math.min(100,prob.value*100));
    return `<div class="pp-leg-item ${esc(statusClass(leg))}" data-leg-id="${esc(leg.id||'')}"><div class="pp-leg-row ${esc(statusClass(leg))}"><div class="pp-leg-player">${playerPhoto(leg)}<div class="pp-leg-copy"><strong>${esc(leg.player||'Selection')}</strong><span class="pp-leg-market">${esc(marketText(leg))}</span></div></div><div class="pp-leg-probability" aria-label="Probability ${esc(prob.label)}"><span class="pp-prob-track"><i class="pp-prob-fill" style="--pp-prob:${meter}%"></i></span><strong class="pp-prob-label">${esc(prob.label)}</strong></div><div class="pp-leg-odds">${esc(fmtOdds(leg.oddsAmerican))}</div><div class="pp-leg-status"><span>${esc(status)}</span></div><button class="pp-leg-more" type="button" aria-label="${esc(leg.player||'Bet')} options">⋮</button></div>${renderAltLines(leg)}</div>`;
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
    if(copy)copy.textContent='Build your slip. Compare the numbers. Tune verified lines. Share it cleanly.';
  }

  function restoreSummaryMetrics(){
    const legCount=q('#legCount');
    const combinedOdds=q('#combinedOdds');
    const impliedProbability=q('#impliedProbability');
    if(legCount)legCount.textContent=String(legs.length);
    if(combinedOdds)combinedOdds.textContent=slip.combinedOddsVerified?fmtOdds(slip.combinedOddsAmerican):'—';
    if(impliedProbability){
      const p=slip.combinedOddsVerified?impliedFromAmerican(slip.combinedOddsAmerican):null;
      impliedProbability.textContent=p!=null?`${(p*100).toFixed(1)}%`:'—';
    }
  }

  function updateSelectedAlt(button){
    const item=button.closest('.pp-leg-item');
    if(!item)return;
    qa('.pp-alt-option',item).forEach(node=>node.classList.remove('selected'));
    button.classList.add('selected');
    const leg=legs.find(row=>String(row.id||'')===String(item.dataset.legId||''))||legs[Number(item.dataset.legIndex)||0];
    const probability=Number(button.dataset.prob);
    const odds=button.dataset.odds;
    const label=q('.pp-prob-label',item);
    const fill=q('.pp-prob-fill',item);
    const price=q('.pp-leg-odds',item);
    const market=q('.pp-leg-market',item);
    if(Number.isFinite(probability)&&probability>=0&&probability<=1){
      if(label)label.textContent=`${(probability*100).toFixed(1)}%`;
      if(fill)fill.style.setProperty('--pp-prob',`${probability*100}%`);
    }
    if(odds&&price)price.textContent=fmtOdds(odds);
    if(leg&&market)market.textContent=marketText({...leg,line:button.dataset.line});
    const combinedOdds=q('#combinedOdds');
    const impliedProbability=q('#impliedProbability');
    if(combinedOdds)combinedOdds.textContent='CUSTOM';
    if(impliedProbability)impliedProbability.textContent='Repricing';
  }

  function installTune(){
    const original=q('#tuneBtn');
    const panel=q('.parlay-panel');
    if(!original||!panel)return;
    const button=original.cloneNode(true);
    original.replaceWith(button);
    button.classList.remove('active');
    button.setAttribute('aria-expanded','false');
    const setOpen=open=>{
      panel.classList.toggle('pp-tune-open',open);
      button.classList.toggle('active',open);
      button.setAttribute('aria-expanded',String(open));
      qa('.pp-leg-alts').forEach(node=>node.hidden=!open);
    };
    button.addEventListener('click',()=>setOpen(!panel.classList.contains('pp-tune-open')));
    qa('.pp-alt-option').forEach(node=>node.addEventListener('click',()=>updateSelectedAlt(node)));
    setOpen(false);
  }

  installBrand();
  cleanHero();
  restoreSummaryMetrics();
  renderPicks();
  installTune();
  document.documentElement.dataset.ppAcceptance='ready';
})();
