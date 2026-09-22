(()=>{
  const state=window.__PARLAYPING_BUILDER__||{};
  const slip=state.slip||{};
  const legs=Array.isArray(slip.legs)?slip.legs:[];
  const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];

  const hasNumber=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const oddsText=v=>{
    if(!hasNumber(v)||Number(v)===0)return '—';
    const n=Math.round(Number(v));
    return n>0?`+${n}`:`${n}`;
  };

  const TEAM_ALIASES={
    MLB:{
      'ARIZONA DIAMONDBACKS':'ARI','DIAMONDBACKS':'ARI','ATLANTA BRAVES':'ATL','BRAVES':'ATL','BALTIMORE ORIOLES':'BAL','ORIOLES':'BAL','BOSTON RED SOX':'BOS','RED SOX':'BOS','CHICAGO CUBS':'CHC','CUBS':'CHC','CHICAGO WHITE SOX':'CWS','WHITE SOX':'CWS','CINCINNATI REDS':'CIN','REDS':'CIN','CLEVELAND GUARDIANS':'CLE','GUARDIANS':'CLE','COLORADO ROCKIES':'COL','ROCKIES':'COL','DETROIT TIGERS':'DET','TIGERS':'DET','HOUSTON ASTROS':'HOU','ASTROS':'HOU','KANSAS CITY ROYALS':'KC','ROYALS':'KC','LOS ANGELES ANGELS':'LAA','ANGELS':'LAA','LOS ANGELES DODGERS':'LAD','DODGERS':'LAD','MIAMI MARLINS':'MIA','MARLINS':'MIA','MILWAUKEE BREWERS':'MIL','BREWERS':'MIL','MINNESOTA TWINS':'MIN','TWINS':'MIN','NEW YORK METS':'NYM','METS':'NYM','NEW YORK YANKEES':'NYY','YANKEES':'NYY','ATHLETICS':'ATH','OAKLAND ATHLETICS':'OAK','PHILADELPHIA PHILLIES':'PHI','PHILLIES':'PHI','PITTSBURGH PIRATES':'PIT','PIRATES':'PIT','SAN DIEGO PADRES':'SD','PADRES':'SD','SAN FRANCISCO GIANTS':'SF','GIANTS':'SF','SEATTLE MARINERS':'SEA','MARINERS':'SEA','ST. LOUIS CARDINALS':'STL','ST LOUIS CARDINALS':'STL','CARDINALS':'STL','TAMPA BAY RAYS':'TB','RAYS':'TB','TEXAS RANGERS':'TEX','RANGERS':'TEX','TORONTO BLUE JAYS':'TOR','BLUE JAYS':'TOR','WASHINGTON NATIONALS':'WSH','NATIONALS':'WSH'
    },
    NFL:{
      'ARIZONA CARDINALS':'ARI','ATLANTA FALCONS':'ATL','BALTIMORE RAVENS':'BAL','BUFFALO BILLS':'BUF','CAROLINA PANTHERS':'CAR','CHICAGO BEARS':'CHI','CINCINNATI BENGALS':'CIN','CLEVELAND BROWNS':'CLE','DALLAS COWBOYS':'DAL','DENVER BRONCOS':'DEN','DETROIT LIONS':'DET','GREEN BAY PACKERS':'GB','HOUSTON TEXANS':'HOU','INDIANAPOLIS COLTS':'IND','JACKSONVILLE JAGUARS':'JAX','KANSAS CITY CHIEFS':'KC','LAS VEGAS RAIDERS':'LV','LOS ANGELES CHARGERS':'LAC','LOS ANGELES RAMS':'LAR','MIAMI DOLPHINS':'MIA','MINNESOTA VIKINGS':'MIN','NEW ENGLAND PATRIOTS':'NE','NEW ORLEANS SAINTS':'NO','NEW YORK GIANTS':'NYG','NEW YORK JETS':'NYJ','PHILADELPHIA EAGLES':'PHI','PITTSBURGH STEELERS':'PIT','SEATTLE SEAHAWKS':'SEA','SAN FRANCISCO 49ERS':'SF','TAMPA BAY BUCCANEERS':'TB','TENNESSEE TITANS':'TEN','WASHINGTON COMMANDERS':'WSH'
    }
  };
  const ESPN_SLUGS={
    MLB:{ARI:'ari',ATL:'atl',BAL:'bal',BOS:'bos',CHC:'chc',CWS:'chw',CIN:'cin',CLE:'cle',COL:'col',DET:'det',HOU:'hou',KC:'kc',LAA:'laa',LAD:'lad',MIA:'mia',MIL:'mil',MIN:'min',NYM:'nym',NYY:'nyy',ATH:'ath',OAK:'oak',PHI:'phi',PIT:'pit',SD:'sd',SEA:'sea',SF:'sf',STL:'stl',TB:'tb',TEX:'tex',TOR:'tor',WSH:'wsh'},
    NFL:{ARI:'ari',ATL:'atl',BAL:'bal',BUF:'buf',CAR:'car',CHI:'chi',CIN:'cin',CLE:'cle',DAL:'dal',DEN:'den',DET:'det',GB:'gb',HOU:'hou',IND:'ind',JAX:'jax',KC:'kc',LV:'lv',LAC:'lac',LAR:'lar',MIA:'mia',MIN:'min',NE:'ne',NO:'no',NYG:'nyg',NYJ:'nyj',PHI:'phi',PIT:'pit',SEA:'sea',SF:'sf',TB:'tb',TEN:'ten',WSH:'wsh'}
  };
  const SPORT_PATH={MLB:'mlb',NFL:'nfl',NBA:'nba',NHL:'nhl',WNBA:'wnba'};
  const normalizeTeam=(sport,name)=>{
    const raw=String(name||'').trim().toUpperCase().replace(/\s+/g,' ');
    if(!raw)return null;
    if(ESPN_SLUGS[sport]?.[raw])return raw;
    return TEAM_ALIASES[sport]?.[raw]||null;
  };
  const matchupTeams=(sport,matchup)=>{
    const raw=String(matchup||'').trim();
    const parts=raw.split(/\s+(?:@|vs\.?|v\.?|at)\s+/i).map(x=>x.trim()).filter(Boolean);
    if(parts.length!==2)return [];
    return parts.map(x=>normalizeTeam(sport,x)).filter(Boolean);
  };
  const logoUrl=(sport,abbr)=>{
    const path=SPORT_PATH[sport],slug=ESPN_SLUGS[sport]?.[abbr];
    return path&&slug?`https://a.espncdn.com/i/teamlogos/${path}/500/${slug}.png`:null;
  };
  const token=(abbr,url)=>{
    if(url)return `<img src="${url}" alt="${abbr}"/><span class="team-token" style="display:none">${abbr}</span>`;
    return `<span class="team-token">${abbr||'?'}</span>`;
  };

  qa('.pick-card').forEach((card,index)=>{
    const leg=legs[index]||{};
    const sport=String(leg.sport||'').toUpperCase();

    /* Missing prices must never render as American odds 0. */
    const price=q('.pick-odds',card);
    if(price)price.textContent=oddsText(leg.oddsAmerican);

    /* Missing probabilities remain unavailable, never 0.0%. */
    const status=String(leg.status||'PENDING').toUpperCase();
    const explicitProb=status==='LIVE'&&hasNumber(leg.liveProbability)?Number(leg.liveProbability):hasNumber(leg.pregameProbability)?Number(leg.pregameProbability):null;
    if(!['HIT','MISS','PUSH','VOID','UNRESOLVED'].includes(status)&&explicitProb===null){
      const label=q('.pick-probability',card),meter=q('.meter-track i',card);
      if(label)label.textContent='—';
      if(meter)meter.style.setProperty('--meter','0%');
    }

    /* Resolve full matchup names (e.g. Blue Jays @ Orioles) to real logos. */
    const teams=matchupTeams(sport,leg.matchup);
    if(teams.length===2){
      const pair=q('.team-pair',card);
      if(pair){
        pair.innerHTML=teams.map(abbr=>token(abbr,logoUrl(sport,abbr))).join('');
        qa('img',pair).forEach(img=>img.addEventListener('error',()=>{img.style.display='none';const fallback=img.nextElementSibling;if(fallback)fallback.style.display='grid';},{once:true}));
      }
    }

    /* Use the sport-native player image source when the signed ID supports it. */
    if(leg.playerId){
      const current=q('.player-photo',card);
      const loadCandidate=(url)=>{
        const img=new Image();img.className='player-photo';img.alt=String(leg.player||'Player');
        img.onload=()=>{const target=q('.player-photo',card);if(target)target.replaceWith(img);};
        img.src=url;
      };
      if(sport==='MLB')loadCandidate(`https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_100/v1/people/${encodeURIComponent(leg.playerId)}/headshot/67/current`);
      else if(SPORT_PATH[sport])loadCandidate(`https://a.espncdn.com/i/headshots/${SPORT_PATH[sport]}/players/full/${encodeURIComponent(leg.playerId)}.png`);
    }
  });

  /* Move signed return controls into normal page flow on phones so they never cover bets/content. */
  if(matchMedia('(max-width:720px)').matches){
    const back=q('.pp-return-back'),close=q('.pp-return-close'),header=q('.app-header');
    if((back||close)&&header){
      const bar=document.createElement('nav');
      bar.className='pp-mobile-return-bar';
      bar.setAttribute('aria-label','Return to source');
      if(back)bar.appendChild(back);
      if(close)bar.appendChild(close);
      header.insertAdjacentElement('afterend',bar);
    }
  }

  /* Make the selected-book CTA readable even when the real deep link is unavailable. */
  const cta=q('#openBookBtn');
  if(cta){
    const selected=q('#selectedBookLabel')?.textContent?.trim()||'DraftKings';
    cta.setAttribute('aria-label',`Open Parlay on ${selected}`);
  }
})();
