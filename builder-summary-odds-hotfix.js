(()=>{
  const state=window.__PARLAYPING_BUILDER__||{};
  const slip=state.slip||{};
  const legs=Array.isArray(slip.legs)?slip.legs:[];
  if(!legs.length)return;

  const q=s=>document.querySelector(s);
  const num=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
  const normalizeBook=value=>{const raw=String(value||'').trim(),key=raw.toLowerCase().replace(/[^a-z0-9]/g,'');const aliases={draftkings:'DraftKings',dk:'DraftKings',fanduel:'FanDuel',fd:'FanDuel',bet365:'bet365','365':'bet365',caesars:'Caesars',williamhill:'Caesars',caesarssportsbook:'Caesars',betmgm:'BetMGM',mgm:'BetMGM',fanatics:'Fanatics',fanaticssportsbook:'Fanatics',espnbet:'ESPN BET',espn:'ESPN BET'};return aliases[key]||raw||null;};
  const americanToDecimal=price=>{const n=num(price);if(n==null||n===0)return null;return n>0?1+n/100:1+100/Math.abs(n);};
  const decimalToAmerican=decimal=>{const d=num(decimal);if(d==null||d<=1)return null;return d>=2?Math.round((d-1)*100):Math.round(-100/(d-1));};
  const fmtOdds=value=>{const n=num(value);if(n==null||n===0)return '—';const r=Math.round(n);return r>0?`+${r}`:String(r);};
  const offerFor=(leg,book)=>{const offers=leg?.bookOffers&&typeof leg.bookOffers==='object'?leg.bookOffers:{};for(const [raw,value] of Object.entries(offers)){if(normalizeBook(raw)===book)return value&&typeof value==='object'?value:{};}return {};};
  const validPrice=(leg,book)=>num(offerFor(leg,book).oddsAmerican);
  const allBooks=()=>{
    let common=null;
    for(const leg of legs){
      const books=new Set(Object.keys(leg?.bookOffers||{}).map(normalizeBook).filter(book=>book&&validPrice(leg,book)!=null));
      common=common==null?books:new Set([...common].filter(book=>books.has(book)));
    }
    return [...(common||[])];
  };
  const selectedBook=()=>{
    const active=normalizeBook(q('.book-card.active')?.dataset?.book);
    const common=allBooks();
    if(active&&common.includes(active))return active;
    const requested=normalizeBook(slip.sportsbook);
    if(requested&&common.includes(requested))return requested;
    const order=['DraftKings','FanDuel','bet365','Caesars','BetMGM','Fanatics','ESPN BET'];
    return order.find(book=>common.includes(book))||common[0]||null;
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
  function update(){
    const combinedOdds=q('#combinedOdds'),impliedProbability=q('#impliedProbability');
    if(!combinedOdds||!impliedProbability)return;
    if(slip.combinedOddsVerified&&num(slip.combinedOddsAmerican)!=null){
      const decimal=americanToDecimal(slip.combinedOddsAmerican);
      combinedOdds.textContent=fmtOdds(slip.combinedOddsAmerican);
      impliedProbability.textContent=decimal?`${(100/decimal).toFixed(1)}%`:'—';
      combinedOdds.title='Verified sportsbook parlay odds';
      impliedProbability.title='Implied probability from verified sportsbook parlay odds';
      return;
    }
    const book=selectedBook(),combined=combinedForBook(book);
    if(!combined||combined.american==null||combined.implied==null){
      combinedOdds.textContent='—';impliedProbability.textContent='—';return;
    }
    combinedOdds.textContent=fmtOdds(combined.american);
    impliedProbability.textContent=`${(combined.implied*100).toFixed(1)}%`;
    const note=`Calculated from verified ${book} leg prices; not a same-game-parlay quote.`;
    combinedOdds.title=note;impliedProbability.title=note;
  }
  function schedule(){requestAnimationFrame(()=>requestAnimationFrame(update));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
  document.addEventListener('click',event=>{if(event.target?.closest?.('.book-card'))setTimeout(update,0);},true);
  const observer=new MutationObserver(records=>{if(records.some(row=>[...row.addedNodes].some(node=>node?.nodeType===1&&((node.matches?.('.sportsbook-grid,.book-card'))||node.querySelector?.('.book-card')))))schedule();});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.__PP_SUMMARY_ODDS_HOTFIX_TEST__={americanToDecimal,decimalToAmerican,combinedForBook,allBooks,update};
})();
