(()=>{
  const state=window.__PARLAYPING_BUILDER__||{},legs=Array.isArray(state.slip?.legs)?state.slip.legs:[];
  const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const icon={
    trash:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>',
    pencil:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-1 10.9-10.9-3.2-3.2L5 15.8zM14.8 6l3.2 3.2"/></svg>',
    link:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a4 4 0 0 0 5.7.1l2.4-2.4a4 4 0 0 0-5.7-5.7L11 6.4"/><path d="M14 11a4 4 0 0 0-5.7-.1l-2.4 2.4a4 4 0 0 0 5.7 5.7l1.4-1.4"/></svg>',
    external:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-9 9"/><path d="M18 13v6H5V6h6"/></svg>',
    cards:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="7" width="13" height="11" rx="2"/><path d="M8 7V4h12v11h-3"/></svg>',
    bulb:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M8.5 14.5C7 13.4 6 11.7 6 9.5a6 6 0 0 1 12 0c0 2.2-1 3.9-2.5 5-1 .7-1.3 1.3-1.3 2.5H9.8c0-1.2-.3-1.8-1.3-2.5Z"/></svg>'
  };
  const clear=q('#clearAllBtn');if(clear)clear.innerHTML=`${icon.trash}<span>Clear All</span>`;
  const edit=q('.edit-title');if(edit)edit.innerHTML=icon.pencil;
  const open=q('#openBookBtn');if(open){const lead=q('.link-icon',open),tail=q('.external-icon',open);if(lead)lead.innerHTML=icon.link;if(tail)tail.innerHTML=icon.external;}
  const similar=q('.secondary-title .secondary-icon');if(similar)similar.innerHTML=icon.cards;
  const insight=q('.secondary-title .pin-icon');if(insight)insight.innerHTML=icon.bulb;

  const headshotSport={NFL:'nfl',NBA:'nba',NHL:'nhl',MLB:'mlb',WNBA:'wnba'};
  qa('.pick-card').forEach((card,i)=>{
    const leg=legs[i];if(!leg?.playerId)return;
    const fallback=q('.player-fallback',card);if(!fallback)return;
    const sport=headshotSport[String(leg.sport||'').toUpperCase()];if(!sport)return;
    const img=new Image();
    img.className='player-photo';img.alt=String(leg.player||'Player');
    img.onload=()=>fallback.replaceWith(img);
    img.src=`https://a.espncdn.com/i/headshots/${sport}/players/full/${encodeURIComponent(leg.playerId)}.png`;
  });
})();
