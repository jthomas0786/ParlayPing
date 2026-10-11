(()=>{
  // A first-party TSO member is not a separate Parlay Ping developer login.
  if(window.PP_TSO_AUTH?.enabled)return;
  const SESSION_KEY='parlayping_supabase_session_v1';
  const SUPABASE_URL='https://avwqjgiitxqphvmitolw.supabase.co';
  const SUPABASE_KEY='sb_publishable_7mYXjjkRrQq3iRig7UYHNQ_b6EZZiJA';
  const $=id=>document.getElementById(id);
  let accountData=null;
  let checkoutInFlight=false,portalInFlight=false;

  function getSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{return null;}}
  function setSession(value){try{if(value)localStorage.setItem(SESSION_KEY,JSON.stringify(value));else localStorage.removeItem(SESSION_KEY);}catch{}}
  async function supabase(path,{method='GET',body}={}){const response=await fetch(`${SUPABASE_URL}${path}`,{method,headers:{apikey:SUPABASE_KEY,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload?.message||payload?.error_description||payload?.error||`Request failed (${response.status})`);return payload;}
  async function validSession(){let session=getSession();if(!session)return null;const exp=Number(session.expires_at||0)*1000;if(exp&&exp-Date.now()>=60000)return session;if(!session.refresh_token)return session;try{const fresh=await supabase('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});setSession(fresh);return fresh;}catch{return session;}}
  async function api(path,{method='GET',body}={}){const session=await validSession();if(!session?.access_token)throw new Error('Sign in required.');const response=await fetch(path,{method,headers:{authorization:`Bearer ${session.access_token}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload?.error||`Request failed (${response.status})`);return payload;}
  function showStatus(message,error=false){const node=$('devStatus');if(!node)return;node.textContent=message;node.hidden=false;node.classList.toggle('error',error);}
  function clearStatus(){const node=$('devStatus');if(node){node.hidden=true;node.classList.remove('error');}}
  function moneyPlan(data){const sub=data?.subscription,usage=data?.usage||{};if(sub?.provider==='stripe'&&sub?.provider_subscription_id&&['active','trialing','past_due','unpaid'].includes(String(sub.status||'')))return String(sub.plan_id||usage.plan||'free').toLowerCase();return String(usage.plan||'free').toLowerCase();}
  function renderKeys(keys){const list=$('devKeysList');if(!list)return;list.innerHTML='';if(!keys?.length){list.innerHTML='<div class="dev-key-row"><div><strong>No API keys yet</strong><span>Create one when you need external API access.</span></div></div>';return;}for(const key of keys){const row=document.createElement('div');row.className='dev-key-row';const info=document.createElement('div');const title=document.createElement('strong');title.textContent=key.name||'API key';const meta=document.createElement('span');meta.textContent=`${key.key_prefix||'pp_live_'}… · ${key.revoked_at?'revoked':key.last_used_at?'last used '+new Date(key.last_used_at).toLocaleString():'never used'}`;info.append(title,meta);const button=document.createElement('button');button.type='button';button.textContent=key.revoked_at?'Revoked':'Revoke';button.disabled=Boolean(key.revoked_at);button.addEventListener('click',()=>revokeKey(key.id));row.append(info,button);list.append(row);}}
  function friendlyPeriodEnd(value){
    if(!value)return '';
    const date=new Date(value);
    return Number.isFinite(date.getTime())?date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'';
  }

  function renderDev(data){
    accountData=data;
    const usage=data.usage||{},sub=data.subscription||null;
    const activePlan=String(usage.plan||'none').toLowerCase();
    const plan={starter:'Starter',pro:'Pro',business:'Business',free:'Internal',none:'Not subscribed'}[activePlan]||'Not subscribed';
    $('devPlanName').textContent=plan.toUpperCase();
    $('devUsageUsed').textContent=Number(usage.monthlyUsed||0).toLocaleString();
    $('devUsageLimit').textContent=Number(usage.monthlyLimit||0).toLocaleString();
    $('devMinuteLimit').textContent=Number(usage.rateLimitPerMinute||0).toLocaleString();
    $('devKeyLimit').textContent=Number(usage.maxApiKeys||0).toLocaleString();
    renderKeys(data.apiKeys||[]);
    const status=String(sub?.status||'').toLowerCase();
    const manageExisting=Boolean(sub?.provider==='stripe'&&sub?.provider_subscription_id&&['active','trialing','past_due','unpaid'].includes(status));
    const allowed=Boolean(data.sandboxCheckoutAllowed);
    const badge=$('devAccessBadge');if(badge)badge.textContent=data.isOwner?'OWNER · SANDBOX':'SANDBOX PREVIEW';
    const paidLabel=({starter:'Starter',pro:'Pro',business:'Business'}[String(sub?.plan_id||'').toLowerCase()]||'Developer');
    const periodDate=friendlyPeriodEnd(sub?.current_period_end);
    let billingSummary=activePlan==='free'?'Internal first-party API access':'No active Developer API subscription';
    if(manageExisting){
      if(sub.cancel_at_period_end)billingSummary=`${paidLabel} · cancellation scheduled${periodDate?' for '+periodDate+' (access until then)':''}`;
      else if(status==='past_due'||status==='unpaid')billingSummary=`${paidLabel} · payment needs attention. Open Manage billing to update payment details.`;
      else billingSummary=`${paidLabel} · ${status.replaceAll('_',' ')}${periodDate?' · next billing '+periodDate:''}`;
    }
    $('devBillingSummary').textContent=billingSummary;
    $('devBillingFreeActions').hidden=manageExisting;
    $('devBillingPaidActions').hidden=!manageExisting;
    const note=$('devSandboxNote');if(note)note.textContent=allowed?'Stripe TEST MODE only · test cards only · no real charges.':'Developer API subscriptions are in testing. No live payments are available.';
    const chosen=new URLSearchParams(location.search).get('plan')?.toLowerCase();
    const requested={starter:'Starter · $20/month',pro:'Pro · $70/month',business:'Business · $120/month'}[chosen];
    const hint=$('devPlanHint');if(hint)hint.textContent=allowed?(requested?`Selected: ${requested}. Choose a plan to open sandbox checkout.`:'Select a plan below to test Stripe sandbox checkout.'):(requested?`Selected: ${requested}. Public paid enrollment is not yet open; no payment will be collected.`:'Approved subscription prices. Sandbox checkout is limited to authorized testers until live billing launches.');
    for(const id of ['devUpgradeStarter','devUpgradePro','devUpgradeBusiness']){const button=$(id);if(button){button.disabled=!allowed;button.title=allowed?'Open Stripe test-mode checkout':'Sandbox checkout is restricted to approved testers';}}
    if($('devManageBilling'))$('devManageBilling').disabled=!allowed;
    const canUseKey=['starter','pro','business','free'].includes(activePlan);
    const name=$('devKeyName'),submit=$('devKeyForm')?.querySelector('button[type="submit"]');
    if(name)name.disabled=!canUseKey;
    if(submit)submit.disabled=!canUseKey;
    const keyHint=$('devKeyHint');if(keyHint)keyHint.textContent=canUseKey?'API keys are private to this account. Revoke an exposed key immediately.':'An active paid plan is required to create keys. Sandbox-only subscriptions are not public offers.';
    const billing=new URLSearchParams(location.search).get('billing');
    if(billing==='success')showStatus(verifiedPaidEntitlement(data)?'Stripe TEST MODE subscription verified. Your paid Developer API allowance is now active.':'Returned from Stripe TEST MODE Checkout. Waiting for the signed subscription webhook before granting API access.');
    if(billing==='cancelled')showStatus('Checkout canceled. No plan was activated.');
  }

  function verifiedPaidEntitlement(data){
    const sub=data?.subscription;
    return sub?.provider==='stripe'&&['active','trialing'].includes(String(sub.status||''))&&['starter','pro','business'].includes(String(data?.usage?.plan||'').toLowerCase());
  }
  async function syncReturnedCheckout(){
    // A Checkout return URL is not proof of payment. Only verified webhook-backed
    // Supabase subscription and usage data can unlock keys and quota.
    if(verifiedPaidEntitlement(accountData))return;
    for(const delay of [1500,2500,4000]){
      await new Promise(resolve=>setTimeout(resolve,delay));
      try{
        const current=await api('/api/account');
        if(!current?.isDeveloper)break;
        renderDev(current);
        if(verifiedPaidEntitlement(current)){
          showStatus('Stripe TEST MODE subscription verified. Your Developer API allowance is now active.');
          return;
        }
      }catch{/* Keep all billing entitlements server-authoritative. */}
    }
    showStatus('Stripe test Checkout returned, but subscription activation is not confirmed yet. Refresh the dashboard after Stripe finishes processing.',true);
  }
  function stripeHostedUrl(value,host){
    try{const url=new URL(String(value||''));return url.protocol==='https:'&&url.hostname===host?url.href:null;}catch{return null;}
  }

  function setTabUrl(tab){const url=new URL(location.href);if(tab==='tracking')url.searchParams.delete('tab');else url.searchParams.set('tab',tab);url.searchParams.delete('billing');url.searchParams.delete('session_id');history.replaceState({},'',url.pathname+(url.searchParams.toString()?`?${url.searchParams}`:''));}
  function activateDev(){if($('devTab')?.hidden)return;$('trackingSection').hidden=true;$('communitySection').hidden=true;$('devSection').hidden=false;document.querySelectorAll('[data-profile-tab]').forEach(node=>node.classList.toggle('active',node.id==='devTab'));setTabUrl('dev');if(!accountData)loadDeveloper().catch(error=>showStatus(error.message,true));}
  function wireTabs(){document.querySelectorAll('[data-profile-tab]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.profileTab==='dev'){activateDev();return;}$('devSection').hidden=true;setTabUrl(button.dataset.profileTab==='community'?'community':'tracking');}));}
  function applyRequestedTab(){const requested=new URLSearchParams(location.search).get('tab');if(requested==='dev'&&!$('devTab')?.hidden){activateDev();return;}if(requested==='community')document.querySelector('[data-profile-tab="community"]')?.click();}

  async function loadDeveloper(){const data=await api('/api/account');const devTab=$('devTab');if(!data.isDeveloper){if(devTab)devTab.hidden=true;return false;}if(devTab)devTab.hidden=false;renderDev(data);return true;}
  async function refreshDeveloper(){const allowed=await loadDeveloper();if(!allowed)throw new Error('Sign in to your ParlayPing account first.');}
  async function revokeKey(id){if(!id||!confirm('Revoke this API key? This cannot be undone.'))return;clearStatus();try{await api('/api/api-keys',{method:'DELETE',body:{id}});showStatus('API key revoked.');await refreshDeveloper();}catch(error){showStatus(error.message,true);}}
  async function createKey(event){event.preventDefault();clearStatus();const name=String($('devKeyName')?.value||'').trim();if(!name)return;const button=event.submitter,old=button?.textContent;if(button){button.disabled=true;button.textContent='Creating…';}try{const result=await api('/api/api-keys',{method:'POST',body:{name}});$('devNewKey').textContent=result.key?.key||'';$('devNewKeyBox').hidden=false;$('devKeyName').value='';showStatus('API key created. Copy it now; it will not be shown again.');await refreshDeveloper();}catch(error){showStatus(error.message,true);}finally{if(button){button.disabled=false;button.textContent=old;}}}
  async function checkout(plan){
    if(checkoutInFlight)return;
    clearStatus();
    if(!accountData?.sandboxCheckoutAllowed){showStatus('Sandbox checkout requires an approved test account. Live purchases are not open yet.',true);return;}
    checkoutInFlight=true;
    for(const id of ['devUpgradeStarter','devUpgradePro','devUpgradeBusiness'])if($(id))$(id).disabled=true;
    try{
      const result=await api('/api/billing-checkout',{method:'POST',body:{plan}});
      const url=stripeHostedUrl(result?.url,'checkout.stripe.com');
      if(!url)throw new Error('Stripe Checkout did not return a verified hosted URL.');
      location.assign(url);
    }catch(error){
      checkoutInFlight=false;
      for(const id of ['devUpgradeStarter','devUpgradePro','devUpgradeBusiness'])if($(id))$(id).disabled=!accountData?.sandboxCheckoutAllowed;
      showStatus(error.message,true);
    }
  }
  async function portal(){
    if(portalInFlight)return;
    clearStatus();portalInFlight=true;
    const button=$('devManageBilling');if(button)button.disabled=true;
    try{
      const result=await api('/api/billing-portal',{method:'POST'});
      const url=stripeHostedUrl(result?.url,'billing.stripe.com');
      if(!url)throw new Error('Stripe Billing Portal did not return a verified hosted URL.');
      location.assign(url);
    }catch(error){
      portalInFlight=false;
      if(button)button.disabled=!accountData?.sandboxCheckoutAllowed;
      showStatus(error.message,true);
    }
  }

  function init(){
    const checkoutReturned=new URLSearchParams(location.search).get('billing')==='success';
    wireTabs();
    $('devKeyForm')?.addEventListener('submit',createKey);
    $('devUpgradeStarter')?.addEventListener('click',()=>checkout('starter'));
    $('devUpgradePro')?.addEventListener('click',()=>checkout('pro'));
    $('devUpgradeBusiness')?.addEventListener('click',()=>checkout('business'));
    $('devManageBilling')?.addEventListener('click',portal);
    loadDeveloper().then(()=>{applyRequestedTab();if(checkoutReturned)syncReturnedCheckout();}).catch(()=>{const tab=$('devTab');if(tab)tab.hidden=true;applyRequestedTab();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
