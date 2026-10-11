const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const sql=fs.readFileSync(path.join(__dirname,'../sql/paid-only-api-license-gate.sql'),'utf8');

test('paid API authorization is restricted to valid Stripe plans with live entitlements',()=>{
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.parlayping_authenticate_api_key/);
  assert.match(sql,/s\.provider='stripe'/);
  assert.match(sql,/s\.provider_subscription_id IS NOT NULL/);
  assert.match(sql,/s\.status IN \('active','trialing'\)/);
  assert.match(sql,/p\.id IN \('starter','pro','business'\)/);
  assert.match(sql,/p\.price_monthly_cents>0/);
  assert.match(sql,/subscription-required/);
});

test('internal free exception is limited to pre-existing first-party grants',()=>{
  assert.match(sql,/first_party_api_entitlements/);
  assert.match(sql,/k\.revoked_at IS NULL/);
  assert.match(sql,/s\.provider='internal'/);
  assert.match(sql,/s\.plan_id='free'/);
  assert.match(sql,/i\.enabled=true/);
  assert.match(sql,/REVOKE ALL ON parlayping_internal\.first_party_api_entitlements/);
  assert.doesNotMatch(sql,/VALUES \('00000000-0000-0000-0000-000000000000'/);
});

test('idempotent replay cannot bypass canceled subscription checks',()=>{
  const auth=sql.split('CREATE OR REPLACE FUNCTION public.parlayping_authenticate_api_key(')[1].split('CREATE OR REPLACE FUNCTION public.parlayping_service_create_api_key(')[0];
  assert(auth.indexOf("'subscription-required'")<auth.indexOf('SELECT id INTO v_existing'));
  assert.match(auth,/user_id=v_key\.user_id AND occurred_at>=now\(\)-interval '1 minute'/);
  assert.match(auth,/pg_advisory_xact_lock/);
});

test('API key issuance requires a paid or explicitly internal entitlement',()=>{
  const create=sql.split('CREATE OR REPLACE FUNCTION public.parlayping_service_create_api_key(')[1].split('CREATE OR REPLACE FUNCTION public.parlayping_service_usage_summary(')[0];
  assert.match(create,/Active paid subscription required to create API keys/);
  assert.match(create,/first_party_api_entitlements/);
  assert.match(create,/p\.price_monthly_cents>0/);
});

test('expired/canceled account usage displays no fallback free quota',()=>{
  const usage=sql.split('CREATE OR REPLACE FUNCTION public.parlayping_service_usage_summary(')[1];
  assert.match(usage,/coalesce\(v_plan\.id,'none'\)/);
  assert.match(usage,/coalesce\(v_plan\.monthly_request_limit,0\)/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.parlayping_create_api_key/);
});
