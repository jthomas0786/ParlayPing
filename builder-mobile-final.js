(()=>{
  const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const state=window.__PARLAYPING_BUILDER__||{},legs=Array.isArray(state.slip?.legs)?state.slip.legs:[];

  /* The concept begins each game row with the two team marks. */
  qa('.sport-shield').forEach(el=>el.remove());

  /* Use short team abbreviations wherever the logo pair already resolved. */
  qa('.pick-card').forEach(card=>{
    const pair=q('.team-pair',card);
    const codes=pair?qa('img',pair).map(img=>img.alt).filter(Boolean):[];
    if(codes.length===2){
      const matchup=`${codes[0]} @ ${codes[1]}`;
      const heading=q('.game-bar strong',card);if(heading)heading.textContent=matchup;
      const small=q('.player-copy small',card);if(small)small.textContent=matchup;
    }
    const market=q('.player-copy span',card);
    if(market){
      const raw=market.textContent.trim();
      const over=raw.match(/^O\s*([0-9.]+)\s*(.*)$/i);
      if(over)market.textContent=`Over ${over[1]}${over[2]?` ${over[2].trim()}`:''}`;
    }
  });

  /* On phones keep Back + Close, but tuck them into the existing top header instead of creating a fifth row. */
  if(matchMedia('(max-width:720px)').matches){
    const back=q('.pp-return-back'),close=q('.pp-return-close'),actions=q('.header-actions'),oldBar=q('.pp-mobile-return-bar');
    if(actions&&(back||close)){
      const controls=document.createElement('div');
      controls.className='pp-mobile-origin-controls';
      controls.setAttribute('aria-label','Return to source');
      if(back){back.title=back.getAttribute('aria-label')||'Back';controls.appendChild(back);}
      if(close){close.title=close.getAttribute('aria-label')||'Close';controls.appendChild(close);}
      actions.insertBefore(controls,actions.firstChild);
      oldBar?.remove();
    }
  }

  /* Retry the MLB headshot with the canonical MLB ID when this known signed player reaches us without one. */
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
