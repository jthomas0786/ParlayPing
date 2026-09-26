(()=>{
  const SUPABASE_URL='https://avwqjgiitxqphvmitolw.supabase.co';
  const SUPABASE_KEY='sb_publishable_7mYXjjkRrQq3iRig7UYHNQ_b6EZZiJA';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const root=document.querySelector('#verifiedPage');
  function id(){const q=new URLSearchParams(location.search).get('tweet');if(q)return q;const parts=location.pathname.split('/').filter(Boolean);return parts[parts.length-1]||'';}
  function pct(v){if(v===null||v===undefined||v==='')return'—';const n=Number(v);if(!Number.isFinite(n))return'—';if(n>0&&n<.1)return'<0.1%';return`${n.toFixed(n%1?1:0)}%`;}
  function fmt(v){const t=Date.parse(v||'');if(!Number.isFinite(t))return'—';return new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(t));}
  function source(row){return String(row?.probability_kind||'').startsWith('market-implied')?'Market-implied':'ParlayPing model';}
  function lineText(r){const market=r?.displayMarket||r?.market||'Prop',player=r?.player||r?.team||'Selection';return `${player} — ${market}`;}
  function legCard(r){const p=r?.probability===null||r?.probability===undefined?null:Number(r.probability)*100;return `<article class="v-leg"><div><span>${esc(r?.sport||'SPORTS')}</span><strong>${esc(lineText(r))}</strong><small>${esc(r?.matchup||'Upcoming event')}</small></div><div class="v-leg-side"><b>${p==null?'—':esc(pct(p))}</b><small>${esc(r?.status||'PENDING')}</small></div></article>`;}
  async function add(tweet,button){button.disabled=true;button.textContent='Opening Builder…';try{const res=await fetch('/api/trending-build',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tweet_id:tweet})}),p=await res.json().catch(()=>({}));if(!res.ok)throw new Error(p?.error||`Could not add bet (${res.status})`);location.assign(p.builderUrl);}catch(e){button.disabled=false;button.textContent='Add to Betslip';alert(e.message||'Could not add this bet to Builder.');}}
  async function load(){const tweet=id();if(!/^\d{8,30}$/.test(tweet)){root.innerHTML='<div class="v-error">Invalid verified betslip reference.</div>';return;}try{const res=await fetch(`${SUPABASE_URL}/rest/v1/x_verified_betslips?tweet_id=eq.${encodeURIComponent(tweet)}&select=*&limit=1`,{headers:{apikey:SUPABASE_KEY}});if(!res.ok)throw new Error(`Record unavailable (${res.status})`);const data=await res.json(),row=Array.isArray(data)?data[0]:null;if(!row){root.innerHTML='<div class="v-error">Verified betslip record not found.</div>';return;}const results=Array.isArray(row?.analysis?.results)?row.analysis.results:[],upcoming=Date.parse(row.event_start_at||'')>Date.now(),author=row.author_username?`@${row.author_username}`:(row.author_name||'X user');document.title=`Verified Betslip ${tweet} — ParlayPing`;root.innerHTML=`
      <section class="v-hero">
        <div><span class="v-kicker">✓ PARLAYPING VERIFIED X BETSLIP</span><h1>${esc(author)}</h1><p>This public X betslip was captured and verified by ParlayPing before its earliest event start.</p></div>
        <div class="v-status ${upcoming?'future':'started'}">${upcoming?'UPCOMING':'EVENT STARTED'}</div>
      </section>
      <section class="v-grid">
        <div class="v-main">
          ${row.media_url?`<a class="v-media" href="${esc(row.tweet_url)}" target="_blank" rel="noopener noreferrer"><img src="${esc(row.media_url)}" alt="Original public betslip from ${esc(author)}"></a>`:''}
          <div class="v-copy"><h2>Original X post</h2><p>${esc(row.original_text||'Public betslip')}</p><a href="${esc(row.tweet_url)}" target="_blank" rel="noopener noreferrer">View original on X ↗</a></div>
          <div class="v-legs"><div class="v-section-head"><h2>Parsed bet</h2><span>${results.length} leg${results.length===1?'':'s'}</span></div>${results.length?results.map(legCard).join(''):'<p class="v-muted">Parsed leg details are not available.</p>'}</div>
        </div>
        <aside class="v-side">
          <div class="v-panel"><span>BET PROBABILITY</span><strong>${esc(pct(row.bet_probability_pct))}</strong><small>${esc(source(row))}</small><p>${esc(row.analysis_summary||'Probability attached when this slip was verified.')}</p></div>
          <div class="v-panel v-meta"><div><span>Verified</span><b>${esc(fmt(row.first_verified_at))}</b></div><div><span>Earliest event</span><b>${esc(fmt(row.event_start_at))}</b></div><div><span>Sport</span><b>${esc(row.sport||'SPORTS')}</b></div><div><span>Attention</span><b>${esc(Number(row.attention_score||0).toFixed(1))}</b></div><div><span>Likes / reposts</span><b>${esc(`${Number(row.like_count||0)} / ${Number(row.repost_count||0)}`)}</b></div></div>
          ${upcoming?`<button class="v-build" id="verifiedBuild" type="button">Add to Betslip</button>`:'<div class="v-closed">This event has started, so this record is preserved for verification history but can no longer be added as an upcoming bet.</div>'}
          <p class="v-disclaimer">Verified means ParlayPing captured and matched the public slip before game time. It is not an endorsement or guarantee of the wager.</p>
        </aside>
      </section>`;
      const btn=document.querySelector('#verifiedBuild');if(btn)btn.addEventListener('click',()=>add(tweet,btn));
    }catch(e){root.innerHTML=`<div class="v-error">${esc(e.message||'Could not load this verified betslip.')}</div>`;}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();