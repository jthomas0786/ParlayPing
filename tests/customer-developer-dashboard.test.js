const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const CLIENT_ID='11111111-1111-4111-8111-111111111111';
const OWNER_ID='a08636ec-508e-457d-8e5a-400a0ec39729';
const authPath=require.resolve('../server/api/lib/supabase-account');
const original= require.cache[authPath];
const originalFetch=global.fetch;
const keys=['STRIPE_SECRET_KEY','PARLAYPING_BILLING_SANDBOX_ENABLED','PARLAYPING_BILLING_TESTER_USER_IDS','STRIPE_PRO_PRICE_ID','STRIPE_SANDBOX_PORTAL_CONFIG_ID'];
const originalVars=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
let user={id:CLIENT_ID,email:'developer@example.invalid'}, sub=null, usage={plan:'none',monthlyLimit:0,rateLimitPerMinute:0,maxApiKeys:0}, seenPaths=[],actions=[],responseForEdge={};
require.cache[authPath]={id:authPath,filename:authPath,loaded:true,exports:{
  requireUser:async()=>({token:'Bearer own-session',user}),
  supabaseFetch:async(p)=>{
    seenPaths.push(p);
    if(p.includes('/profiles?'))return [{display_name:'QA Developer'}];
    if(p.includes('/subscriptions?'))return sub?[sub]:[];
    return [];
  },
  accountEdge:async(token,body)=>{
    assert.equal(token,'Bearer own-session');
    actions.push(body.action);
    if(body.action==='bootstrap')return {usage,keys:[{id:'testkey',name:'Owned Key',key_prefix:'pp_live_'}]};
    if(body.action==='listKeys')return {keys:[{id:'testkey',name:'Owned Key'}]};
    if(body.action==='createKey')return responseForEdge;
    if(body.action==='revokeKey')return {revoked:true};
    throw Error('Unknown mocked action');
  }
}};
const router=require('../server/api/account-router');
function res(){return{statusCode:200,headers:{},body:null,setHeader(k,v){this.headers[k]=v},status(v){this.statusCode=v;return this},json(v){this.body=v;return this}}}
function req(route,method='GET',body){return{method,query:{route},body,headers:{}}}
test.after(()=>{
  global.fetch=originalFetch;
  if(original)require.cache[authPath]=original;else delete require.cache[authPath];
  for(const[k,v]of Object.entries(originalVars))if(v===undefined)delete process.env[k];else process.env[k]=v;
});
test('every authenticated customer gets only their own developer account and usage',async()=>{
  seenPaths=[];actions=[];sub=null;
  const out=res();await router(req('account'),out);
  assert.equal(out.statusCode,200);
  assert.equal(out.body.isDeveloper,true);
  assert.equal(out.body.isOwner,false);
  assert.equal(out.body.sandboxCheckoutAllowed,false);
  assert.equal(out.body.user.id,CLIENT_ID);
  assert.equal(out.body.subscription,null);
  assert.equal(out.body.usage.plan,'none');
  assert.equal(out.body.apiKeys.length,1);
  assert.deepEqual(actions,['bootstrap']);
  assert(seenPaths.some(p=>p.includes('id=eq.'+CLIENT_ID)));
  assert(seenPaths.some(p=>p.includes('user_id=eq.'+CLIENT_ID)));
  assert(seenPaths.every(p=>!p.includes(OWNER_ID)));
});
test('non-owner customers can read their own keys and issue one after a licensed subscription',async()=>{
  sub={plan_id:'pro',provider:'stripe',provider_subscription_id:'sub_test_pro',status:'trialing'};
  usage={plan:'pro',monthlyLimit:20000,rateLimitPerMinute:120,maxApiKeys:10};
  responseForEdge={ok:true,key:{name:'Production Integration',key:'pp_live_'+'f'.repeat(48)}};
  const list=res();await router(req('api-keys','GET'),list);
  assert.equal(list.statusCode,200);assert.equal(list.body.keys[0].name,'Owned Key');
  const create=res();await router(req('api-keys','POST',{name:'Production Integration'}),create);
  assert.equal(create.statusCode,201);
  assert.equal(create.body.key.name,'Production Integration');
});
test('public customers cannot use a Stripe sandbox purchase to unlock production API',async()=>{
  sub=null;
  process.env.PARLAYPING_BILLING_SANDBOX_ENABLED='true';
  process.env.STRIPE_SECRET_KEY='sk_test_UnitTestKey123456';
  delete process.env.PARLAYPING_BILLING_TESTER_USER_IDS;
  global.fetch=()=>{throw Error('Stripe must not be reached for public user')};
  for(const route of ['billing-checkout','billing-portal']){
    const out=res();await router(req(route,'POST',{plan:'starter'}),out);
    assert.equal(out.statusCode,403);
    assert.match(out.body.error,/limited to approved test accounts/i);
  }
  const state=res();await router(req('account'),state);
  assert.equal(state.body.sandboxCheckoutAllowed,false);
});
test('explicitly approved sandbox test customer creates their own subscription session',async()=>{
  process.env.PARLAYPING_BILLING_TESTER_USER_IDS=CLIENT_ID;
  process.env.PARLAYPING_BILLING_SANDBOX_ENABLED='true';
  process.env.STRIPE_SECRET_KEY='sk_test_UnitTestKey123456';
  process.env.STRIPE_PRO_PRICE_ID='price_1UPC1CLJU3n7oe0PnBVQIZd0';
  sub=null;
  const observed=[];
  global.fetch=async(url,opts)=>{
    observed.push({url,form:Object.fromEntries(new URLSearchParams(opts.body))});
    return{ok:true,status:200,json:async()=>({id:'cs_test_customer',url:'https://checkout.stripe.com/c/pay/cs_test_customer'})};
  };
  const out=res();await router(req('billing-checkout','POST',{plan:'pro',customer:'cus_forged'}),out);
  assert.equal(out.statusCode,200);
  assert.equal(observed[0].form['metadata[user_id]'],CLIENT_ID);
  assert.equal(observed[0].form['subscription_data[metadata][user_id]'],CLIENT_ID);
  assert.equal(observed[0].form.client_reference_id,CLIENT_ID);
  assert.equal(observed[0].form['line_items[0][price]'],'price_1UPC1CLJU3n7oe0PnBVQIZd0');
  assert.equal(observed[0].form.customer_email,'developer@example.invalid');
  assert.equal(observed[0].form.customer,undefined);
  const state=res();await router(req('account'),state);
  assert.equal(state.body.sandboxCheckoutAllowed,true);
});
test('owner identity remains distinct from ordinary paid developer access',()=>{
  assert.equal(router.isDeveloperUser({id:CLIENT_ID}),false);
  assert.equal(router.isDeveloperUser({id:OWNER_ID}),true);
  process.env.PARLAYPING_BILLING_TESTER_USER_IDS='';
  assert.equal(router.isSandboxTester({id:CLIENT_ID}),false);
  assert.equal(router.isSandboxTester({id:OWNER_ID}),true);
});
test('public developers page promotes approved plans with no free entitlement',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../developers.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../developers.js'),'utf8');
  const profile=fs.readFileSync(path.join(__dirname,'../profile.html'),'utf8');
  for(const price of ['$20','$70','$120'])assert(html.includes(price));
  for(const plan of ['starter','pro','business'])assert.match(html,new RegExp('data-api-plan="'+plan+'"'));
  assert.match(html,/Public paid checkout is not open yet/);
  assert.match(js,/account\.searchParams\.set\('next'/);
  assert.match(profile,/Developer dashboard/);
  assert.match(profile,/devKeyHint/);
});

