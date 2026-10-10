'use strict';

// Contract definitions for the planned paid B2B API. Prices deliberately omitted:
// published billing prices must originate from owner-approved Stripe Price IDs.
// A "use" is an admitted API operation, NOT an end-user or betslip leg.
const PUBLIC_PLAN_DEFINITIONS=Object.freeze([
  Object.freeze({id:'starter',name:'Starter',monthly_request_limit:5000,rate_limit_per_minute:30,max_api_keys:2,branding_mode:'standard',attribution:'Parlay Ping',checkout_enabled:false}),
  Object.freeze({id:'pro',name:'Pro',monthly_request_limit:25000,rate_limit_per_minute:120,max_api_keys:10,branding_mode:'standard',attribution:'Parlay Ping',checkout_enabled:false}),
  Object.freeze({id:'business',name:'Business',monthly_request_limit:250000,rate_limit_per_minute:600,max_api_keys:50,branding_mode:'custom',attribution:'Powered by Parlay Ping',checkout_enabled:false}),
  Object.freeze({id:'enterprise',name:'Enterprise',monthly_request_limit:null,rate_limit_per_minute:null,max_api_keys:null,branding_mode:'custom',attribution:'Powered by Parlay Ping',checkout_enabled:false,contact_sales:true})
]);

// NOT publicly purchasable. Creating an account cannot grant these licenses.
const PARTNER_DEFAULTS=Object.freeze({monthly_request_limit:10000,rate_limit_per_minute:120,max_api_keys:3,term_days:90,branding_mode:'standard'});
const PUBLIC_PLAN_IDS=Object.freeze(PUBLIC_PLAN_DEFINITIONS.map(p=>p.id));
const PAID_PLAN_IDS=new Set(PUBLIC_PLAN_IDS);

function asText(value){return String(value||'').trim().toLowerCase();}
function activePaidSubscription(subscription){
  return Boolean(subscription && asText(subscription.provider)==='stripe'
    && String(subscription.provider_subscription_id||'').trim()
    && asText(subscription.status)==='active'
    && PAID_PLAN_IDS.has(asText(subscription.plan_id)));
}

/**
 * This check is defense in depth after authentication at the private Supabase
 * Edge Function. It must NEVER rely on a client-supplied "plan" request field.
 * No legacy free key is commercially authorized.
 *
 * New Edge-Function contract:
 *   paid => licenseType='paid', plan, subscriptionStatus='active'
 *   partner => licenseType='partner', partnerStatus='approved', expiresAt
 *   first-party => licenseType='first_party', authorized=true
 * The Edge Function itself must check current database rows, quotas and key
 * ownership BEFORE it returns any of those claims.
 */
function verifyApiEntitlement(payload,now=Date.now()){
  const type=asText(payload?.licenseType);
  if(type==='paid'){
    if(!PAID_PLAN_IDS.has(asText(payload?.plan))||asText(payload?.subscriptionStatus)!=='active')
      return {ok:false,error:'An active paid API subscription is required.',status:403};
    return {ok:true,brandingMode:['business','enterprise'].includes(asText(payload.plan))?'custom':'standard'};
  }
  if(type==='partner'){
    const expiry=Date.parse(String(payload?.expiresAt||''));
    if(asText(payload?.partnerStatus)!=='approved'||!Number.isFinite(expiry)||expiry<=now)
      return {ok:false,error:'Partner API license expired or not approved.',status:403};
    return {ok:true,brandingMode:payload?.customBrandingApproved===true?'custom':'standard'};
  }
  if(type==='first_party'&&payload?.authorized===true)
    return {ok:true,brandingMode:'standard'};
  return {ok:false,error:'An active paid or owner-approved API license is required.',status:403};
}

function publicPlans(){return PUBLIC_PLAN_DEFINITIONS.map(plan=>({...plan}));}

module.exports={PUBLIC_PLAN_DEFINITIONS,PARTNER_DEFAULTS,PUBLIC_PLAN_IDS,publicPlans,activePaidSubscription,verifyApiEntitlement};
