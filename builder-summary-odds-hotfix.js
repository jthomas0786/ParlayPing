(()=>{
  const state=window.__PARLAYPING_BUILDER__||{};
  const slip=state.slip||{};
  const legs=Array.isArray(slip.legs)?slip.legs:[];
  if(!legs.length)return;

  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const num=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
  const BEST='Best Available';
  const BOOK_ORDER=['DraftKings','FanDuel','bet365','Caesars','BetMGM','Fanatics','ESPN BET','Hard Rock','BetRivers','Pinnacle'];
  const BOOK_CLASS={'DraftKings':'dk','FanDuel':'fd','bet365':'b365','Caesars':'cz','BetMGM':'mgm','Fanatics':'fanatics','ESPN BET':'espn','Hard Rock':'more','BetRivers':'more','Pinnacle':'more'};
  const BOOK_MARK={'DraftKings':'DK','FanDuel':'F','bet365':'bet','Caesars':'C','BetMGM':'M','Fanatics':'F','ESPN BET':'E','Hard Rock':'HR','BetRivers':'BR','Pinnacle':'P'};
  const normalizeBook=value=>{const raw=String(value||'').trim();if(raw===BEST)return BEST;const key=raw.toLowerCase().replace(/[^a-z0-9]/g,'');const aliases={draftkings:'DraftKings',dk:'DraftKings',fanduel:'FanDuel',fd:'FanDuel',bet365:'bet365','365':'bet365',caesars:'Caesars',williamhill:'Caesars',caesarssportsbook:'Caesars',betmgm:'BetMGM',mgm:'BetMGM',fanatics:'Fanatics',fanaticssportsbook:'Fanatics',espnbet:'ESPN BET',espn:'ESPN BET',hardrock:'Hard Rock',hardrockbet:'Hard Rock',betrivers:'BetRivers',pinnacle:'Pinnacle'};return aliases[key]||raw||null;};
  const americanToDecimal=price=>{const n=num(price);if(n==null||n===0)return null;return n>0?1+n/100:1+100/Math.abs(n);};
  const decimalToAmerican=decimal=>{const d=num(decimal);if(d==null||d<=1)return null;return d>=2?Math.round((d-1)*100):Math.round(-100/(d-1));};
  const fmtOdds=value=>{const n=num(value);if(n==null||n===0)return '—';const r=Math.round(n);return r>0?`+${r}`:String(r);};
  const fmtPct=value=>{const p=num(value);if(p==null)return '—';const percent=p*100;if(percent>0&&percent<0.01)return '<0.01%';if(percent<0.1)return `${percent.toFixed(2)}%`;return `${percent.toFixed(1)}%`;};
  const offerFor=(leg,book)=>{const offers=leg?.bookOffers&&typeof leg.bookOffers==='object'?leg.bookOffers:{};for(const [raw,value] of Object.entries(offers)){if(normalizeBook(raw)===book)return value&&typeof value==='object'?value:{};}return {};};
  const validPrice=(leg,book)=>book===BEST?num(leg?.oddsAmerican):num(offerFor(leg,book).oddsAmerican);
  const unionBooks=()=>{
    const found=new Set();
    for(const leg of legs)for(const raw of Object.keys(leg?.bookOffers||{})){const book=normalizeBook(raw);if(book)found.add(book);}
    const rows=[...found];
    return [...BOOK_ORDER.filter(book=>rows.includes(book)),...rows.filter(book=>!BOOK_ORDER.includes(book)).sort()];
  };
  const bookCoverage=book=>legs.filter(leg=>validPrice(leg,book)!=null).length;
  const hasBestAvailable=()=>legs.every(leg=>num(leg?.oddsAmerican)!=null);
  const commonBooks=()=>unionBooks().filter(book=>bookCoverage(book)===legs.length);
  const selectedBook=()=>{
    const active=normalizeBook(q('.book-card.active')?.dataset?.book);
    if(active===BEST&&hasBestAvailable())return BEST;
    const books=unionBooks();
    if(active&&books.includes(active))return active;
    const requested=normalizeBook(slip.sportsbook);
    if(requested&&books.includes(requested))return requested;
    if(hasBestAvailable())return BEST;
    return [...books].sort((a,b)=>bookCoverage(b)-bookCoverage(a))[0]||null;
  };
  const independentGames=()=>{
    const ids=legs.map(leg=>String(leg?.gameId||'').trim());
    return ids.every(Boolean)&&new Set(ids).size===ids.length;
  };
  const combinedForBook=book=>{
    if(!book||!independentGames())return null;
    let decimal=1;
    for(const leg of legs){const d=americanToDecimal(validPrice(leg,book));if(d==null)return null;decimal*=d;}
    return {american:decimalToAmerican(decimal),implied:decimal>1?1/decimal:null};
  };
  function updateLegOdds(book){
    qa('.pp-leg-item').forEach((item,index)=>{
      const id=String(item.dataset.legId||'');
      const leg=legs.find(row=>String(row?.id||'')===id)||legs[index];
      const target=item.querySelector('.pp-leg-odds');
      if(!target)return;
      const price=validPrice(leg,book);
      target.dataset.book=book||'';
      target.textContent=fmtOdds(price);
      if(book===BEST&&price!=null){target.title=`Best verified price: ${normalizeBook(leg?.sportsbook)||'sportsbook'}`;}else target.title=book&&price!=null?`${book} verified leg price`:'';
    });
  }
  function update(){
    const combinedOdds=q('#combinedOdds'),impliedProbability=q('#impliedProbability');
    if(!combinedOdds||!impliedProbability)return;
    if(slip.combinedOddsVerified&&num(slip.combinedOddsAmerican)!=null){
      const decimal=americanToDecimal(slip.combinedOddsAmerican);
      combinedOdds.textContent=fmtOdds(slip.combinedOddsAmerican);
      impliedProbability.textContent=decimal?fmtPct(1/decimal):'—';
      combinedOdds.title='Verified sportsbook parlay odds';
      impliedProbability.title='Implied probability from verified sportsbook parlay odds';
      return;
    }
    const book=selectedBook(),combined=combinedForBook(book);
    if(!combined||combined.american==null||combined.implied==null){
      combinedOdds.textContent='—';impliedProbability.textContent='—';return;
    }
    combinedOdds.textContent=`Calc ${fmtOdds(combined.american)}`;
    impliedProbability.textContent=fmtPct(combined.implied);
    const note=book===BEST
      ? 'Calculated from each leg’s best verified sportsbook price across separate games; this is not a sportsbook-quoted parlay price.'
      : `Calculated from verified ${book} leg prices across separate games; this is not a sportsbook-quoted parlay price.`;
    combinedOdds.title=note;impliedProbability.title=note;
  }
  function installVerifiedPriceFallback(){
    const grid=q('.sportsbook-grid'),open=q('#openBookBtn');
    if(!grid||!open)return;
    const exact=[...grid.querySelectorAll('.book-card')].some(card=>String(card.dataset.exactUrl||'').startsWith('https://'));
    if(exact)return;
    const books=unionBooks();if(!books.length)return;
    const useBest=hasBestAvailable();
    const active=useBest?BEST:([...books].sort((a,b)=>bookCoverage(b)-bookCoverage(a))[0]||books[0]);
    const cards=[];
    if(useBest){const combined=combinedForBook(BEST);cards.push(`<button class="book-card active" type="button" data-book="${BEST}" role="listitem"><span class="book-logo more">★</span><span><strong>Best Available</strong><small>${legs.length}/${legs.length} picks priced${combined?.american!=null?` · calc. ${esc(fmtOdds(combined.american))}`:''}</small></span></button>`);}
    for(const book of books){
      const coverage=bookCoverage(book),combined=coverage===legs.length?combinedForBook(book):null;
      const sub=`${coverage}/${legs.length} picks priced${combined?.american!=null?` · calc. ${fmtOdds(combined.american)}`:''}`;
      cards.push(`<button class="book-card${!useBest&&book===active?' active':''}" type="button" data-book="${esc(book)}" role="listitem"><span class="book-logo ${esc(BOOK_CLASS[book]||'more')}">${esc(BOOK_MARK[book]||book.slice(0,2).toUpperCase())}</span><span><strong>${esc(book)}</strong><small>${esc(sub)}</small></span></button>`);
    }
    grid.innerHTML=`<div style="grid-column:1/-1" class="pp-books-unavailable pp-books-price-note"><strong>Verified sportsbook prices are available.</strong><span>${useBest?'Best Available uses the best verified price for each pick across sportsbooks. ':''}ParlayPing labels combined numbers as calculated because they are not a sportsbook-quoted parlay. This MLB feed does not include sportsbook selection IDs, so ParlayPing will not invent a one-tap betslip link or send you to a generic homepage.</span></div>${cards.join('')}`;
    const label=q('#selectedBookLabel');if(label)label.textContent=active;
    open.disabled=true;open.classList.add('unavailable');open.innerHTML='<span class="link-icon">↗</span> <strong>Exact one-tap betslip link unavailable</strong>';
    grid.querySelectorAll('.book-card').forEach(card=>card.addEventListener('click',()=>{
      grid.querySelectorAll('.book-card').forEach(node=>node.classList.remove('active'));
      card.classList.add('active');const book=normalizeBook(card.dataset.book);if(label)label.textContent=book;updateLegOdds(book);update();
    }));
    updateLegOdds(active);
  }
  function schedule(){requestAnimationFrame(()=>requestAnimationFrame(()=>{installVerifiedPriceFallback();update();}));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
  document.addEventListener('click',event=>{if(event.target?.closest?.('.book-card'))setTimeout(update,0);},true);
  const observer=new MutationObserver(records=>{if(records.some(row=>[...row.addedNodes].some(node=>node?.nodeType===1&&((node.matches?.('.sportsbook-grid,.book-card,.pp-books-unavailable'))||node.querySelector?.('.book-card,.pp-books-unavailable')))))schedule();});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.__PP_SUMMARY_ODDS_HOTFIX_TEST__={americanToDecimal,decimalToAmerican,combinedForBook,unionBooks,commonBooks,bookCoverage,update,installVerifiedPriceFallback,fmtPct,BEST};
})();