test('approved tester with automatic internal/free signup can enter sandbox checkout, unlike protected owner',async()=>{
  user={id:CLIENT_ID,email:'developer@example.invalid'};
  sub={plan_id:'free',provider:'internal',status:'active',provider_subscription_id:null};
  process.env.PARLAYPING_BILLING_TESTER_USER_IDS=CLIENT_ID;
  process.env.PARLAYPING_BILLING_SANDBOX_ENABLED='true';
  process.env.STRIPE_SECRET_KEY='sk_test_UnitTestKey123456';
  process.env.STRIPE_PRO_PRICE_ID='price_1UPC1CLJU3n7oe0PnBVQIZd0';
  const calls=[];
  global.fetch=async(url,opts)=>{
    calls.push({url,form:Object.fromEntries(new URLSearchParams(opts.body))});
    return {ok:true,status:200,json:async()=>({id:'cs_test_signup',url:'https://checkout.stripe.com/c/pay/cs_test_signup'})};
  };
  const clientState=res();await router(req('account'),clientState);
  assert.equal(clientState.statusCode,200);
  assert.equal(clientState.body.sandboxCheckoutAllowed,true);
  const checkout=res();await router(req('billing-checkout','POST',{plan:'pro'}),checkout);
  assert.equal(checkout.statusCode,200);
  assert.equal(calls[0].form['metadata[user_id]'],CLIENT_ID);
  assert.equal(calls[0].form.customer_email,'developer@example.invalid');

  user={id:OWNER_ID,email:'owner@example.invalid'};
  const ownerState=res();await router(req('account'),ownerState);
  assert.equal(ownerState.body.sandboxCheckoutAllowed,false);
  const blocked=res();await router(req('billing-checkout','POST',{plan:'pro'}),blocked);
  assert.equal(blocked.statusCode,409);
  assert.match(blocked.body.error,/protected first-party API access/i);
  assert.equal(calls.length,1);
  user={id:CLIENT_ID,email:'developer@example.invalid'};
  sub=null;
});

