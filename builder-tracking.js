(()=>{
  const state=window.__PARLAYPING_BUILDER__||{};
  const slip=state.slip||{};
  const legs=Array.isArray(slip.legs)?slip.legs:[];
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const SESSION_KEY='parlayping_supabase_session_v1';
  const SUPABASE_URL='https://avwqjgiitxqphvmitolw.supabase.co';
  const SUPABASE_KEY='sb_publishable_7mYXjjkRrQq3iRig7UYHNQ_b6EZZiJA';
  let currentUser=null;
  let existingTrack=null;

  function toast(message){const node=q('#toast');if(!node)return;node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),2600);}
  function getSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{return null;}}
  function setSession(value){try{if(value)localStorage.setItem(SESSION_KEY,JSON.stringify(value));else localStorage.removeItem(SESSION_KEY);}catch{}}
  async function supabase(path,{method='GET',body,token,prefer}={}){const headers={apikey:SUPABASE_KEY,'content-type':'application/json'};if(token)headers.authorization=`Bearer ${token}`;if(prefer)headers.Prefer=prefer;const response=await fetch(`${SUPABASE_URL}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const text=await response.text();let payload=null;try{payload=text?JSON.parse(text):null;}catch{payload={message:text};}if(!response.ok)throw new Error(payload?.message||payload?.error_description||payload?.error||`Tracking request failed (${response.status})`);return payload;}
  async function validSession(){let session=getSession();if(!session)return null;const exp=Number(session.expires_at||0)*1000;if(exp&&exp-Date.now()>=60000)return session;if(!session.refresh_token)return session;try{session=await supabase('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});setSession(session);return session;}catch{setSession(null);return null;}}
  async function sessionUser(session){if(!session?.access_token)return null;if(currentUser)return currentUser;try{currentUser=await supabase('/auth/v1/user',{token:session.access_token});return currentUser;}catch{return null;}}
  function currentBook(){return String(q('.sportsbook-grid .book-card.active')?.dataset?.book||slip.sportsbook||'').trim()||null;}
  function currentTitle(){const node=q('#myParlayTitle');const text=String(node?.childNodes?.[0]?.textContent||'').trim();return (text&&text!=='My Parlay'?text:`${legs.length}-Leg Parlay`).slice(0,120);}
  function americanToDecimal(value){const n=Number(value);if(!Number.isFinite(n)||n===0)return null;return n>0?1+n/100:1+100/Math.abs(n);}
  function decimalToAmerican(value){const n=Number(value);if(!Number.isFinite(n)||n<=1)return null;return Math.round(n>=2?(n-1)*100:-100/(n-1));}
  function currentCombinedOdds(){
    const displayed=String(q('#combinedOdds')?.textContent||'').trim().replace(/,/g,'');
    if(/^[+-]?\d+$/.test(displayed))return Number(displayed);
    const prices=qa('.pp-leg-odds').map(node=>Number(String(node.textContent||'').replace(/[^0-9+-]/g,''))).filter(Number.isFinite);
    if(prices.length===legs.length&&prices.length){const decimal=prices.map(americanToDecimal);if(decimal.every(Number.isFinite))return decimalToAmerican(decimal.reduce((a,b)=>a*b,1));}
    return slip.combinedOddsVerified&&Number.isFinite(Number(slip.combinedOddsAmerican))?Number(slip.combinedOddsAmerican):null;
  }
  function summary(rows=legs){const counts={hit:0,miss:0,live:0,pending:0};for(const leg of rows){const status=String(leg?.status||'PENDING').toUpperCase();if(status==='HIT')counts.hit++;else if(status==='MISS')counts.miss++;else if(status==='LIVE')counts.live++;else if(['PUSH','VOID'].includes(status)){}else counts.pending++;}let status='UPCOMING';if(counts.miss)status='LOST';else if(rows.length&&counts.hit+rows.filter(leg=>['PUSH','VOID'].includes(String(leg?.status||'').toUpperCase())).length===rows.length)status='WON';else if(counts.live)status='LIVE';return{status,...counts};}
  function snapshotSlip(book,combinedOdds){
    const copy=JSON.parse(JSON.stringify(slip));
    copy.legs=JSON.parse(JSON.stringify(legs));
    copy.sportsbook=book||copy.sportsbook||null;
    copy.combinedOddsAmerican=Number.isFinite(Number(combinedOdds))?Number(combinedOdds):null;
    copy.combinedOddsVerified=Number.isFinite(Number(combinedOdds));
    copy.trackedAt=new Date().toISOString();
    return copy;
  }
  function trackingUrl(){const token=String(state.token||'').trim();return token?`https://parlayping.net/build/${encodeURIComponent(token)}`:null;}
  function signIn(){const next=`${location.pathname}${location.search}${location.hash}`;location.assign(`/account.html?next=${encodeURIComponent(next)}`);}

  function ensureModal(){
    let modal=q('#ppTrackModal');if(modal)return modal;
    modal=document.createElement('div');modal.id='ppTrackModal';modal.className='pp-track-modal';modal.hidden=true;
    modal.innerHTML=`<div class="pp-track-backdrop" data-track-close></div><section class="pp-track-dialog" role="dialog" aria-modal="true" aria-labelledby="ppTrackTitle"><button class="pp-track-x" type="button" data-track-close aria-label="Close">×</button><span class="pp-track-eyebrow">TRACK THIS BETSLIP</span><h2 id="ppTrackTitle">Follow it live in ParlayPing</h2><p class="pp-track-intro">Keep this bet on your Tracking page whether you placed it or just want to watch how it performs.</p><div class="pp-track-choice" role="radiogroup" aria-label="Tracking type"><button type="button" data-track-type="placed" role="radio" aria-checked="false"><strong>Placed Bet</strong><small>I actually placed this bet</small></button><button type="button" data-track-type="watching" role="radio" aria-checked="true" class="active"><strong>Watching</strong><small>No wager — just track it</small></button></div><div class="pp-track-fields" id="ppTrackPlacedFields" hidden><label>Sportsbook<select id="ppTrackBook"></select></label><div class="pp-track-money"><label>Stake <span>(optional)</span><input id="ppTrackStake" inputmode="decimal" placeholder="$0.00"></label><label>Potential payout <span>(optional)</span><input id="ppTrackPayout" inputmode="decimal" placeholder="$0.00"></label></div></div><div class="pp-track-summary" id="ppTrackSummary"></div><p class="pp-track-private">Private by default. You can share progress later from your Tracking page.</p><div class="pp-track-actions"><button type="button" class="pp-track-cancel" data-track-close>Cancel</button><button type="button" class="pp-track-confirm" id="ppTrackConfirm">Track Betslip</button></div></section>`;
    document.body.appendChild(modal);
    qa('[data-track-close]',modal).forEach(node=>node.addEventListener('click',closeModal));
    qa('[data-track-type]',modal).forEach(node=>node.addEventListener('click',()=>selectType(node.dataset.trackType)));
    q('#ppTrackConfirm',modal)?.addEventListener('click',saveTrack);
    q('#ppTrackStake',modal)?.addEventListener('input',suggestPayout);
    return modal;
  }
  function selectType(type){const modal=ensureModal(),placed=type==='placed';qa('[data-track-type]',modal).forEach(node=>{const active=node.dataset.trackType===type;node.classList.toggle('active',active);node.setAttribute('aria-checked',String(active));});q('#ppTrackPlacedFields',modal).hidden=!placed;modal.dataset.trackType=type;}
  function selectedType(){return ensureModal().dataset.trackType||'watching';}
  function populateBooks(){const select=q('#ppTrackBook');if(!select)return;const names=[...new Set(qa('.sportsbook-grid .book-card[data-book]').map(node=>node.dataset.book).filter(Boolean))];const current=currentBook();if(current&&!names.includes(current))names.unshift(current);select.innerHTML=names.length?names.map(name=>`<option value="${name.replace(/"/g,'&quot;')}">${name}</option>`).join(''):'<option value="">Sportsbook not selected</option>';if(current)select.value=current;}
  function suggestPayout(){const stake=Number(String(q('#ppTrackStake')?.value||'').replace(/[^0-9.]/g,''));const payout=q('#ppTrackPayout');if(!payout||payout.dataset.touched)return;const odds=currentCombinedOdds(),decimal=americanToDecimal(odds);if(stake>0&&decimal)payout.placeholder=`$${(stake*decimal).toFixed(2)}`;}
  function renderModalSummary(){const s=summary(),odds=currentCombinedOdds(),node=q('#ppTrackSummary');if(!node)return;const progress=s.status==='WON'?'Already settled · WINNER':s.status==='LOST'?'Already settled · Final':s.live?`${s.hit}/${legs.length} hit · ${s.live} live`:`${legs.length} legs · ${s.status==='UPCOMING'?'Upcoming':'Tracking'}`;node.innerHTML=`<strong>${currentTitle()}</strong><span>${Number.isFinite(odds)?`${odds>0?'+':''}${odds} · `:''}${progress}</span>`;}
  function openModal(){ensureModal();populateBooks();renderModalSummary();const type=existingTrack?.tracking_type||'watching';selectType(type);q('#ppTrackStake').value=existingTrack?.stake_amount??'';q('#ppTrackPayout').value=existingTrack?.potential_payout??'';if(existingTrack?.sportsbook&&q('#ppTrackBook'))q('#ppTrackBook').value=existingTrack.sportsbook;q('#ppTrackModal').hidden=false;document.body.classList.add('pp-track-open');q('#ppTrackConfirm')?.focus();}
  function closeModal(){const modal=q('#ppTrackModal');if(modal)modal.hidden=true;document.body.classList.remove('pp-track-open');}
  function moneyValue(selector){const raw=String(q(selector)?.value||'').replace(/[^0-9.]/g,'');if(!raw)return null;const n=Number(raw);return Number.isFinite(n)&&n>=0?Math.round(n*100)/100:null;}
  function updateButton(){const button=q('#saveBtn');if(!button)return;button.classList.add('pp-track-button');button.innerHTML=existingTrack?'<span>✓</span> Tracking':'<span>◎</span> Track';button.setAttribute('aria-label',existingTrack?'Update tracked parlay':'Track this parlay');}
  async function loadExisting(){const session=await validSession();if(!session?.access_token||!state.token){updateButton();return;}const user=await sessionUser(session);if(!user?.id){updateButton();return;}try{const rows=await supabase(`/rest/v1/tracked_parlays?user_id=eq.${encodeURIComponent(user.id)}&source_token=eq.${encodeURIComponent(state.token)}&select=id,tracking_type,sportsbook,stake_amount,potential_payout,status&limit=1`,{token:session.access_token});existingTrack=Array.isArray(rows)?rows[0]||null:null;}catch{}updateButton();}
  async function saveTrack(){
    const session=await validSession();if(!session?.access_token){closeModal();signIn();return;}
    const user=await sessionUser(session);if(!user?.id){closeModal();signIn();return;}
    const token=String(state.token||'').trim(),builderUrl=trackingUrl();if(!token||!builderUrl){toast('This betslip needs a ParlayPing build link before it can be tracked.');return;}
    const type=selectedType(),book=type==='placed'?(q('#ppTrackBook')?.value||currentBook()||null):(currentBook()||null),odds=currentCombinedOdds(),s=summary();
    const body={user_id:user.id,source_token:token,builder_url:builderUrl,title:currentTitle(),tracking_type:type,sportsbook:book,stake_amount:type==='placed'?moneyValue('#ppTrackStake'):null,potential_payout:type==='placed'?moneyValue('#ppTrackPayout'):null,combined_odds_american:Number.isFinite(odds)?odds:null,leg_count:legs.length,slip:snapshotSlip(book,odds),status:s.status,hit_count:s.hit,miss_count:s.miss,live_count:s.live,pending_count:s.pending,is_public:false,last_refreshed_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    const button=q('#ppTrackConfirm');if(button){button.disabled=true;button.textContent='Tracking…';}
    try{const rows=await supabase('/rest/v1/tracked_parlays?on_conflict=user_id,source_token',{method:'POST',token:session.access_token,prefer:'resolution=merge-duplicates,return=representation',body});existingTrack=Array.isArray(rows)?rows[0]||body:body;updateButton();closeModal();toast(type==='placed'?'Placed bet added to Tracking.':'Betslip added to Watching.');}
    catch(error){toast(error.message);}
    finally{if(button){button.disabled=false;button.textContent='Track Betslip';}}
  }
  async function handleTrack(){const session=await validSession();if(!session?.access_token){signIn();return;}openModal();}
  function install(){const button=q('#saveBtn');if(!button)return;const clone=button.cloneNode(true);button.replaceWith(clone);clone.addEventListener('click',handleTrack);updateButton();ensureModal();loadExisting();const profile=q('.profile-button');if(profile)profile.href='/profile';document.documentElement.dataset.ppTracking='ready';}
  install();
})();
