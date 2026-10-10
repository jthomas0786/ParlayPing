const test=require('node:test');
const assert=require('node:assert/strict');
const {PUBLIC_PLAN_IDS,PARTNER_DEFAULTS,publicPlans,activePaidSubscription,verifyApiEntitlement}=require('../server/api/lib/api-plans');

test('public API tiers are paid only; partner is not in public catalog',()=>{
  assert.deepEqual(PUBLIC_PLAN_IDS,['starter','pro','business','enterprise']);
  const plans=publicPlans();
  assert.equal(plans.length,4);
  assert.ok(plans.every(p=>p.id!=='free'&&p.id!=='partner'&&p.checkout_enabled===false));
  assert.deepEqual(plans.slice(0,3).map(p=>p.monthly_request_limit),[5000,25000,250000]);
  assert.deepEqual(plans.map(p=>p.branding_mode),['standard','standard','custom','custom']);
  assert.equal(PARTNER_DEFAULTS.monthly_request_limit,10000);
  assert.equal(PARTNER_DEFAULTS.term_days,90);
});

test('only verified active Stripe subscriber qualifies as paid developer',()=>{
  const valid={provider:'stripe',provider_subscription_id:'sub_mock',status:'active',plan_id:'pro'};
  assert.equal(activePaidSubscription(valid),true);
  for(const patch of [{status:'trialing'},{plan_id:'free'},{provider:'manual'},{provider_subscription_id:null},{status:'canceled'}])
    assert.equal(activePaidSubscription({...valid,...patch}),false);
});

test('paid API request requires verified license metadata; old Free does not pass',()=>{
  const at=Date.UTC(2026,9,10);
  const denied=[
    {},{plan:'free'},{plan:'pro'},{licenseType:'paid',plan:'free',subscriptionStatus:'active'},
    {licenseType:'paid',plan:'pro',subscriptionStatus:'trialing'},
    {licenseType:'partner',partnerStatus:'pending',expiresAt:new Date(at+86400000).toISOString()},
    {licenseType:'partner',partnerStatus:'approved',expiresAt:new Date(at-1).toISOString()},
    {licenseType:'first_party',authorized:false}
  ];
  for(const p of denied)assert.equal(verifyApiEntitlement(p,at).ok,false,JSON.stringify(p));
  assert.equal(verifyApiEntitlement({licenseType:'paid',plan:'pro',subscriptionStatus:'active'},at).brandingMode,'standard');
  assert.equal(verifyApiEntitlement({licenseType:'paid',plan:'business',subscriptionStatus:'active'},at).brandingMode,'custom');
  assert.equal(verifyApiEntitlement({licenseType:'partner',partnerStatus:'approved',expiresAt:new Date(at+86400000).toISOString()},at).brandingMode,'standard');
  assert.equal(verifyApiEntitlement({licenseType:'partner',partnerStatus:'approved',customBrandingApproved:true,expiresAt:new Date(at+86400000).toISOString()},at).brandingMode,'custom');
  assert.equal(verifyApiEntitlement({licenseType:'first_party',authorized:true},at).ok,true);
});

test('public plan response objects cannot mutate immutable catalog',()=>{
  const x=publicPlans();x[0].name='Changed';assert.equal(publicPlans()[0].name,'Starter');
});
