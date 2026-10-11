const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const claim=read('sql/stripe-webhook-resilience.sql');
const guard=read('sql/stripe-webhook-first-party-guard.sql');
const webhook=read('supabase/functions/parlayping-stripe-webhook/index.ts');
const router=read('server/api/account-router.js');

test('failed webhook deliveries can retry while received/processed events remain deduplicated',()=>{
  assert.match(claim,/status='failed'/);
  assert.match(claim,/received_at<clock_timestamp\(\)-interval '5 minutes'/);
  assert.match(claim,/ON CONFLICT\(event_id\) DO UPDATE/);
  assert.match(claim,/RETURN v_claimed IS NOT NULL/);
  assert.match(claim,/stripe_last_event_created_at/);
});
test('Stripe webhook uses event-aware RPC and explicitly ignores stale events',()=>{
  assert.match(webhook,/verifyStripe\(raw,signature\)/);
  assert.match(webhook,/parlayping_stripe_apply_subscription_event/);
  assert.match(webhook,/p_event_id:String\(event.id\)/);
  assert.match(webhook,/applied===true\?'processed':'ignored'/);
  assert.doesNotMatch(webhook,/await rpc\('parlayping_stripe_apply_subscription',/);
});
test('API subscription event handler rejects out-of-order/old cancellation changes',()=>{
  assert.match(claim,/stripe_last_event_created_at/);
  assert.match(guard,/v_event_at<v_existing\.stripe_last_event_created_at/);
  assert.match(guard,/v_existing\.provider_subscription_id IS DISTINCT FROM p_subscription_id/);
  assert.match(guard,/v_existing\.status='canceled' AND p_status<>'canceled'/);
  assert.match(guard,/v_existing\.status IN \('past_due','canceled','unpaid','paused','incomplete','incomplete_expired'\)/);
});
test('new signup Free record may upgrade, but explicit TSO first-party internal entitlement cannot',()=>{
  assert.match(guard,/first_party_api_entitlements/);
  assert.match(guard,/t\.user_id=p_user_id AND t\.enabled=true/);
  assert.match(router,/isOwner&&subscriptions\?\.\[0\]\?\.provider==='internal'/);
  assert.match(router,/if\(isDeveloperUser\(user\)&&sub\?\.provider==='internal'/);
  assert.match(router,/requireSandboxTester\(user\)/);
});
test('webhook service-only SQL functions cannot be run through public auth roles',()=>{
  assert.match(claim,/REVOKE ALL ON FUNCTION public\.parlayping_stripe_claim_event/);
  assert.match(guard,/REVOKE ALL ON FUNCTION public\.parlayping_stripe_apply_subscription_event/);
  assert.match(guard,/TO service_role/);
});
