const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');

const PRICE_IDS={
  starter:'price_1UPC14LJU3n7oe0PWXlzXBDx',
  pro:'price_1UPC1CLJU3n7oe0PnBVQIZd0',
  business:'price_1UPC1HLJU3n7oe0Pm1WkA86y',
};
const varNames={
  STRIPE_STARTER_PRICE_ID:PRICE_IDS.starter,
  STRIPE_PRO_PRICE_ID:PRICE_IDS.pro,
  STRIPE_BUSINESS_PRICE_ID:PRICE_IDS.business,
};
const origEnv=Object.fromEntries(Object.keys({...varNames,STRIPE_SECRET_KEY:1,PARLAYPING_BILLING_SANDBOX_ENABLED:1}).map(k=>[k,process.env[k]]));
for(const [k,v] of Object.entries(varNames))process.env[k]=v;
const helper=require('../server/api/lib/stripe-billing');
const originalFetch=global.fetch;
const OWNER_ID='a08636ec-508e-457d-8e5a-400a0ec39729';
const supabaseModule=require.resolve('../server/api/lib/supabase-account');
const realSupabase=require.cache[supabaseModule];
let subscription=null;
let observedQueries=[];
require.cache[supabaseModule]={id:supabaseModule,filename:supabaseModule,loaded:true,exports:{
  requireUser:async()=>({token:'Bearer mock-owner-session',user:{id:OWNER_ID,email:'owner@example.test'}}),
  supabaseFetch:async(path)=>{observedQueries.push(path);return subscription?[subscription]:[];},
  accountEdge:async()=>({}),
}};
const router=require('../server/api/account-router');
function res(){return{statusCode:200,headers:{},body:null,setHeader(key,value){this.headers[key]=value;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};}
function req(route,body={}){return{method:'POST',query:{route},body,headers:{}};}
function stripeFake(record){
  global.fetch=async(url,opts)=>{record.push({url,authorization:opts.headers.authorization,body:Object.fromEntries(new URLSearchParams(opts.body))});
    return{ok:true,status:200,json:async()=>({id:url.endsWith('sessions')?'cs_test_mock':'unexpected',url:'https://checkout.stripe.com/c/pay/cs_test_mock'})};
  };
}
test.after(()=>{global.fetch=originalFetch;for(const [k,v]of Object.entries(origEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v;}if(realSupabase)require.cache[supabaseModule]=realSupabase;else delete require.cache[supabaseModule];});
test('all sandbox price IDs match three distinct approved monthly plans',()=>{
  for(const [plan,id]of Object.entries(PRICE_IDS))assert.equal(helper.priceIdForPlan(plan),id);
  assert.throws(()=>helper.priceIdForPlan('free'),/Unknown paid API plan/);
  assert.throws(()=>helper.priceIdForPlan('enterprise'),/Unknown paid API plan/);
});
test('checkout is disabled by default even when a test key is present',async()=>{
  delete process.env.PARLAYPING_BILLING_SANDBOX_ENABLED;
  process.env.STRIPE_SECRET_KEY='sk_test_UnitTestKey123456';
  global.fetch=()=>{throw Error('Stripe must never be contacted');};
  const out=res();await router(req('billing-checkout',{plan:'starter'}),out);
  assert.equal(out.statusCode,503);
  assert.match(out.body.error,/not enabled/i);
});
test('explicit sandbox flag never authorizes a live Stripe key',async()=>{
  process.env.PARLAYPING_BILLING_SANDBOX_ENABLED='true';
  process.env.STRIPE_SECRET_KEY='sk_live_UnitTestKey123456';
  global.fetch=()=>{throw Error('Stripe must never be contacted');};
  const out=res();await router(req('billing-checkout',{plan:'pro'}),out);
  assert.equal(out.statusCode,503);
  assert.match(out.body.error,/test-mode secret key/i);
});
test('sandbox checkout creates a Stripe session for each approved tier; never grants a plan locally',async()=>{
  process.env.PARLAYPING_BILLING_SANDBOX_ENABLED='true';
  process.env.STRIPE_SECRET_KEY='sk_test_UnitTestKey123456';
  const calls=[];stripeFake(calls);
  subscription=null;observedQueries=[];
  for(const [plan,id]of Object.entries(PRICE_IDS)){
    const out=res();
    await router(req('billing-checkout',{plan}),out);
    assert.equal(out.statusCode,200);
    assert.equal(out.body.ok,true);
    const call=calls.at(-1);
    assert.equal(call.url,'https://api.stripe.com/v1/checkout/sessions');
    assert.equal(call.body.mode,'subscription');
    assert.equal(call.body['line_items[0][price]'],id);
    assert.equal(call.body['metadata[plan_id]'],plan);
    assert.equal(call.body['subscription_data[metadata][plan_id]'],plan);
    assert.equal(call.body.client_reference_id,OWNER_ID);
    assert.equal(call.authorization,'Bearer sk_test_UnitTestKey123456');
  }
  assert.equal(calls.length,3);
  assert(observedQueries.every(q=>q.includes('/subscriptions?select=')));
});
test('existing paid subscription prevents a duplicate checkout; billing portal is used instead',async()=>{
  process.env.PARLAYPING_BILLING_SANDBOX_ENABLED='true';
  process.env.STRIPE_SECRET_KEY='sk_test_UnitTestKey123456';
  const calls=[];stripeFake(calls);
  subscription={provider:'stripe',provider_subscription_id:'sub_test_existing',provider_customer_id:'cus_test_existing',status:'active',plan_id:'pro'};
  const attempt=res();await router(req('billing-checkout',{plan:'business'}),attempt);
  assert.equal(attempt.statusCode,409);
  assert.match(attempt.body.error,/already have a Stripe subscription/i);
  assert.equal(calls.length,0);
  const manage=res();await router(req('billing-portal'),manage);
  assert.equal(manage.statusCode,200);
  assert.equal(calls[0].url,'https://api.stripe.com/v1/billing_portal/sessions');
  assert.equal(calls[0].body.customer,'cus_test_existing');
  assert(!('subscription' in manage.body),'Portal never fakes a subscription update');
});
test('invalid plan never reaches Stripe; completed checkout cannot grant API keys directly',async()=>{
  process.env.PARLAYPING_BILLING_SANDBOX_ENABLED='true';
  process.env.STRIPE_SECRET_KEY='sk_test_UnitTestKey123456';
  subscription=null;
  const calls=[];stripeFake(calls);
  const out=res();await router(req('billing-checkout',{plan:'free'}),out);
  assert.equal(out.statusCode,400);
  assert.equal(calls.length,0);
  const source=require('node:fs').readFileSync(path.join(__dirname,'../server/api/account-router.js'),'utf8');
  assert(!source.includes('parlayping_stripe_apply_subscription'));
  assert(!source.includes('SUPABASE_SERVICE_ROLE_KEY'));
});

test('protected owner internal API license cannot be overwritten by sandbox checkout',async()=>{
  process.env.PARLAYPING_BILLING_SANDBOX_ENABLED='true';
  process.env.STRIPE_SECRET_KEY='sk_test_UnitTestKey123456';
  subscription={provider:'internal',status:'active',plan_id:'free'};
  global.fetch=()=>{throw Error('Stripe must never be contacted for protected internal account')};
  const out=res();await router(req('billing-checkout',{plan:'business'}),out);
  assert.equal(out.statusCode,409);
  assert.match(out.body.error,/protected first-party API access/i);
  const account=res();await router({...req('account'),method:'GET'},account);
  assert.equal(account.statusCode,200);
  assert.equal(account.body.sandboxCheckoutAllowed,false);
  subscription=null;
});
