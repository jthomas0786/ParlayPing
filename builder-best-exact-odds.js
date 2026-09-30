(()=>{
  const state=window.__PARLAYPING_BUILDER__||{};
  const slip=state.slip||{};
  const legs=Array.isArray(slip.legs)?slip.legs:[];
  const bookApi=window.__PP_SPORTSBOOK_OPEN_TEST__||{};
  const q=(selector,root=document)=>root?.querySelector?.(selector)||null;
  const qa=(selector,root=document)=>root?.querySelectorAll?[...root.querySelectorAll(selector)]:[];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const finiteOdds=value=>typeof bookApi.finiteOdds==='function'?bookApi.finiteOdds(value):(()=>{const n=Number(value);return Number.isFinite(n)&&n!==0?n:null;})();
  const normalizeBook=value=>typeof bookApi.sportsbookName==='function'?bookApi.sportsbookName(value):String(value||'').trim()||null;
  const fmtOdds=value=>typeof bookApi.fmtOdds==='function'?bookApi.fmtOdds(value):(()=>{const n=finiteOdds(value);return n==null?'—':n>0?`+${Math.round(n)}`:`${Math.round(n)}`;})();
  const legOddsForBook=(leg,book)=>typeof bookApi.legOddsForBook==='function'?bookApi.legOddsForBook(leg,book):null;

  function candidateBooksForLeg(leg){
    const names=new Set();
    for(const raw of Object.keys(leg?.bookOffers||{})){
      const book=normalizeBook(raw);if(book)names.add(book);
    }
    const own=normalizeBook(leg?.sportsbook);if(own)names.add(own);
    return [...names];
  }
  function offersForLeg(leg){
    return candidateBooksForLeg(leg)
      .map(book=>({book,price:finiteOdds(legOddsForBook(leg,book))}))
      .filter(row=>row.price!=null)
      .sort((a,b)=>b.price-a.price||a.book.localeCompare(b.book));
  }
  function bestOffersForLeg(leg){
    const offers=offersForLeg(leg);
    if(!offers.length)return [];
    const best=offers[0].price;
    return offers.filter(row=>row.price===best);
  }
  function allCandidateBooks(){
    const names=new Set();
    for(const leg of legs)for(const book of candidateBooksForLeg(leg))names.add(book);
    return [...names];
  }
  function fullCoverageBooks(){
    if(!legs.length)return [];
    return allCandidateBooks().filter(book=>legs.every(leg=>finiteOdds(legOddsForBook(leg,book))!=null));
  }
  function bestLegCount(book){
    const normalized=normalizeBook(book);if(!normalized)return 0;
    return legs.reduce((count,leg)=>count+(bestOffersForLeg(leg).some(row=>row.book===normalized)?1:0),0);
  }
  function coverageCount(book){
    const normalized=normalizeBook(book);if(!normalized)return 0;
    return legs.reduce((count,leg)=>count+(finiteOdds(legOddsForBook(leg,normalized))!=null?1:0),0);
  }
  function rankedFullCoverageBooks(){
    return fullCoverageBooks().sort((a,b)=>bestLegCount(b)-bestLegCount(a)||a.localeCompare(b));
  }
  function coverageRowForBook(book){
    const normalized=normalizeBook(book);
    const cells=legs.map((leg,index)=>{
      const price=finiteOdds(legOddsForBook(leg,normalized));
      const best=price!=null&&bestOffersForLeg(leg).some(row=>row.book===normalized&&row.price===price);
      return {index,price,best};
    });
    const covered=cells.reduce((count,cell)=>count+(cell.price!=null?1:0),0);
    return {book:normalized,covered,total:legs.length,full:Boolean(legs.length&&covered===legs.length),bestLegs:bestLegCount(normalized),cells};
  }
  function rankedCoverageRows(){
    const fullRank=new Map(rankedFullCoverageBooks().map((book,index)=>[book,index]));
    return allCandidateBooks().map(coverageRowForBook).sort((a,b)=>{
      if(a.full!==b.full)return a.full?-1:1;
      if(a.full&&b.full)return (fullRank.get(a.book)??999)-(fullRank.get(b.book)??999);
      return b.covered-a.covered||b.bestLegs-a.bestLegs||a.book.localeCompare(b.book);
    });
  }
  function legLabel(leg,index){
    const subject=String(leg?.player||leg?.selection||leg?.team||leg?.fighter||leg?.golfer||'').trim();
    const market=String(leg?.marketLabel||leg?.market||'').trim();
    const side=String(leg?.side||'').trim();
    const rawLine=leg?.threshold??leg?.line;
    const line=Number(rawLine);
    const lineText=Number.isFinite(line)?`${side?`${side} `:''}${line}${leg?.inclusive&&side.toLowerCase()==='over'?'+':''}`.trim():side;
    const parts=[subject,market,lineText].filter(Boolean);
    return {short:`Leg ${index+1}`,detail:parts.join(' · ')||`Leg ${index+1}`};
  }
  function coverageMatrixForSlip(){
    return {legs:legs.map((leg,index)=>legLabel(leg,index)),rows:rankedCoverageRows()};
  }
  function summaryForSlip(){
    const full=rankedFullCoverageBooks();
    return {
      legCount:legs.length,
      fullCoverageBooks:full.map(book=>({book,bestLegs:bestLegCount(book)})),
      perLeg:legs.map((leg,index)=>({index,best:bestOffersForLeg(leg)})),
      coverageMatrix:coverageMatrixForSlip()
    };
  }
  function legForItem(item,index){
    const id=String(item?.dataset?.legId||'');
    return (id&&legs.find(row=>String(row?.id||'')===id))||legs[index]||null;
  }
  function selectBook(book){
    const normalized=normalizeBook(book);if(!normalized)return false;
    const card=qa('.book-card').find(node=>normalizeBook(node?.dataset?.book)===normalized);
    if(!card||typeof card.click!=='function')return false;
    card.click();
    return true;
  }
  function renderLegBests(fullSet){
    qa('.pp-best-exact-leg').forEach(node=>node.remove?.());
    qa('.pp-leg-item').forEach((item,index)=>{
      const leg=legForItem(item,index);if(!leg)return;
      const best=bestOffersForLeg(leg);if(!best.length)return;
      const price=q('.pp-leg-odds',item);if(!price||!price.parentNode)return;
      const books=best.map(row=>row.book);
      const preferred=books.find(book=>fullSet.has(book))||books[0];
      const label=books.length<=2?books.join(' / '):`${books[0]} +${books.length-1}`;
      const interactive=fullSet.has(preferred);
      const badge=document.createElement?.(interactive?'button':'span');if(!badge)return;
      badge.className=`pp-best-exact-leg${interactive?' is-actionable':''}`;
      if(interactive)badge.type='button';
      badge.textContent=`Best ${fmtOdds(best[0].price)} · ${label}`;
      badge.title=`Best verified exact price: ${fmtOdds(best[0].price)} at ${books.join(', ')}${interactive?'. Select sportsbook.':'. This book does not price every leg on this slip.'}`;
      if(interactive)badge.addEventListener?.('click',()=>selectBook(preferred));
      price.insertAdjacentElement?.('afterend',badge);
    });
  }
  function renderCoverageMatrix(){
    const matrix=coverageMatrixForSlip();
    if(!legs.length)return '';
    const head=matrix.legs.map(label=>`<th class="pp-exact-matrix-leg" scope="col"><span>${esc(label.short)}</span><small title="${esc(label.detail)}">${esc(label.detail)}</small></th>`).join('');
    const body=matrix.rows.map(row=>{
      const bookLabel=row.full?`<button type="button" data-pp-matrix-book="${esc(row.book)}">${esc(row.book)}</button><span class="pp-exact-matrix-full">FULL</span>`:`<span>${esc(row.book)}</span>`;
      const cells=row.cells.map(cell=>{
        if(cell.price==null)return '<td class="pp-exact-matrix-price is-missing" title="No verified exact price for this leg">—</td>';
        return `<td class="pp-exact-matrix-price${cell.best?' is-best':''}" title="${cell.best?'Best verified exact price':'Verified exact price'} at ${esc(row.book)}">${fmtOdds(cell.price)}${cell.best?'<span class="pp-exact-matrix-best">BEST</span>':''}</td>`;
      }).join('');
      return `<tr class="${row.full?'is-full-slip':'is-partial-slip'}"><th scope="row"><div class="pp-exact-matrix-book">${bookLabel}</div></th>${cells}<td class="pp-exact-matrix-coverage${row.full?' is-full':''}">${row.covered}/${row.total}</td></tr>`;
    }).join('');
    return `<div class="pp-exact-matrix"><div class="pp-exact-matrix-head"><strong>Exact Slip Coverage</strong><span>${matrix.rows.length} ${matrix.rows.length===1?'sportsbook':'sportsbooks'} checked</span></div><p class="pp-exact-matrix-note">Every cell is a verified exact selection price. “—” means that sportsbook does not currently have a verified exact price for that leg. Full-slip rows are shown first.</p>${matrix.rows.length?`<div class="pp-exact-matrix-scroll"><table class="pp-exact-matrix-table"><thead><tr><th scope="col">Sportsbook</th>${head}<th scope="col">Coverage</th></tr></thead><tbody>${body}</tbody></table></div>`:'<div class="pp-exact-matrix-empty">No verified sportsbook prices are available for this slip yet.</div>'}</div>`;
  }
  function renderFullCoverage(full){
    const section=q('.sportsbook-section');
    const grid=q('.sportsbook-grid',section||document);
    if(!section||!grid)return;
    q('.pp-best-exact-panel',section)?.remove?.();
    const panel=document.createElement?.('section');if(!panel)return;
    panel.className='pp-best-exact-panel';
    panel.setAttribute?.('aria-label','Best Exact Odds');
    const maxWins=full.length?Math.max(...full.map(book=>bestLegCount(book))):0;
    const rows=full.map(book=>{
      const wins=bestLegCount(book);
      const leader=maxWins>0&&wins===maxWins;
      return `<button class="pp-best-exact-book${leader?' is-leg-best-leader':''}" type="button" data-pp-full-book="${esc(book)}"><span><strong>${esc(book)}</strong><small>${legs.length}/${legs.length} exact selections${leader?' · most leg-best prices':''}</small></span><b>${wins?`Best on ${wins}/${legs.length}`:'Full slip'}</b></button>`;
    }).join('');
    panel.innerHTML=`<div class="pp-best-exact-head"><div><span class="pp-best-exact-kicker">PRICE CHECK</span><h4>Best Exact Odds</h4></div><span class="pp-best-exact-count">${full.length} full-slip ${full.length===1?'book':'books'}</span></div><p>Verified exact prices only. Full-slip books are ordered by how many legs they tie for the best verified price. Per-leg bests can span books; ParlayPing does not infer a combined parlay price.</p>${full.length?`<div class="pp-best-exact-books">${rows}</div>`:'<div class="pp-best-exact-empty">No single sportsbook currently has a verified exact price for every leg. Per-leg best prices are still highlighted above.</div>'}${renderCoverageMatrix()}`;
    grid.parentNode?.insertBefore?.(panel,grid);
    qa('[data-pp-full-book]',panel).forEach(button=>button.addEventListener?.('click',()=>selectBook(button.dataset.ppFullBook)));
    qa('[data-pp-matrix-book]',panel).forEach(button=>button.addEventListener?.('click',()=>selectBook(button.dataset.ppMatrixBook)));
  }
  function annotateBookCards(fullSet){
    qa('.book-card').forEach(card=>{
      q('.pp-full-exact-badge',card)?.remove?.();
      const book=normalizeBook(card?.dataset?.book);
      card.classList?.toggle?.('pp-full-exact',Boolean(book&&fullSet.has(book)));
      if(!book||!fullSet.has(book))return;
      const badge=document.createElement?.('span');if(!badge)return;
      badge.className='pp-full-exact-badge';
      badge.textContent=`Exact ${legs.length}/${legs.length}`;
      card.appendChild?.(badge);
    });
  }
  function render(){
    if(!q('.sportsbook-section')||typeof bookApi.legOddsForBook!=='function')return false;
    const full=rankedFullCoverageBooks();
    const fullSet=new Set(full);
    renderFullCoverage(full);
    annotateBookCards(fullSet);
    renderLegBests(fullSet);
    return true;
  }

  let scheduled=false;
  function schedule(){
    if(scheduled)return;scheduled=true;
    const run=()=>{scheduled=false;render();};
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);
  }
  function observe(){
    const grid=q('.sportsbook-grid');
    if(grid&&typeof MutationObserver==='function'){
      const observer=new MutationObserver(()=>schedule());
      observer.observe(grid,{childList:true});
    }
    document?.addEventListener?.('click',event=>{
      if(event?.target?.closest?.('.book-card,.pp-alt-option'))schedule();
    });
  }

  window.__PP_BEST_EXACT_TEST__={finiteOdds,candidateBooksForLeg,offersForLeg,bestOffersForLeg,fullCoverageBooks,bestLegCount,coverageCount,rankedFullCoverageBooks,coverageRowForBook,rankedCoverageRows,coverageMatrixForSlip,summaryForSlip,selectBook,render};
  render();
  observe();
})();