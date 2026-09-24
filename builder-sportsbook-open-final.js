(()=>{
  const state=window.__PARLAYPING_BUILDER__||{};
  const slip=state.slip||{};
  const legs=Array.isArray(slip.legs)?slip.legs:[];
  const q=(selector,root=document)=>root.querySelector(selector);
  const qa=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  const BOOK_ORDER=['DraftKings','FanDuel','bet365','Caesars','theScore Bet','BetMGM','Fanatics'];
  const BOOK_CLASS={'DraftKings':'dk','FanDuel':'fd','bet365':'b365','Caesars':'cz','theScore Bet':'score','BetMGM':'mgm','Fanatics':'fanatics'};
  const BOOK_MARK={'DraftKings':'DK','FanDuel':'F','bet365':'bet','Caesars':'C','theScore Bet':'S','BetMGM':'M','Fanatics':'F'};
  const RESOLVABLE_BOOKS=new Set(['DraftKings','FanDuel']);
  const GENERIC_BOOK_URLS={
    DraftKings:'https://sportsbook.draftkings.com/',
    FanDuel:'https://sportsbook.fanduel.com/',
    bet365:'https://www.bet365.com/',
    Caesars:'https://sportsbook.caesars.com/',
    'theScore Bet':'https://thescore.bet/',
    BetMGM:'https://sports.betmgm.com/',
    Fanatics:'https://sportsbook.fanatics.com/'
  };

  function normalizeBook(value){
    const raw=String(value||'').trim();
    const key=raw.toLowerCase().replace(/[^a-z0-9]/g,'');
    const aliases={draftkings:'DraftKings',draftkingssportsbook:'DraftKings',dk:'DraftKings',fanduel:'FanDuel',fanduelsportsbook:'FanDuel',fd:'FanDuel',bet365:'bet365','365':'bet365',caesars:'Caesars',williamhill:'Caesars',caesarssportsbook:'Caesars',thescorebet:'theScore Bet',thescore:'theScore Bet',betmgm:'BetMGM',mgm:'BetMGM',fanatics:'Fanatics',fanaticssportsbook:'Fanatics'};
    return aliases[key]||raw||null;
  }
  function safeHttps(value){try{const url=new URL(String(value||''));return url.protocol==='https:'?url.toString():null;}catch{return null;}}
  function fmtOdds(value){const n=Number(value);if(!Number.isFinite(n))return '—';return n>0?`+${Math.round(n)}`:`${Math.round(n)}`;}
  function entryForBook(map,book){
    if(!map||typeof map!=='object'||!book)return null;
    const wanted=normalizeBook(book);
    for(const [raw,value] of Object.entries(map)){if(normalizeBook(raw)===wanted)return value&&typeof value==='object'?value:null;}
    return null;
  }
  function exactSportsbookLinks(){
    const out={};
    const explicit=slip.sportsbookLinks&&typeof slip.sportsbookLinks==='object'?slip.sportsbookLinks:{};
    for(const [raw,value] of Object.entries(explicit)){
      const book=normalizeBook(raw),url=safeHttps(value);
      if(book&&url)out[book]=url;
    }
    const books=[...new Set(legs.map(leg=>normalizeBook(leg?.sportsbook)).filter(Boolean))];
    for(const book of books){
      if(out[book]||!legs.length||!legs.every(leg=>normalizeBook(leg?.sportsbook)===book))continue;
      const urls=[...new Set(legs.map(leg=>safeHttps(leg?.sportsbookLink)).filter(Boolean))];
      if(urls.length===1)out[book]=urls[0];
    }
    return out;
  }
  function pricedSportsbooks(){
    const books=new Set(Object.keys(exactSportsbookLinks()));
    for(const leg of legs){
      for(const [raw,offer] of Object.entries(leg?.bookOffers||{})){
        if(Number.isFinite(Number(offer?.oddsAmerican))){const book=normalizeBook(raw);if(book)books.add(book);}
      }
      if(Number.isFinite(Number(leg?.oddsAmerican))){const book=normalizeBook(leg?.sportsbook);if(book)books.add(book);}
    }
    const requested=normalizeBook(slip?.sportsbook);if(requested)books.add(requested);
    return [...books];
  }
  function orderedBooks(){
    const names=pricedSportsbooks();
    return [...BOOK_ORDER.filter(book=>names.includes(book)),...names.filter(book=>!BOOK_ORDER.includes(book)).sort()];
  }
  function openTarget(book){
    const exact=exactSportsbookLinks()[book];
    if(exact)return {url:exact,exact:true};
    const generic=safeHttps(GENERIC_BOOK_URLS[book]);
    return generic?{url:generic,exact:false}:null;
  }
  function legOddsForBook(leg,book){
    const offer=entryForBook(leg?.bookOffers,book);
    const price=Number(offer?.oddsAmerican);
    if(Number.isFinite(price))return price;
    if(normalizeBook(leg?.sportsbook)===book&&Number.isFinite(Number(leg?.oddsAmerican)))return Number(leg.oddsAmerican);
    return null;
  }
  function refreshDisplayedOdds(book){
    qa('.pp-leg-item').forEach((item,index)=>{
      const id=String(item.dataset.legId||'');
      const leg=(id&&legs.find(row=>String(row?.id||'')===id))||legs[index];
      const price=q('.pp-leg-odds',item);
      if(price)price.textContent=fmtOdds(legOddsForBook(leg,book));
    });
  }
  function mobileLike(){
    const ua=String(navigator?.userAgent||'');
    return /Android|iPhone|iPad|iPod/i.test(ua)||(/Macintosh/i.test(ua)&&Number(navigator?.maxTouchPoints)>1);
  }
  function navigateToSportsbook(url){
    const safe=safeHttps(url);if(!safe)return false;
    if(mobileLike()&&window.location&&typeof window.location.assign==='function')window.location.assign(safe);
    else window.open(safe,'_blank','noopener,noreferrer');
    return true;
  }
  function resolverLeg(leg){
    return {
      sport:leg?.sport||null,
      player:leg?.player||null,
      gameId:leg?.gameId||null,
      matchup:leg?.matchup||null,
      market:leg?.market||null,
      displayMarket:leg?.displayMarket||null,
      side:leg?.side||null,
      line:leg?.line??null,
      inclusive:Boolean(leg?.inclusive),
      startTimeUTC:leg?.startTimeUTC||null
    };
  }
  function canResolveExact(book){return Boolean(RESOLVABLE_BOOKS.has(normalizeBook(book))&&legs.length&&!exactSportsbookLinks()[normalizeBook(book)]);}
  function applyResolvedSelections(book,data){
    const url=safeHttps(data?.url);if(!url)return null;
    slip.sportsbookLinks={...(slip.sportsbookLinks&&typeof slip.sportsbookLinks==='object'?slip.sportsbookLinks:{})};
    slip.sportsbookLinks[book]=url;
    if(Array.isArray(data?.selections))data.selections.forEach((selection,index)=>{
      const leg=legs[index];if(!leg||!selection)return;
      const selectionLink=safeHttps(selection.selectionLink);
      leg.bookOffers=leg.bookOffers&&typeof leg.bookOffers==='object'?leg.bookOffers:{};
      const existing=entryForBook(leg.bookOffers,book)||{};
      leg.bookOffers[book]={...existing,...(selectionLink?{selectionLink}:{}),...(selection.selectionId?{selectionId:String(selection.selectionId)}:{}),...(selection.marketId?{marketId:String(selection.marketId)}:{})};
    });
    return url;
  }

  const resolving=new Map();
  function resolveExactBook(book){
    const normalized=normalizeBook(book);
    const existing=exactSportsbookLinks()[normalized];if(existing)return Promise.resolve(existing);
    if(!RESOLVABLE_BOOKS.has(normalized)||!legs.length||typeof window.fetch!=='function')return Promise.resolve(null);
    if(resolving.has(normalized))return resolving.get(normalized);
    const task=(async()=>{
      const response=await window.fetch('/api/sportsbook-link',{
        method:'POST',
        headers:{'content-type':'application/json','accept':'application/json'},
        body:JSON.stringify({book:normalized,legs:legs.map(resolverLeg)})
      });
      let data=null;try{data=await response.json();}catch{}
      if(!response.ok||!data?.ok||!data?.exact)return null;
      return applyResolvedSelections(normalized,data);
    })().catch(()=>null).finally(()=>resolving.delete(normalized));
    resolving.set(normalized,task);
    return task;
  }
  function invalidateResolvedLinks(){
    if(!slip.sportsbookLinks||typeof slip.sportsbookLinks!=='object')return;
    for(const book of RESOLVABLE_BOOKS)delete slip.sportsbookLinks[book];
  }

  let selectedBook=null;
  function renderSportsbooks(preferred){
    const grid=q('.sportsbook-grid');
    const oldOpen=q('#openBookBtn');
    if(!grid||!oldOpen)return;
    const books=orderedBooks();
    const requested=normalizeBook(preferred)||normalizeBook(selectedBook)||normalizeBook(slip?.sportsbook);
    selectedBook=(requested&&books.includes(requested)?requested:null)||books[0]||null;

    if(!books.length){
      grid.innerHTML='<div class="pp-books-unavailable"><strong>No verified sportsbook prices are attached to this betslip.</strong><span>ParlayPing will not invent a sportsbook selection or price.</span></div>';
      const open=oldOpen.cloneNode(true);oldOpen.replaceWith(open);open.disabled=true;open.classList.add('unavailable');
      open.innerHTML='<span class="link-icon">↗</span> <strong>Sportsbook unavailable</strong>';
      return;
    }

    const exactLinks=exactSportsbookLinks();
    grid.innerHTML=books.map(book=>{
      const exact=Boolean(exactLinks[book]);
      const resolvingNow=resolving.has(book);
      const canOpen=Boolean(openTarget(book));
      const detail=exact?'Prefilled Betslip':resolvingNow?'Preparing Betslip':canResolveExact(book)?'Tap to Prepare Betslip':canOpen?'Open Sportsbook':'Link Unavailable';
      return `<button class="book-card${book===selectedBook?' active':''}${canOpen?'':' unavailable'}" type="button" data-book="${esc(book)}" role="listitem"><span class="book-logo ${esc(BOOK_CLASS[book]||'more')}">${esc(BOOK_MARK[book]||book.slice(0,2).toUpperCase())}</span><span><strong>${esc(book)}</strong><small>${esc(detail)}</small></span></button>`;
    }).join('');

    const open=oldOpen.cloneNode(true);oldOpen.replaceWith(open);
    const sync=()=>{
      const label=q('#selectedBookLabel');if(label)label.textContent=selectedBook||'Sportsbook';
      const target=selectedBook?openTarget(selectedBook):null;
      const resolvingNow=Boolean(selectedBook&&resolving.has(selectedBook));
      open.disabled=!target||resolvingNow;
      open.classList.toggle('unavailable',!target||resolvingNow);
      if(resolvingNow){
        open.title=`Preparing a verified prefilled ${selectedBook} betslip`;
        open.innerHTML=`<span class="link-icon">↗</span> <strong>Preparing <span id="selectedBookLabel">${esc(selectedBook)}</span> Betslip…</strong>`;
      }else if(target?.exact){
        open.title=`Open the verified prefilled ${selectedBook} betslip`;
        open.innerHTML=`<span class="link-icon">↗</span> <strong>Open Prefilled Bet in <span id="selectedBookLabel">${esc(selectedBook)}</span></strong> <span class="external-icon">↗</span>`;
      }else if(target&&canResolveExact(selectedBook)){
        open.title=`Prepare an exact ${selectedBook} betslip using verified sportsbook selection IDs.`;
        open.innerHTML=`<span class="link-icon">↗</span> <strong>Prepare Bet in <span id="selectedBookLabel">${esc(selectedBook)}</span></strong>`;
      }else if(target){
        open.title=`Exact betslip unavailable. Open ${selectedBook} without preloading picks.`;
        open.innerHTML=`<span class="link-icon">↗</span> <strong>Open <span id="selectedBookLabel">${esc(selectedBook)}</span></strong> <span class="external-icon">↗</span>`;
      }else{
        open.title='No verified sportsbook link is available.';
        open.innerHTML='<span class="link-icon">↗</span> <strong>Sportsbook link unavailable</strong>';
      }
      refreshDisplayedOdds(selectedBook);
    };

    qa('.book-card',grid).forEach(card=>card.addEventListener('click',()=>{
      selectedBook=normalizeBook(card.dataset.book);
      qa('.book-card',grid).forEach(node=>node.classList.toggle('active',node===card));
      if(canResolveExact(selectedBook)){
        const pending=resolveExactBook(selectedBook);sync();
        pending.finally(()=>renderSportsbooks(selectedBook));
      }else sync();
    }));
    open.addEventListener('click',()=>{
      const target=selectedBook?openTarget(selectedBook):null;
      if(!target)return;
      if(target.exact){navigateToSportsbook(target.url);return;}
      if(canResolveExact(selectedBook)){
        const pending=resolveExactBook(selectedBook);sync();
        pending.finally(()=>renderSportsbooks(selectedBook));
        return;
      }
      navigateToSportsbook(target.url);
    });
    sync();
  }

  window.__PP_SPORTSBOOK_OPEN_TEST__={normalizeBook,safeHttps,exactSportsbookLinks,pricedSportsbooks,orderedBooks,openTarget,legOddsForBook,mobileLike,resolverLeg,canResolveExact,applyResolvedSelections};
  renderSportsbooks();
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('.pp-alt-option'))setTimeout(()=>{invalidateResolvedLinks();renderSportsbooks(selectedBook);},0);
  });
})();
