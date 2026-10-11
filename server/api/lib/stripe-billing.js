const STRIPE_API='https://api.stripe.com/v1';

// ParlayPing billing is a SANDBOX-only integration until the private
// Supabase subscription webhook and paid-entitlement migration are verified.
// No production checkout is allowed simply by supplying a live Stripe key.
function assertSandboxBillingReady(){
  if(String(process.env.PARLAYPING_BILLING_SANDBOX_ENABLED||'').toLowerCase()!=='true'){
    const error=new Error('Parlay Ping developer API checkout is not enabled yet.');error.status=503;throw error;
  }
  const key=String(process.env.STRIPE_SECRET_KEY||'').trim();
  if(!/^sk_test_[A-Za-z0-9]+$/.test(key)){
    const error=new Error('Sandbox checkout requires a Stripe test-mode secret key.');error.status=503;throw error;
  }
  return key;
}

const PLAN_PRICE_ENVS=Object.freeze({
  starter:'STRIPE_STARTER_PRICE_ID',
  pro:'STRIPE_PRO_PRICE_ID',
  business:'STRIPE_BUSINESS_PRICE_ID',
});

function priceIdForPlan(plan){
  const envName=PLAN_PRICE_ENVS[String(plan||'').toLowerCase()];
  if(!envName){const error=new Error('Unknown paid API plan.');error.status=400;throw error;}
  const id=String(process.env[envName]||'').trim();
  if(!/^price_[A-Za-z0-9]+$/.test(id)){
    const error=new Error(`${plan} sandbox pricing is not configured yet.`);error.status=503;throw error;
  }
  return id;
}

function sandboxPortalConfigId(){
  const value=String(process.env.STRIPE_SANDBOX_PORTAL_CONFIG_ID||'').trim();
  if(!/^bpc_[A-Za-z0-9]+$/.test(value)){
    const error=new Error('Sandbox Billing Portal configuration is missing.');
    error.status=503;throw error;
  }
  return value;
}

async function stripePost(path,fields={}){
  const key=assertSandboxBillingReady();
  if(!['/checkout/sessions','/billing_portal/sessions'].includes(path)){
    const error=new Error('Unsupported Stripe billing operation.');error.status=400;throw error;
  }
  const body=new URLSearchParams();
  for(const [field,value] of Object.entries(fields)){
    if(value===undefined||value===null||value==='')continue;
    body.set(field,String(value));
  }
  const response=await fetch(`${STRIPE_API}${path}`,{
    method:'POST',
    headers:{authorization:`Bearer ${key}`,'content-type':'application/x-www-form-urlencoded'},
    body,
    signal:AbortSignal.timeout(12000),
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=new Error(payload?.error?.message||`Stripe request failed (${response.status})`);
    error.status=response.status;
    error.stripe=payload?.error||null;
    throw error;
  }
  return payload;
}

module.exports={stripePost,priceIdForPlan,assertSandboxBillingReady,sandboxPortalConfigId,PLAN_PRICE_ENVS};
