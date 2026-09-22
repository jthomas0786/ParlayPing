const STRIPE_API='https://api.stripe.com/v1';

function stripeSecret(){
  const key=String(process.env.STRIPE_SECRET_KEY||'').trim();
  if(!key){const error=new Error('Stripe billing is not configured.');error.status=503;throw error;}
  return key;
}

function priceIdForPlan(plan){
  const key=plan==='pro'?'STRIPE_PRO_PRICE_ID':plan==='business'?'STRIPE_BUSINESS_PRICE_ID':'';
  const id=key?String(process.env[key]||'').trim():'';
  if(!id){const error=new Error(`${plan} pricing is not configured yet.`);error.status=503;throw error;}
  return id;
}

async function stripePost(path,fields={}){
  const body=new URLSearchParams();
  for(const [key,value] of Object.entries(fields)){
    if(value===undefined||value===null||value==='')continue;
    body.set(key,String(value));
  }
  const response=await fetch(`${STRIPE_API}${path}`,{
    method:'POST',
    headers:{authorization:`Bearer ${stripeSecret()}`,'content-type':'application/x-www-form-urlencoded'},
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

module.exports={stripePost,priceIdForPlan};
