(()=>{
  const state=window.__PARLAYPING_BUILDER__||{};
  const slip=state.slip||{};
  const legs=Array.isArray(slip.legs)?slip.legs:[];
  if(!legs.length)return;

  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const num=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
  const BEST='Best Available';
  const BOOK_ORDER=['DraftKings','FanDuel','bet365','Caesars','BetMGM','Fanatics','ESPN BET','Hard Rock','BetRivers','Pinnacle','Parx','Bovada'];
  const CORE_BOOKS=['DraftKings','FanDuel','bet365','Caesars','BetMGM','Fanatics'];
  const BOOK_CLASS={'DraftKings':'dk','FanDuel':'fd','bet365':'b365','Caesars':'cz','BetMGM':'mgm','Fanatics':'fanatics','ESPN BET':'espn'};
  const BOOK_MARK={'DraftKings':'DK','FanDuel':'F','bet365':'bet','Caesars':'C','BetMGM':'M','Fanatics':'F','ESPN BET':'E','Hard Rock':'HR','BetRivers':'BR','Pinnacle':'P','Parx':'PX','Bovada':'B'};
  const BOOK_HOME={
    'DraftKings':'https://sportsbook.draftkings.com/',
    'FanDuel':'https://sportsbook.fanduel.com/',
    'bet365':'https://www.bet365.com/',
    'Caesars':'https://www.caesars.com/sportsbook-and-casino',
    'BetMGM':'https://sports.betmgm.com/',
    'Fanatics':'https://sportsbook.fanatics.com/',
    'ESPN BET':'https://espnbet.com/',
    'Hard Rock':'https://hardrock.bet/',
    'BetRivers':'https://www.betrivers.com/',
    'Pinnacle':'https://www.pinnacle.com/',
    'Parx':'https://www.parxcasino.com/sportsbook',
    'Bovada':'https://www.bovada.lv/sports'
  };
  const normalizeBook=value=>{const raw=String(value||'').trim();if(raw===BEST)return BEST;const key=raw.toLowerCase().replace(/[^a-z0-9]/g,'');const aliases={draftkings:'DraftKings',dk:'DraftKings',fanduel:'FanDuel',fd:'FanDuel',bet365:'bet365','365':'bet365',caesars:'Caesars',williamhill:'Caesars',caesarssportsbook:'Caesars',betmgm:'BetMGM',mgm:'BetMGM',fanatics:'Fanatics',fanaticssportsbook:'Fanatics',espnbet:'ESPN BET',espn:'ESPN BET',hardrock:'Hard Rock',hardrockbet:'Hard Rock',betrivers:'BetRivers',pinnacle:'Pinnacle',parx:'Parx',parxcasino:'Parx',bovada:'Bovada'};return aliases[key]||raw||null;};
  const americanToDecimal=price=>{const n=num(price);if(n==null||n===0)return null;return n>0?1+n/100:1+100/Math.abs(n);};
  const impliedFromAmerican=price=>{const d=americanToDecimal(price);return d&&d>1?1/d:null;};
  const decimalToAmerican=d=>{const n=num(d);if(n==null||n<=1)return null;return n>=2?Math.round((n-1)*100):Math.round(-100/(n-1));};
  const fmtOdds=value=>{const n=num(value);if(n==null||n===0)return '—';const r=Math.round(n);return r>0?`+${r}`:String(r);};
  const fmtPct=value=>{const p=num(value);if(p==null)return '—';return `${(p*100).toFixed(1)}%`;};
  const offerFor=(leg,book)=>{for(const [raw,value] of Object.entries(leg?.bookOffers||{})){if(normalizeBook(raw)===book)return value&&typeof value==='object'?value:{};}return {};};
  const bestPrice=leg=>{const direct=num(leg?.oddsAmerican);if(direct!=null)return direct;let best=null;for(const raw of Object.keys(leg?.bookOffers||{})){const price=num(offerFor(leg,normalizeBook(raw)).oddsAmerican);if(price!=null&&(best==null||price>best))best=price;}return best;};
  const priceFor=(leg,book)=>book===BEST?bestPrice(leg):num(offerFor(leg,book).oddsAmerican);
  const offeredBooks=()=>{const found=new Set();for(const leg of legs)for(const raw of Object.keys(leg?.bookOffers||{})){const book=normalizeBook(raw);if(book)found.add(book);}return found;};
  const unionBooks=()=>{const found=offeredBooks();const desired=new Set([...CORE_BOOKS,...found]);const rows=[...desired];return [...BOOK_ORDER.filter(book=>rows.includes(book)),...rows.filter(book=>!BOOK_ORDER.includes(book)).sort()];};
  const coverage=book=>legs.filter(leg=>priceFor(leg,book)!=null).length;
  const hasBest=()=>legs.every(leg=>bestPrice(leg)!=null);
  const gameIdentity=leg=>{const sport=String(leg?.sport||'').toUpperCase();const matchup=String(leg?.matchup||'').trim().toUpperCase().replace(/\s+/g,' ');const start=String(leg?.startTimeUTC||'').trim();const day=start&&Number.isFinite(Date.parse(start))?new Date(start).toISOString().slice(0,10):'';if(matchup)return `${sport}|${matchup}|${day}`;const id=String(leg?.gameId||'').trim();return id?`${sport}|${id}`:'';};
  const independentGames=()=>{const ids=legs.map(gameIdentity);return ids.every(Boolean)&&new Set(ids).size===ids.length;};
  const combinedFor=book=>{if(!book||!independentGames())return null;let decimal=1;for(const leg of legs){const d=americanToDecimal(priceFor(leg,book));if(d==null)return null;decimal*=d;}return {american:decimalToAmerican(decimal),implied:1/decimal};};
  const preferredRealBook=books=>[...books].sort((a,b)=>coverage(b)-coverage(a)||BOOK_ORDER.indexOf(a)-BOOK_ORDER.indexOf(b))[0]||CORE_BOOKS[0];
  let activeBook=null;
  let fallbackOpenBook=null;

  function injectStyles(){
    if(document.getElementById('pp-sportsbook-polish'))return;
    const style=document.createElement('style');style.id='pp-sportsbook-polish';style.textContent=`
      .pp-sportsbook-note{margin:10px 0 12px;padding:10px 12px;border:1px solid rgba(59,231,218,.28);border-radius:12px;background:rgba(11,43,58,.72);font-size:13px;line-height:1.35;color:#bcd3df}
      .pp-sportsbook-note strong{color:#f4fbff}.pp-sportsbook-note span{color:#20e8d0;font-weight:800}
      .sportsbook-grid.pp-price-grid{display:flex!important;grid-template-columns:none!important;gap:10px!important;overflow-x:auto!important;overflow-y:hidden;padding:2px 2px 8px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;touch-action:pan-x;overscroll-behavior-x:contain}
      .sportsbook-grid.pp-price-grid::-webkit-scrollbar{height:4px}.sportsbook-grid.pp-price-grid::-webkit-scrollbar-thumb{background:#1c6675;border-radius:4px}
      .sportsbook-grid.pp-price-grid .book-card{flex:0 0 190px;min-width:190px;max-width:220px;scroll-snap-align:start;cursor:pointer;pointer-events:auto!important;position:relative;z-index:2}
      .sportsbook-grid.pp-price-grid .book-card.active{outline:2px solid #24e8d1;box-shadow:0 0 0 2px rgba(36,232,209,.12),0 8px 24px rgba(0,0,0,.22)}
      .sportsbook-grid.pp-price-grid .book-card small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
      .pp-prob-label.pp-implied{color:#87dbe5}.pp-prob-label.pp-implied:after{content:' implied';font-size:10px;font-weight:700;opacity:.72;margin-left:3px;text-transform:uppercase}
      #openBookBtn.pp-sportsbook-fallback{display:flex!important;align-items:center;justify-content:center;gap:8px;cursor:pointer}
      @media(max-width:700px){.pp-sportsbook-note{font-size:12px;margin-top:8px}.sportsbook-grid.pp-price-grid{margin-right:-4px}.sportsbook-grid.pp-price-grid .book-card{flex-basis:174px;min-width:174px}.sportsbook-grid.pp-price-grid .book-card strong{font-size:14px}.sportsbook-grid.pp-price-grid .book-card small{font-size:11px}}
    `;document.head.appendChild(style);
  }

  function activeModelProbability(leg){
    const status=String(leg?.status||'PENDING').toUpperCase();
    if(status==='LIVE'){const live=num(leg?.liveProbability);if(live!=null)return {value:live,kind:'model'};}
    const pre=num(leg?.pregameProbability);if(pre!=null)return {value:pre,kind:'model'};
    return null;
  }

  function updateLegs(book){
    qa('.pp-leg-item').forEach((item,index)=>{
      const id=String(item.dataset.legId||'');const leg=legs.find(row=>String(row?.id||'')===id)||legs[index];if(!leg)return;
      const price=priceFor(leg,book);const odds=q('.pp-leg-odds',item);if(odds){odds.textContent=fmtOdds(price);odds.dataset.book=book||'';}
      const model=activeModelProbability(leg);const fallback=model||((price!=null&&impliedFromAmerican(price)!=null)?{value:impliedFromAmerican(price),kind:'implied'}:null);
      const label=q('.pp-prob-label',item),fill=q('.pp-prob-fill',item);
      if(label){label.classList.toggle('pp-implied',fallback?.kind==='implied');label.textContent=fallback?fmtPct(fallback.value):'—';label.title=fallback?.kind==='implied'?`Implied probability from ${book===BEST?'best available':book} odds`:'Model probability';}
      if(fill)fill.style.setProperty('--pp-prob',`${fallback?Math.max(0,Math.min(100,fallback.value*100)):0}%`);
    });
  }

  function updateSummary(){
    const odds=q('#combinedOdds'),prob=q('#impliedProbability');if(!odds||!prob)return;
    if(slip.combinedOddsVerified&&num(slip.combinedOddsAmerican)!=null){const d=americanToDecimal(slip.combinedOddsAmerican);odds.textContent=fmtOdds(slip.combinedOddsAmerican);prob.textContent=d?fmtPct(1/d):'—';return;}
    const combined=combinedFor(activeBook);if(!combined){odds.textContent='—';prob.textContent='—';return;}
    odds.textContent=`Calc ${fmtOdds(combined.american)}`;prob.textContent=fmtPct(combined.implied);
    const title=activeBook===BEST?'Calculated from each leg’s best verified price.':'Calculated from verified leg prices at this sportsbook.';odds.title=title;prob.title=title;
  }

  function syncOpenButton(open){
    if(!open)return;
    const book=activeBook===BEST?fallbackOpenBook:activeBook;
    const url=BOOK_HOME[book]||null;
    open.classList.remove('pp-hidden-one-tap','unavailable');
    open.classList.add('pp-sportsbook-fallback');
    open.disabled=!url;
    open.innerHTML=`<span class="link-icon">↗</span> <strong>Open ${esc(book||'Sportsbook')}</strong>`;
    open.onclick=()=>{if(url)window.open(url,'_blank','noopener,noreferrer');};
    open.title=url?`Open ${book} sportsbook`:'Sportsbook link unavailable';
  }

  function setActive(book,grid,open){
    activeBook=book;qa('.book-card',grid).forEach(card=>card.classList.toggle('active',normalizeBook(card.dataset.book)===book));
    const label=q('#selectedBookLabel');if(label)label.textContent=book===BEST?(fallbackOpenBook||'Sportsbook'):(book||'Sportsbook');
    updateLegs(book);updateSummary();syncOpenButton(open);
  }

  function renderPriceSelector(){
    const grid=q('.sportsbook-grid'),open=q('#openBookBtn');if(!grid)return;
    const exactCards=qa('.book-card',grid).filter(card=>String(card.dataset.exactUrl||'').startsWith('https://'));
    if(exactCards.length){updateLegs(normalizeBook(q('.book-card.active',grid)?.dataset.book)||normalizeBook(exactCards[0].dataset.book));return;}
    const books=unionBooks();if(!books.length)return;
    fallbackOpenBook=preferredRealBook(books);
    const parent=grid.parentElement;
    qa('.pp-books-price-note,.pp-books-unavailable,.pp-sportsbook-note',parent||document).forEach(node=>node.remove());
    const note=document.createElement('div');note.className='pp-sportsbook-note';note.innerHTML='<strong>Choose a sportsbook.</strong> <span>Exact slip when available; sportsbook page otherwise.</span>';
    grid.before(note);
    activeBook=fallbackOpenBook;
    const cards=[];
    if(hasBest()){const c=combinedFor(BEST);cards.push(`<button class="book-card" type="button" data-book="${BEST}"><span class="book-logo more">★</span><span><strong>Best Available</strong><small>${legs.length}/${legs.length} priced${c?.american!=null?` · ${esc(fmtOdds(c.american))}`:''}</small></span></button>`);}
    for(const book of books){const c=coverage(book)===legs.length?combinedFor(book):null;const priced=coverage(book);const sub=priced?`${priced}/${legs.length} priced${c?.american!=null?` · ${esc(fmtOdds(c.american))}`:''}`:'Open sportsbook';cards.push(`<button class="book-card${book===activeBook?' active':''}" type="button" data-book="${esc(book)}"><span class="book-logo ${esc(BOOK_CLASS[book]||'more')}">${esc(BOOK_MARK[book]||book.slice(0,2).toUpperCase())}</span><span><strong>${esc(book)}</strong><small>${sub}</small></span></button>`);}
    grid.classList.add('pp-price-grid');grid.innerHTML=cards.join('');
    grid.onclick=event=>{const card=event.target.closest('.book-card');if(!card||!grid.contains(card))return;event.preventDefault();setActive(normalizeBook(card.dataset.book),grid,open);};
    setActive(activeBook,grid,open);
  }

  function init(){injectStyles();renderPriceSelector();updateSummary();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(()=>requestAnimationFrame(init)),{once:true});else requestAnimationFrame(()=>requestAnimationFrame(init));
  window.__PP_SUMMARY_ODDS_HOTFIX_TEST__={americanToDecimal,decimalToAmerican,impliedFromAmerican,combinedFor,unionBooks,coverage,independentGames,fmtPct,fmtOdds,BEST,BOOK_HOME,preferredRealBook};
})();
