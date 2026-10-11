/* First-party TSO props → Parlay Ping betslip interface.
   The TSO parent owns the account-scoped draft; this iframe never stores or
   transmits an API key. Server rechecks every selected key against the TSO feed. */
(()=>{
  if(!window.PP_TSO_AUTH?.enabled)return;
  const parentOrigin='https://thesportsoutpost.com';
  const TSO_PP_MAX_LEGS=25;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const host=document.querySelector('.submit-page');
  if(!host)return;
  const section=document.createElement('section');
  section.className='pp-tso-selection-panel';
  section.innerHTML='<div class="pp-tso-selection-heading"><div><span>TSO 2.0 / PARLAY PING</span><h2>Build from TSO Props</h2><p>Add exact selections using <strong>+ PARLAY</strong> in Props or Research. No screenshot needed.</p></div><strong id="ppTsoDraftCount">0 / 25 LEGS</strong></div><div id="ppTsoDraftRows" class="pp-tso-draft-rows" aria-live="polite">Connecting to your TSO betslip…</div><div class="pp-tso-draft-actions"><button type="button" id="ppTsoOpenProps">+ ADD FROM PROPS</button><button type="button" id="ppTsoClear" disabled>CLEAR</button><button class="pp-tso-primary" type="button" id="ppTsoBuild" disabled>BUILD MY BETSLIP →</button></div><p id="ppTsoDraftStatus" class="pp-tso-draft-status" aria-live="polite">Sportsbook odds and probabilities are checked again when you build.</p>';
  host.insertBefore(section,host.querySelector('.submit-shell'));
  const rowsEl=section.querySelector('#ppTsoDraftRows');
  const count=section.querySelector('#ppTsoDraftCount');
  const buildBtn=section.querySelector('#ppTsoBuild');
  const clearBtn=section.querySelector('#ppTsoClear');
  const status=section.querySelector('#ppTsoDraftStatus');
  let rows=[],building=false;
  const send=(type,details={})=>window.parent.postMessage({type,...details},parentOrigin);
  const requestDraft=()=>send('tso2-parlayping-draft-request');
  section.querySelector('#ppTsoOpenProps').addEventListener('click',()=>send('tso2-parlayping-open-props'));
  clearBtn.addEventListener('click',()=>{if(!building)send('tso2-parlayping-draft-clear')});
  function draw(){
    count.textContent=rows.length+' / '+TSO_PP_MAX_LEGS+' LEGS';
    clearBtn.disabled=building||rows.length===0;
    buildBtn.disabled=building||rows.length===0;
    buildBtn.textContent=building?'VERIFYING EXACT PROPS…':'BUILD '+rows.length+'-LEG BETSLIP →';
    rowsEl.innerHTML=rows.length?rows.map((r,i)=>{
      const price=Number.isFinite(Number(r.price))&&r.price!==null?(Number(r.price)>0?'+':'')+Number(r.price):'—';
      const chance=Number.isFinite(Number(r.modelPct))&&r.modelPct!==null?Number(r.modelPct).toFixed(1)+'%':'—';
      return '<div class="pp-tso-draft-row"><b>'+(i+1).toString().padStart(2,'0')+'</b><div><strong>'+esc(r.player)+'</strong><small>'+esc(r.sport)+' · '+esc(r.marketLabel||r.market)+' · '+esc(r.selection)+'</small></div><span><strong>'+esc(price)+'</strong><small>'+esc(r.book||'BOOK PENDING')+'</small></span><span><strong>'+esc(chance)+'</strong><small>TSO MODEL</small></span><button type="button" data-pp-tso-remove="'+esc(r.key)+'" aria-label="Remove '+esc(r.player)+'">×</button></div>';
    }).join(''):'<div class="pp-tso-draft-empty"><b>Your betslip is empty.</b><span>Go to Props or Research and tap + PARLAY on the exact selections you want.</span></div>';
    rowsEl.querySelectorAll('[data-pp-tso-remove]').forEach(el=>el.addEventListener('click',()=>{if(!building)send('tso2-parlayping-draft-remove',{key:el.dataset.ppTsoRemove})}));
  }
  window.addEventListener('message',e=>{
    if(e.origin!==parentOrigin||e.source!==window.parent||e.data?.type!=='tso2-parlayping-draft-sync')return;
    const incoming=Array.isArray(e.data.rows)?e.data.rows:[];
    rows=incoming.slice(0,TSO_PP_MAX_LEGS).filter(r=>r&&typeof r.key==='string'&&r.key.length<220);
    draw();
  });
  buildBtn.addEventListener('click',async()=>{
    if(building||!rows.length)return;
    building=true;draw();
    status.textContent='Checking all '+rows.length+' exact selections against the current TSO sportsbook feed…';
    try{
      const auth=await window.PP_TSO_AUTH.whenReady();
      if(!auth?.access_token){window.PP_TSO_AUTH.requestSignIn();throw Error('Sign into The Sports Outpost to build your betslip.');}
      const response=await fetch('/api/tso-build',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+auth.access_token,'x-parlayping-identity':'tso2'},body:JSON.stringify({selectionKeys:rows.map(r=>r.key)})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok||typeof data.path!=='string'||!data.path.startsWith('/build/'))throw Error(data.error||'Could not build this betslip.');
      location.assign(data.path);
    }catch(error){
      status.textContent=String(error?.message||'Could not build betslip.');
      building=false;draw();
    }
  });
  draw();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',requestDraft,{once:true});else requestDraft();
  window.addEventListener('pp-tso-identity-changed',requestDraft);
})();