test('former sandbox subscriber may see own invoices but cannot start new checkout after tester access is revoked',async()=>{
  user={id:CLIENT_ID,email:'developer@example.invalid'};
  sub={plan_id:'starter',provider:'stripe',provider_customer_id:'cus_test_former',provider_subscription_id:'sub_test_former',status:'canceled'};
  process.env.PARLAYPING_BILLING_SANDBOX_ENABLED='true';
  process.env.STRIPE_SECRET_KEY='sk_test_UnitTestKey123456';
  process.env.STRIPE_SANDBOX_PORTAL_CONFIG_ID='bpc_1UPNFeLJU3n7oe0PdK88tDIS';
  delete process.env.PARLAYPING_BILLING_TESTER_USER_IDS;
  const calls=[];
  global.fetch=async(url,opts)=>{
    calls.push({url,form:Object.fromEntries(new URLSearchParams(opts.body))});
    return {ok:true,status:200,json:async()=>({id:'bps_test_former',url:'https://billing.stripe.com/p/session/test'})};
  };
  const account=res();await router(req('account'),account);
  assert.equal(account.statusCode,200);
  assert.equal(account.body.sandboxCheckoutAllowed,false);
  const portal=res();await router(req('billing-portal','POST'),portal);
  assert.equal(portal.statusCode,200);
  assert.match(portal.body.url,/^https:\/\/billing\.stripe\.com\//);
  assert.equal(calls.length,1);
  assert.equal(calls[0].form.customer,'cus_test_former');
  assert.equal(calls[0].form.configuration,'bpc_1UPNFeLJU3n7oe0PdK88tDIS');
  const checkout=res();await router(req('billing-checkout','POST',{plan:'starter'}),checkout);
  assert.equal(checkout.statusCode,403);
  assert.equal(calls.length,1,'No new Checkout Session may be created for unapproved former tester');
  sub=null;
});
test('developer dashboard retains history button after cancellation',()=>{
  const ui=fs.readFileSync(path.join(__dirname,'../profile-dev.js'),'utf8');
  assert.match(ui,/hasBillingHistory=Boolean\(sub\?\.provider==='stripe'/);
  assert.match(ui,/devBillingPaidActions'\)\.hidden=!hasBillingHistory/);
  assert.match(ui,/View invoices & billing history/);
  assert.match(ui,/manageButton\.disabled=!\(allowed\|\|hasBillingHistory\)/);
});
