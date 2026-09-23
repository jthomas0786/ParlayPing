(()=>{
  const state=window.__PARLAYPING_BUILDER__||{};
  const slip=state.slip||{};
  const legs=Array.isArray(slip.legs)?slip.legs:[];
  if(!legs.length)return;

  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const num=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
  const BOOK_ORDER=['DraftKings','FanDuel','bet365','Caesars','BetMGM','Fanatics','ESPN BET','Hard Rock','BetRivers','Pinnacle'];
  const BOOK_CLASS={'DraftKings':'dk','FanDuel':'fd','bet365':'b365','Caesars':'cz','BetMGM':'mgm','Fanatics':'fanatics','ESPN BET':'espn','Hard Rock':'more','BetRivers':'more','Pinnacle':'more'};
  const BOOK_MARK={'DraftKings':'DK','FanDuel':'F','bet365':'bet','Caesars':'C','BetMGM':'M','Fanatics':'F','ESPN BET':'E','Hard Rock':'HR','BetRivers':'BR','Pinnacle':'P'};
  const normalizeBook=value=>{const raw=String(value||'').trim(),key=raw.toLowerCase().replace(/[^a-z0-9]/g,'');const aliases={draftkings:'DraftKings',dk:'DraftKings',fanduel:'FanDuel',fd:'FanDuel',bet365:'bet365','365':'bet365',caesars:'Caesars',williamhill:'Caesars',caesarssportsbook:'Caesars',betmgm:'BetMGM',mgm:'BetMGM',fanatics:'Fanatics',fanaticssportsbook:'Fanatics',espnbet:'ESPN BET',espn:'ESPN BET',hardrock:'Hard Rock',hardrockbet:'Hard Rock',betrivers:'BetRivers',pinnacle:'Pinnacle'};return aliases[key]||raw||null;};
  const americanToDecimal=price=>{const n=num(price);if(n==null||n===0)return null;return n>0?1+n/100:1+100/Math.abs(n);};
  const decimalToAmerican=decimal=>{const d=num(decimal);if(d==null||d<=1)return null;return d>=2?Math.round((d-1)*100):Math.round(-100/(d-1));};
  const fmtOdds=value=>{const n=num(value);if(n==null||n===0)return '—';const r=Math.round(n);return r>0?`+${r}`:String(r);};
  const fmtPct=value=>{const p=num(value);if(p==null)return '—';const percent=p*100;if(percent>0&&percent<0.01)return '<0.01%';if(percent<0.1)return `${percent.toFixed(2)}%`;return `${percent.toFixed(1)}%`;};
  const offerFor=(leg,book)=>{const offers=leg?.bookOffers&&typeof leg.bookOffers==='object'?leg.bookOffers:{};for(const [raw,value] of Object.entries(offers)){if(normalizeBook(raw)===book)return value&&typeof value==='object'?value:{};}return {};};
  const validPrice=(leg,book)=>num(offerFor(leg,book).oddsAmerican);
  const allBooks=()=>{
    let common=null;
    for(const leg of legs){
      const books=new Set(Object.keys(leg?.bookOffers||{}).map(normalizeBook).filter(book=>book&&validPrice(leg,book)!=null));
      common=common==null?books:new Set([...common].filter(book=>books.has(book)));
    }
    const rows=[...(common||[])];
    return [...BOOK_ORDER.filter(book=>rows.includes(book)),...rows.filter(book=>!BOOK_ORDER.includes(book)).sort()];
  };
  const selectedBook=()=>{
    const active=normalizeBook(q('.book-card.active')?.dataset?.book);
    const common=allBooks();
    if(active&&common.includes(active))return active;
    const requested=normalizeBook(slip.sportsbook);
    if(requested&&common.includes(requested))return requested;
    return common[0]||null;
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
      if(target){target.dataset.book=book||'';target.textContent=fmtOdds(validPrice(leg,book));}
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
    combinedOdds.textContent=fmtOdds(combined.american);
    impliedProbability.textContent=fmtPct(combined.implied);
    const note=`Calculated from verified ${book} leg prices across separate games; this is not a sportsbook-quoted parlay price.`;
    combinedOdds.title=note;impliedProbability.title=note;
  }
  function installVerifiedPriceFallback(){
    const grid=q('.sportsbook-grid'),open=q('#openBookBtn');
    if(!grid||!open)return;
    const exact=[...grid.querySelectorAll('.book-card')].some(card=>String(card.dataset.exactUrl||'').startsWith('https://'));
    if(exact)return;
    const books=allBooks();if(!books.length)return;
    const active=selectedBook()||books[0];
    grid.innerHTML=`<div style="grid-column:1/-1" class="pp-books-unavailable pp-books-price-note"><strong>Verified sportsbook prices are available.</strong><span>These MLB price rows do not include sportsbook selection IDs, so ParlayPing will not invent a one-tap betslip link or send you to a generic homepage.</span></div>${books.map(book=>{const combined=combinedForBook(book);const sub=combined?.american!=null?`Verified leg prices · calc. ${fmtOdds(combined.american)}`:'Verified leg prices';return `<button class="book-card${book===active?' active':''}" type="button" data-book="${esc(book)}" role="listitem"><span class="book-logo ${esc(BOOK_CLASS[book]||'more')}">${esc(BOOK_MARK[book]||book.slice(0,2).toUpperCase())}</span><span><strong>${esc(book)}</strong><small>${esc(sub)}</small></span></button>`;}).join('')}`;
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
  window.__PP_SUMMARY_ODDS_HOTFIX_TEST__={americanToDecimal,decimalToAmerican,combinedForBook,allBooks,update,installVerifiedPriceFallback,fmtPct};
})();
