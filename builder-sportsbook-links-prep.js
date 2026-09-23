(()=>{
  const state=window.__PARLAYPING_BUILDER__||{};
  const slip=state.slip||{};
  const legs=Array.isArray(slip.legs)?slip.legs:[];
  if(!legs.length)return;

  const safeHttps=value=>{try{const u=new URL(String(value||''));return u.protocol==='https:'?u:null;}catch{return null;}};
  const normalizeBook=value=>{const raw=String(value||'').trim(),key=raw.toLowerCase().replace(/[^a-z0-9]/g,'');const aliases={draftkings:'DraftKings',dk:'DraftKings',fanduel:'FanDuel',fd:'FanDuel',bet365:'bet365','365':'bet365',caesars:'Caesars',williamhill:'Caesars',caesarssportsbook:'Caesars',thescorebet:'theScore Bet',thescore:'theScore Bet',betmgm:'BetMGM',mgm:'BetMGM',fanatics:'Fanatics',fanaticssportsbook:'Fanatics'};return aliases[key]||raw||null;};
  const offerFor=(leg,book)=>{const offers=leg?.bookOffers&&typeof leg.bookOffers==='object'?leg.bookOffers:{};for(const [raw,value] of Object.entries(offers)){if(normalizeBook(raw)===book)return value&&typeof value==='object'?value:{};}return {};};
  const selectionUrl=(leg,book)=>{const offer=offerFor(leg,book);const fromOffer=safeHttps(offer.selectionLink||offer.deepLink||offer.link);if(fromOffer)return fromOffer;if(normalizeBook(leg?.sportsbook)===book)return safeHttps(leg?.sportsbookLink);return null;};

  function fanduelSelection(url){
    const parsed=safeHttps(url);if(!parsed)return null;
    const host=parsed.hostname.toLowerCase();if(!host.includes('fanduel'))return null;
    const pairs=[];
    for(const [key,value] of parsed.searchParams.entries()){
      const market=key.match(/^marketId(?:\[(\d+)\])?$/i);if(!market)continue;
      const idx=market[1]??'';const selection=parsed.searchParams.get(idx===''?'selectionId':`selectionId[${idx}]`);if(value&&selection)pairs.push({marketId:value,selectionId:selection});
    }
    return pairs[0]||null;
  }
  function composeFanDuel(){
    const selections=legs.map(leg=>fanduelSelection(selectionUrl(leg,'FanDuel')));if(selections.some(x=>!x))return null;
    const seen=new Set(),unique=[];for(const row of selections){const key=`${row.marketId}|${row.selectionId}`;if(!seen.has(key)){seen.add(key);unique.push(row);}}
    if(unique.length!==legs.length)return null;
    const parts=[];unique.forEach((row,index)=>{parts.push(`marketId%5B${index}%5D=${encodeURIComponent(row.marketId)}`);parts.push(`selectionId%5B${index}%5D=${encodeURIComponent(row.selectionId)}`);});
    return `https://account.sportsbook.fanduel.com/sportsbook/addToBetslip?${parts.join('&')}`;
  }

  function draftKingsOutcome(url){
    const parsed=safeHttps(url);if(!parsed)return null;
    const host=parsed.hostname.toLowerCase();if(!host.includes('draftkings'))return null;
    const raw=parsed.searchParams.get('outcomes');if(!raw)return null;
    const values=raw.split(/[ +,]/).map(x=>x.trim()).filter(Boolean);return values.length===1?values[0]:null;
  }
  function composeDraftKings(){
    const outcomes=legs.map(leg=>draftKingsOutcome(selectionUrl(leg,'DraftKings')));if(outcomes.some(x=>!x))return null;
    const unique=[...new Set(outcomes)];if(unique.length!==legs.length)return null;
    return `https://sportsbook.draftkings.com/?outcomes=${unique.map(encodeURIComponent).join('+')}`;
  }

  const links={...(slip.sportsbookLinks&&typeof slip.sportsbookLinks==='object'?slip.sportsbookLinks:{})};
  if(!links.DraftKings){const url=composeDraftKings();if(url)links.DraftKings=url;}
  if(!links.FanDuel){const url=composeFanDuel();if(url)links.FanDuel=url;}
  slip.sportsbookLinks=links;
  window.__PP_COMPOSED_SPORTSBOOK_LINKS__={...links};
  window.__PP_SPORTSBOOK_LINK_TEST__={normalizeBook,fanduelSelection,draftKingsOutcome,composeFanDuel,composeDraftKings};
})();
