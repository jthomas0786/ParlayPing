const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const router=fs.readFileSync(path.join(root,'api','account-router.js'),'utf8');
const helper=fs.readFileSync(path.join(root,'api','lib','stripe-billing.js'),'utf8');
const envExample=fs.readFileSync(path.join(root,'.env.example'),'utf8');

test('billing secrets and price IDs are configuration-only',()=>{
  assert.match(helper,/process\.env\.STRIPE_SECRET_KEY/);
  assert.match(helper,/STRIPE_PRO_PRICE_ID/);
  assert.match(helper,/STRIPE_BUSINESS_PRICE_ID/);
  assert.doesNotMatch(helper,/sk_(?:test|live)_/);
  assert.doesNotMatch(envExample,/whsec_[A-Za-z0-9]+/);
});

test('checkout is authenticated and cannot directly grant a paid plan',()=>{
  assert.match(router,/requireUser\(req\)/);
  assert.match(router,/\['pro','business'\]/);
  assert.match(router,/mode:'subscription'/);
  assert.match(router,/subscription_data\[metadata\]\[user_id\]/);
  assert.doesNotMatch(router,/parlayping_stripe_apply_subscription/);
  assert.doesNotMatch(router,/service[_-]?role/i);
});

test('existing paid customers are sent to billing management instead of duplicate checkout',()=>{
  assert.match(router,/already have a Stripe subscription/i);
  assert.match(router,/provider_customer_id/);
  assert.match(router,/billing_portal\/sessions/);
  assert.match(router,/requireUser\(req\)/);
});
