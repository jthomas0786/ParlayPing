(()=>{
  const state=window.__PARLAYPING_BUILDER__||{};
  const slip=state.slip||{};
  const legs=Array.isArray(slip.legs)?slip.legs:[];
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ORDER=['FanDuel','DraftKings','bet365','Caesars','BetMGM','Fanatics','Hard Rock Bet','BetRivers','Pinnacle','Parx Casino','Bovada','Fliff','theScore Bet','ESPN BET'];
  const REAL=new Set(ORDER);
  const RESOLVABLE=new Set(['FanDuel','DraftKings']);
  const URLS={FanDuel:'https://sportsbook.fanduel.com/',DraftKings:'https://sportsbook.draftkings.com/',bet365:'https://www.bet365.com/',Caesars:'https://sportsbook.caesars.com/',BetMGM:'https://sports.betmgm.com/',Fanatics:'https://sportsbook.fanatics.com/','Hard Rock Bet':'https://www.hardrock.bet/',BetRivers:'https://www.betrivers.com/',Pinnacle:'https://www.pinnacle.com/',Bovada:'https://www.bovada.lv/sports',Fliff:'https://www.getfliff.com/','theScore Bet':'https://thescore.bet/'};
  const MARK={FanDuel:'FD',DraftKings:'DK',bet365:'bet',Caesars:'C',BetMGM:'M',Fanatics:'F','Hard Rock Bet':'HR',BetRivers:'BR',Pinnacle:'P','Parx Casino':'PX',Bovada:'BO',Fliff:'FL','theScore Bet':'S','ESPN BET':'E'};
  const resolved=new Map(),probing=new Map();

  function norm(v){
    const raw=String(v||'').trim(),k=raw.toLowerCase().replace(/[^a-z0-9]/g,'');
    const a={fanduel:'FanDuel',fanduelsportsbook:'FanDuel',fd:'FanDuel',draftkings:'DraftKings',draftkingssportsbook:'DraftKings',dk:'DraftKings',bet365:'bet365','365':'bet365',caesars:'Caesars',williamhill:'Caesars',caesarssportsbook:'Caesars',betmgm:'BetMGM',mgm:'BetMGM',fanatics:'Fanatics',fanaticssportsbook:'Fanatics',hardrock:'Hard Rock Bet',hardrockbet:'Hard Rock Bet',betrivers:'BetRivers',pinnacle:'Pinnacle',parx:'Parx Casino',parxcasino:'Parx Casino',bovada:'Bovada',fliff:'Fliff',thescore:'theScore Bet',thescorebet:'theScore Bet',espn:'ESPN BET',espnbet:'ESPN BET'};
    const n=a[k]||raw;return REAL.has(n)?n:null;
  }
  function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)&&n!==0?n:null;}
  function https(v){try{const u=new URL(String(v||''));return u.protocol==='https:'?u.toString():null}catch{return null}}
  function offer(leg,book){
    for(const [raw,row] of Object.entries(leg?.bookOffers||{}))if(norm(raw)===book&&row&&typeof row==='object')return row;
    return null;
  }
  function odds(leg,book){
    const n=finite(offer(leg,book)?.oddsAmerican);if(n!=null)return n;
    return norm(leg?.sportsbook)===book?finite(leg?.oddsAmerican):null;
  }
  function coverage(book){return legs.reduce((n,leg)=>n+(odds(leg,book)!=null?1:0),0)}
  function fmt(v){const n=finite(v);return n==null?'—':n>0?`+${Math.round(n)}`:`${Math.round(n)}`}
  function books(){
    const set=new Set();
    for(const leg of legs){
      for(const raw of Object.keys(leg?.bookOffers||{})){const b=norm(raw);if(b&&odds(leg,b)!=null)set.add(b)}
      const b=norm(leg?.sportsbook);if(b&&odds(leg,b)!=null)set.add(b);
    }
    for(const raw of Object.keys(slip?.sportsbookLinks||{})){const b=norm(raw);if(b)set.add(b)}
    return [...set].filter(b=>coverage(b)>0).sort((a,b)=>coverage(b)-coverage(a)||ORDER.indexOf(a)-ORDER.indexOf(b));
  }
  function resolverLeg(leg){return {sport:leg?.sport||null,player:leg?.player||null,gameId:leg?.gameId||null,matchup:leg?.matchup||null,market:leg?.market||null,displayMarket:leg?.displayMarket||null,side:leg?.side||null,line:leg?.line??null,inclusive:Boolean(leg?.inclusive),startTimeUTC:leg?.startTimeUTC||null}}
  function partialFanDuel(selections){
    const rows=(selections||[]).filter(x=>x?.marketId&&x?.selectionId);if(!rows.length)return null;
    const parts=[];rows.forEach((x,i)=>{parts.push(`marketId%5B${i}%5D=${encodeURIComponent(x.marketId)}`);parts.push(`selectionId%5B${i}%5D=${encodeURIComponent(x.selectionId)}`)});
    return `https://account.sportsbook.fanduel.com/sportsbook/addToBetslip?${parts.join('&')}`;
  }
  function partialDraftKings(selections){
    const outcomes=[];for(const row of selections||[]){if(!row)continue;const u=https(row.selectionLink);if(!u)continue;try{const raw=new URL(u).searchParams.get('outcomes');if(raw){const vals=raw.split(/[ +,]/).filter(Boolean);if(vals.length===1)outcomes.push(vals[0])}}catch{}}
    return outcomes.length?`https://sportsbook.draftkings.com/?outcomes=${outcomes.map(encodeURIComponent).join('+')}`:null;
  }
  function apply(book,data){
    if(!Array.isArray(data?.selections))return;
    data.selections.forEach((sel,i)=>{
      if(!sel||!legs[i])return;
      const leg=legs[i];leg.bookOffers=leg.bookOffers&&typeof leg.bookOffers==='object'?leg.bookOffers:{};
      const prev=offer(leg,book)||{},price=finite(sel.price),selectionLink=https(sel.selectionLink);
      leg.bookOffers[book]={...prev,...(price!=null?{oddsAmerican:price}:{}),...(selectionLink?{selectionLink}:{}),...(sel.marketId?{marketId:String(sel.marketId)}:{}),...(sel.selectionId?{selectionId:String(sel.selectionId)}:{})};
    });
    const exact=https(data?.url);
    const partial=book==='FanDuel'?partialFanDuel(data.selections):book==='DraftKings'?partialDraftKings(data.selections):null;
    resolved.set(book,{url:exact||partial||URLS[book]||null,exact:Boolean(data?.exact&&exact),partial:Boolean(!data?.exact&&partial)});
  }
  async function probe(book){
    if(!RESOLVABLE.has(book)||!legs.length||probing.has(book))return probing.get(book)||null;
    const task=(async()=>{try{
      const r=await fetch('/api/sportsbook-link',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({book,legs:legs.map(resolverLeg)})});
      const d=await r.json().catch(()=>null);if(r.ok&&d?.ok)apply(book,d);
    }catch{}finally{probing.delete(book);render()}})();
    probing.set(book,task);return task;
  }
  function target(book){
    const explicit=https(slip?.sportsbookLinks?.[book]);if(explicit)return{url:explicit,exact:true,partial:false};
    const hit=resolved.get(book);if(hit?.url)return hit;
    const generic=https(URLS[book]);return generic?{url:generic,exact:false,partial:false}:null;
  }
  function refreshOdds(book){qa('.pp-leg-item').forEach((item,i)=>{const node=q('.pp-leg-odds',item);if(node)node.textContent=fmt(odds(legs[i],book))})}
  function nav(url){const u=https(url);if(!u)return;if(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent||''))location.assign(u);else window.open(u,'_blank','noopener,noreferrer')}
  let selected=null;
  function render(){
    const grid=q('.sportsbook-grid'),old=q('#openBookBtn');if(!grid||!old)return;
    const list=books(),total=legs.length;
    if(!list.length){
      grid.innerHTML=probing.size?'<div class="pp-books-unavailable"><strong>Checking sportsbook availability…</strong><span>Matching exact lines at FanDuel and DraftKings.</span></div>':'<div class="pp-books-unavailable"><strong>No verified sportsbook prices found yet.</strong><span>ParlayPing only shows books with at least one exact available line.</span></div>';
      const b=old.cloneNode(true);old.replaceWith(b);b.disabled=true;b.classList.add('unavailable');b.innerHTML='<span class="link-icon">↗</span> <strong>Sportsbook unavailable</strong>';return;
    }
    if(!selected||!list.includes(selected))selected=list[0];
    grid.innerHTML=list.map(book=>{const n=coverage(book),t=target(book),p=probing.has(book);const detail=p?`Checking · ${n}/${total} lines`:`${n}/${total} lines available${t?.partial?' · partial prefill':''}`;return `<button class="book-card${book===selected?' active':''}" type="button" data-book="${esc(book)}"><span class="book-logo more">${esc(MARK[book]||book.slice(0,2).toUpperCase())}</span><span><strong>${esc(book)}</strong><small>${esc(detail)}</small></span></button>`}).join('');
    const b=old.cloneNode(true);old.replaceWith(b);
    function sync(){
      const n=coverage(selected),t=target(selected);refreshOdds(selected);b.disabled=!t||n===0;b.classList.toggle('unavailable',!t||n===0);
      if(t?.exact)b.innerHTML=`<span class="link-icon">↗</span> <strong>Open all ${n}/${total} picks in ${esc(selected)}</strong> <span class="external-icon">↗</span>`;
      else if(t?.partial)b.innerHTML=`<span class="link-icon">↗</span> <strong>Open ${n}/${total} matched picks in ${esc(selected)}</strong> <span class="external-icon">↗</span>`;
      else if(t)b.innerHTML=`<span class="link-icon">↗</span> <strong>Open ${esc(selected)} · ${n}/${total} lines available</strong> <span class="external-icon">↗</span>`;
      else b.innerHTML='<span class="link-icon">↗</span> <strong>Sportsbook link unavailable</strong>';
    }
    qa('.book-card',grid).forEach(card=>card.addEventListener('click',()=>{selected=norm(card.dataset.book);render()}));
    b.addEventListener('click',()=>{const t=target(selected);if(t?.url)nav(t.url)});sync();
  }

  window.__PP_PARTIAL_SPORTSBOOK_TEST__={norm,coverage,books,target,partialFanDuel,partialDraftKings,apply};
  render();
  setTimeout(render,60);
  for(const book of RESOLVABLE)probe(book);
})();