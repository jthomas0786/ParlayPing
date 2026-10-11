const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const client=fs.readFileSync(path.join(__dirname,'../profile-dev.js'),'utf8');
const router=fs.readFileSync(path.join(__dirname,'../server/api/account-router.js'),'utf8');

test('each sandbox plan opens one Checkout request per click',()=>{
  for(const plan of ['Starter','Pro','Business']){
    const match=new RegExp("\\$\\('devUpgrade"+plan+"'\\)\\?\\.addEventListener\\('click'","g");
    assert.equal([...client.matchAll(match)].length,1,plan+' must have only one click handler');
  }
  assert.match(client,/if\(checkoutInFlight\)return;/);
  assert.match(client,/checkoutInFlight=true;/);
  assert.match(client,/checkoutInFlight=false;/);
});

test('browser accepts only Stripe-hosted HTTPS destinations for billing',()=>{
  assert.match(client,/url\.protocol==='https:'&&url\.hostname===host/);
  assert.match(client,/stripeHostedUrl\(result\?\.url,'checkout\.stripe\.com'\)/);
  assert.match(client,/stripeHostedUrl\(result\?\.url,'billing\.stripe\.com'\)/);
  assert.match(client,/if\(portalInFlight\)return;/);
});

test('checkout return cannot grant API access without signed webhook-backed entitlement',()=>{
  assert.match(client,/verifiedPaidEntitlement\(data\)/);
  assert.match(client,/sub\?\.provider==='stripe'/);
  assert.match(client,/async function syncReturnedCheckout\(/);
  assert.match(client,/await api\('\/api\/account'\)/);
  assert.doesNotMatch(client,/location\.search\.includes\('billing=success'\).*createKey/s);
  assert.match(router,/requireSandboxTester\(user\)/);
  assert.match(router,/const checkout=await stripePost\('\/checkout\/sessions'/);
  assert.doesNotMatch(router,/parlayping_stripe_apply_subscription/);
});
