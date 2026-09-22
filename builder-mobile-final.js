(()=>{
  const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const state=window.__PARLAYPING_BUILDER__||{},legs=Array.isArray(state.slip?.legs)?state.slip.legs:[];
  const BOOK_ODDS_PREFIX='PP_BOOK_ODDS:';

  /* Use the exact user-approved ParlayPing artwork, not a reconstructed lockup. */
  const brand=q('.brand');
  if(brand){
    brand.innerHTML='<img class="pp-brand-lockup" src="/parlayping-approved-logo.png" alt="ParlayPing — Bet Smarter Together"/><span class="pp-brand-name pp-brand-a11y">ParlayPing</span><span class="pp-brand-tag pp-brand-a11y">BET SMARTER TOGETHER</span>';
    brand.href='#top';
  }

  qa('.sport-shield').forEach(el=>el.remove());
  qa('.pp-return-control,.pp-mobile-return-bar,.pp-mobile-origin-controls').forEach(el=>el.remove());

  const safeProbability=value=>{
    if(value===null||value===undefined||value==='')return null;
    const n=Number(value);
    return Number.isFinite(n)&&n>=0&&n<=1?n:null;
  };
  const formatAmerican=value=>{
    if(value===null||value===undefined||value==='')return '—';
    const n=Number(value);if(!Number.isFinite(n)||n===0)return '—';
    return n>0?`+${Math.round(n)}`:`${Math.round(n)}`;
  };
  const normalizeBook=value=>{
    const key=String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');
    if(key==='draftkings'||key==='dk')return 'DraftKings';
    if(key==='fanduel'||key==='fd')return 'FanDuel';
    if(key==='bet365'||key==='365')return 'bet365';
    if(key==='caesars'||key==='williamhill'||key==='caesarssportsbook')return 'Caesars';
    if(key==='espnbet'||key==='espn')return 'ESPN BET';
    return String(value??'').trim();
  };
  const bookOddsMap=leg=>{
    const raw=String(leg?.originalText||'');
    if(!raw.startsWith(BOOK_ODDS_PREFIX))return {};
    try{
      const parsed=JSON.parse(raw.slice(BOOK_ODDS_PREFIX.length));
      return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
    }catch{return {};}
  };
  function selectedBookPrice(leg,book){
    const normalized=normalizeBook(book),map=bookOddsMap(leg);
    const mapped=Number(map[normalized]);
    if(Number.isFinite(mapped)&&mapped!==0)return mapped;
    if(normalizeBook(leg?.sportsbook)===normalized){
      const own=Number(leg?.oddsAmerican);if(Number.isFinite(own)&&own!==0)return own;
    }
    return null;
  }
  function applySelectedBookPrices(book){
    const normalized=normalizeBook(book);
    qa('.pick-card').forEach((card,index)=>{
      const price=q('.pick-odds',card);if(!price)return;
      price.textContent=formatAmerican(selectedBookPrice(legs[index],normalized));
      price.dataset.book=normalized;
    });
  }

  function sameLocalDate(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
  function displayStartTime(value){
    if(!value)return '';
    const d=new Date(value);if(Number.isNaN(d.getTime()))return '';
    const time=d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
    if(sameLocalDate(d,new Date()))return time;
    const date=d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
    return `${date} • ${time}`;
  }

  qa('.pick-card').forEach((card,index)=>{
    const leg=legs[index]||{};
    const pair=q('.team-pair',card);
    const codes=pair?qa('img',pair).map(img=>img.alt).filter(Boolean):[];
    if(codes.length===2){
      const matchup=`${codes[0]} @ ${codes[1]}`;
      const heading=q('.game-bar strong',card);if(heading)heading.textContent=matchup;
      const small=q('.player-copy small',card);if(small)small.textContent=matchup;
    }

    const heading=q('.game-bar strong',card),gameTime=q('.game-time',card),timeText=displayStartTime(leg.startTimeUTC);
    if(gameTime){
      if(timeText){gameTime.textContent=timeText;gameTime.hidden=false;if(heading)heading.insertAdjacentElement('afterend',gameTime);}
      else gameTime.hidden=true;
    }

    const market=q('.player-copy span',card);
    if(market){
      const raw=market.textContent.trim();
      const over=raw.match(/^O\s*([0-9.]+)\s*(.*)$/i);
      if(over)market.textContent=`Over ${over[1]}${over[2]?` ${over[2].trim()}`:''}`;
    }

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

  const initialBook=q('.book-card.active')?.dataset.book||state.slip?.sportsbook||legs.find(l=>l?.sportsbook)?.sportsbook||'DraftKings';
  applySelectedBookPrices(initialBook);
  qa('.book-card').forEach(card=>card.addEventListener('click',()=>{
    const book=card.dataset.book||'';
    if(book&&book!=='More Books')applySelectedBookPrices(book);
  }));
})();
