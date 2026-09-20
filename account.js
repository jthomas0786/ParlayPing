const SUPABASE_URL='https://avwqjgiitxqphvmitolw.supabase.co';
const SUPABASE_KEY='sb_publishable_7mYXjjkRrQq3iRig7UYHNQ_b6EZZiJA';
const SESSION_KEY='parlayping_supabase_session_v1';

const $=id=>document.getElementById(id);
function show(id,msg){const el=$(id);el.textContent=msg;el.classList.remove('hidden');}
function hide(id){$(id).classList.add('hidden');}
function getSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{return null;}}
function setSession(v){if(v)localStorage.setItem(SESSION_KEY,JSON.stringify(v));else localStorage.removeItem(SESSION_KEY);}
function authHeaders(token){return{apikey:SUPABASE_KEY,authorization:`Bearer ${token}`,'content-type':'application/json'};}

async function supabase(path,{method='GET',body,token}={}){
  const r=await fetch(`${SUPABASE_URL}${path}`,{method,headers:token?authHeaders(token):{apikey:SUPABASE_KEY,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text();let payload={};try{payload=text?JSON.parse(text):{};}catch{payload={message:text};}
  if(!r.ok)throw new Error(payload?.msg||payload?.message||payload?.error_description||payload?.error||`Request failed (${r.status})`);
  return payload;
}

async function refreshSession(session){
  if(!session?.refresh_token)return null;
  try{
    const fresh=await supabase('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});
    setSession(fresh);return fresh;
  }catch{setSession(null);return null;}
}

async function validSession(){
  let s=getSession();if(!s)return null;
  const exp=Number(s.expires_at||0)*1000;
  if(!exp||exp-Date.now()<60000)s=await refreshSession(s);
  return s;
}

async function api(path,{method='GET',body}={}){
  const s=await validSession();if(!s?.access_token)throw new Error('Please sign in again.');
  const r=await fetch(path,{method,headers:{authorization:`Bearer ${s.access_token}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(payload?.error||`Request failed (${r.status})`);
  return payload;
}

async function loadPlans(){
  try{
    const r=await fetch('/api/plans',{headers:{accept:'application/json'}});
    const payload=await r.json().catch(()=>({}));
    return r.ok&&Array.isArray(payload?.plans)?payload.plans:[];
  }catch{return[];}
}

function consumeHashSession(){
  if(!location.hash.includes('access_token='))return;
  const p=new URLSearchParams(location.hash.slice(1));
  const access_token=p.get('access_token'),refresh_token=p.get('refresh_token'),expires_in=Number(p.get('expires_in')||3600);
  if(access_token&&refresh_token){setSession({access_token,refresh_token,expires_at:Math.floor(Date.now()/1000)+expires_in});history.replaceState({},'',location.pathname+location.search);}
}

function ensureBillingCard(){
  if($('billingCard'))return;
  const card=document.createElement('div');
  card.id='billingCard';card.className='card full';
  card.innerHTML='<div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2 style="margin-bottom:5px">Billing</h2><p id="billingSummary" class="muted">Free plan</p></div><span id="billingBadge" class="pill">FREE</span></div><div id="billingFreeActions" class="row"><button id="upgradeProBtn" type="button">Upgrade to Pro</button><button id="upgradeBusinessBtn" type="button" class="secondary">Upgrade to Business</button></div><div id="billingPaidActions" class="hidden"><button id="manageBillingBtn" type="button">Manage billing</button></div><div id="billingStatus" class="status hidden"></div>';
  const grid=document.querySelector('#console .grid');
  const full=[...grid.querySelectorAll(':scope > .card.full')];
  const quickStart=full[full.length-1];
  if(quickStart)grid.insertBefore(card,quickStart);else grid.appendChild(card);
  $('upgradeProBtn').addEventListener('click',()=>startCheckout('pro'));
  $('upgradeBusinessBtn').addEventListener('click',()=>startCheckout('business'));
  $('manageBillingBtn').addEventListener('click',manageBilling);
}

function planPrice(plans,id){
  const row=plans.find(p=>p.id===id);const cents=Number(row?.price_monthly_cents);
  return Number.isFinite(cents)&&cents>0?`$${(cents/100).toFixed(cents%100?2:0)}/mo`:null;
}

function renderBilling(data,plans){
  ensureBillingCard();
  const usage=data.usage||{};const sub=data.subscription||null;
  const plan=String(sub?.plan_id||usage.plan||'free').toLowerCase();
  const paid=sub?.provider==='stripe'&&Boolean(sub?.provider_subscription_id)&&['active','trialing','past_due','unpaid'].includes(String(sub?.status||''));
  $('billingBadge').textContent=plan.toUpperCase();
  if(paid){
    $('billingFreeActions').classList.add('hidden');$('billingPaidActions').classList.remove('hidden');
    let text=`${plan==='business'?'Business':'Pro'} subscription · ${String(sub.status||'active').replaceAll('_',' ')}`;
    if(sub.cancel_at_period_end){const end=sub.current_period_end?new Date(sub.current_period_end).toLocaleDateString():null;text+=end?` · cancels ${end}`:' · cancels at period end';}
    $('billingSummary').textContent=text;
  }else{
    $('billingPaidActions').classList.add('hidden');$('billingFreeActions').classList.remove('hidden');
    const pro=planPrice(plans,'pro'),business=planPrice(plans,'business');
    $('upgradeProBtn').textContent=pro?`Upgrade to Pro — ${pro}`:'Upgrade to Pro';
    $('upgradeBusinessBtn').textContent=business?`Upgrade to Business — ${business}`:'Upgrade to Business';
    $('billingSummary').textContent='Free plan · upgrade when you need more API capacity.';
  }
}

async function startCheckout(plan){
  hide('billingStatus');
  const btn=plan==='pro'?$('upgradeProBtn'):$('upgradeBusinessBtn');
  const old=btn.textContent;btn.disabled=true;btn.textContent='Opening checkout…';
  try{const result=await api('/api/billing-checkout',{method:'POST',body:{plan}});if(!result?.url)throw new Error('Stripe checkout URL was not returned.');location.assign(result.url);}catch(error){btn.disabled=false;btn.textContent=old;show('billingStatus',error.message);}
}

async function manageBilling(){
  hide('billingStatus');const btn=$('manageBillingBtn');btn.disabled=true;const old=btn.textContent;btn.textContent='Opening billing…';
  try{const result=await api('/api/billing-portal',{method:'POST'});if(!result?.url)throw new Error('Stripe billing portal URL was not returned.');location.assign(result.url);}catch(error){btn.disabled=false;btn.textContent=old;show('billingStatus',error.message);}
}

async function loadAccount(){
  try{
    const [data,plans]=await Promise.all([api('/api/account'),loadPlans()]);
    $('authCard').classList.add('hidden');$('console').classList.remove('hidden');
    $('accountEmail').textContent=data.user?.email||'';
    $('displayName').value=data.profile?.display_name||'';
    $('xUsername').value=data.profile?.x_username||'';
    $('companyName').value=data.profile?.company_name||data.profile?.developer_name||'';
    $('websiteUrl').value=data.profile?.website_url||'';
    const usage=data.usage||{};$('planName').textContent=String(usage.plan||'free').toUpperCase();$('usageUsed').textContent=usage.monthlyUsed??0;$('usageLimit').textContent=usage.monthlyLimit??0;$('minuteLimit').textContent=usage.rateLimitPerMinute??0;$('keyLimit').textContent=usage.maxApiKeys??0;
    renderKeys(data.apiKeys||[]);renderBilling(data,plans);
    const billing=new URLSearchParams(location.search).get('billing');
    if(billing==='success')show('consoleStatus','Checkout completed. Stripe is syncing your subscription; your plan will update automatically.');
    if(billing==='cancelled')show('consoleStatus','Checkout cancelled. No billing change was made.');
  }catch(error){setSession(null);$('console').classList.add('hidden');$('authCard').classList.remove('hidden');show('authStatus',error.message);}
}

function renderKeys(keys){
  const list=$('keysList');list.innerHTML='';
  if(!keys.length){const d=document.createElement('div');d.className='muted';d.textContent='No API keys yet.';list.appendChild(d);return;}
  for(const key of keys){
    const item=document.createElement('div');item.className='item row';item.style.justifyContent='space-between';
    const info=document.createElement('div');const title=document.createElement('strong');title.textContent=key.name;const meta=document.createElement('div');meta.className='muted';meta.textContent=`${key.key_prefix}… · ${key.revoked_at?'revoked':key.last_used_at?'last used '+new Date(key.last_used_at).toLocaleString():'never used'}`;info.append(title,meta);
    const b=document.createElement('button');b.className='danger';b.textContent='Revoke';b.disabled=Boolean(key.revoked_at);b.addEventListener('click',()=>revokeKey(key.id));
    item.append(info,b);list.appendChild(item);
  }
}

async function revokeKey(id){if(!confirm('Revoke this API key? This cannot be undone.'))return;try{await api('/api/api-keys',{method:'DELETE',body:{id}});await loadAccount();}catch(e){show('consoleStatus',e.message);}}

$('signInForm').addEventListener('submit',async e=>{e.preventDefault();hide('authStatus');try{const data=await supabase('/auth/v1/token?grant_type=password',{method:'POST',body:{email:$('loginEmail').value.trim(),password:$('loginPassword').value}});setSession(data);await loadAccount();}catch(err){show('authStatus',err.message);}});
$('signUpForm').addEventListener('submit',async e=>{e.preventDefault();hide('authStatus');try{const redirect=encodeURIComponent('https://parlayping.net/account');const data=await supabase(`/auth/v1/signup?redirect_to=${redirect}`,{method:'POST',body:{email:$('signupEmail').value.trim(),password:$('signupPassword').value,data:{name:$('signupName').value.trim()}}});if(data.access_token){setSession(data);await loadAccount();}else show('authStatus','Account created. Check your email to confirm your address, then return here to sign in.');}catch(err){show('authStatus',err.message);}});
$('signOutBtn').addEventListener('click',async()=>{const s=getSession();try{if(s?.access_token)await supabase('/auth/v1/logout',{method:'POST',token:s.access_token});}catch{}setSession(null);location.reload();});
$('profileForm').addEventListener('submit',async e=>{e.preventDefault();hide('consoleStatus');try{await api('/api/account',{method:'PATCH',body:{display_name:$('displayName').value,x_username:$('xUsername').value,company_name:$('companyName').value,website_url:$('websiteUrl').value}});show('consoleStatus','Profile saved.');await loadAccount();}catch(err){show('consoleStatus',err.message);}});
$('keyForm').addEventListener('submit',async e=>{e.preventDefault();hide('consoleStatus');hide('newKeyBox');try{const data=await api('/api/api-keys',{method:'POST',body:{name:$('keyName').value.trim()}});$('newKey').textContent=data.key?.key||'';$('newKeyBox').classList.remove('hidden');$('keyName').value='';await loadAccount();}catch(err){show('consoleStatus',err.message);}});

consumeHashSession();validSession().then(s=>{if(s?.access_token)loadAccount();});
