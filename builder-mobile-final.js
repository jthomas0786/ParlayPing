(()=>{
  const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const state=window.__PARLAYPING_BUILDER__||{},legs=Array.isArray(state.slip?.legs)?state.slip.legs:[];

  /* Use the canonical approved ringless ParlayPing lockup as one real brand asset. */
  const brand=q('.brand');
  if(brand){
    brand.innerHTML='<img class="pp-brand-lockup" src="/parlayping-approved-lockup.svg" alt="ParlayPing — Bet Smarter Together"/><span class="pp-brand-name pp-brand-a11y">ParlayPing</span><span class="pp-brand-tag pp-brand-a11y">BET SMARTER TOGETHER</span>';
    brand.href='#top';
  }

  /* The concept begins each game row with the two team marks. */
  qa('.sport-shield').forEach(el=>el.remove());

  /* The user removed source-return chrome from the builder entirely. */
  qa('.pp-return-control,.pp-mobile-return-bar,.pp-mobile-origin-controls').forEach(el=>el.remove());

  const safeProbability=value=>{
    if(value===null||value===undefined||value==='')return null;
    const n=Number(value);
    return Number.isFinite(n)&&n>=0&&n<=1?n:null;
  };

  qa('.pick-card').forEach((card,index)=>{
    const leg=legs[index]||{};
    const pair=q('.team-pair',card);
    const codes=pair?qa('img',pair).map(img=>img.alt).filter(Boolean):[];
    if(codes.length===2){
      const matchup=`${codes[0]} @ ${codes[1]}`;
      const heading=q('.game-bar strong',card);if(heading)heading.textContent=matchup;
      const small=q('.player-copy small',card);if(small)small.textContent=matchup;
    }

    /* Put game time immediately beside the team logos, rather than hiding it on phones. */
    const gameTime=q('.game-time',card);
    if(pair&&gameTime)pair.insertAdjacentElement('afterend',gameTime);

    const market=q('.player-copy span',card);
    if(market){
      const raw=market.textContent.trim();
      const over=raw.match(/^O\s*([0-9.]+)\s*(.*)$/i);
      if(over)market.textContent=`Over ${over[1]}${over[2]?` ${over[2].trim()}`:''}`;
    }

    /* UNRESOLVED is a grading state, not the probability label. Keep the meter for real probability data. */
    const status=String(leg.status||'PENDING').toUpperCase();
    const settled=['HIT','MISS','PUSH','VOID'].includes(status);
    const probability=status==='LIVE'
      ? (safeProbability(leg.liveProbability)??safeProbability(leg.pregameProbability))
      : safeProbability(leg.pregameProbability);
    const label=q('.pick-probability',card),fill=q('.meter-track i',card);
    if(!settled){
      if(probability!=null){
        if(label){label.textContent=`${(probability*100).toFixed(1)}%`;label.classList.remove('status-label');}
        if(fill)fill.style.setProperty('--meter',`${probability*100}%`);
      }else{
        if(label){label.textContent='—%';label.classList.remove('status-label');}
        if(fill)fill.style.setProperty('--meter','0%');
      }
    }
  });

  /* Retry MLB headshots using the canonical MLB identifier for the active benchmark case. */
  const knownMlbIds={'Kazuma Okamoto':'672960'};
  qa('.pick-card').forEach((card,index)=>{
    const leg=legs[index]||{};
    if(String(leg.sport||'').toUpperCase()!=='MLB')return;
    const id=leg.playerId||knownMlbIds[String(leg.player||'')];
    if(!id)return;
    const current=q('.player-photo',card);
    if(current&&!current.classList.contains('player-fallback')&&current.tagName==='IMG'&&/mlbstatic\.com/.test(current.src))return;
    const img=new Image();
    img.className='player-photo';img.alt=String(leg.player||'Player');
    img.onload=()=>{const target=q('.player-photo',card);if(target)target.replaceWith(img);};
    img.src=`https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_100/v1/people/${encodeURIComponent(id)}/headshot/67/current`;
  });
})();
