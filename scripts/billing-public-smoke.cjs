#!/usr/bin/env node
/* Read-only public Parlay Ping billing smoke test.
 * Never supplies credentials, creates Checkout Sessions, starts a payment,
 * mutates customer data, or enables Stripe billing.
 */
'use strict';
const assert=require('node:assert/strict');
const base=new URL(process.env.PARLAYPING_SMOKE_BASE_URL||'https://parlayping.net');
if(base.protocol!=='https:'||!['parlayping.net','parlayping.onrender.com'].includes(base.hostname)){
  throw new Error('Smoke test target must be an approved Parlay Ping HTTPS host');
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function call(path,{method='GET',body,headers={}}={}){
  const url=new URL(path,base);
  let last;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const result=await fetch(url,{
        method,
        headers:{accept:'application/json, text/html;q=0.9',...(body===undefined?{}:{'content-type':'application/json'}),...headers},
        body:body===undefined?undefined:JSON.stringify(body),
        signal:AbortSignal.timeout(16000),
        redirect:'follow',
      });
      const text=await result.text();
      if(result.status>=500 && attempt<3){last=Error(`${path} upstream ${result.status}`);await wait(2000*attempt);continue;}
      return {status:result.status,text,headers:result.headers};
    }catch(error){last=error;if(attempt<3)await wait(2000*attempt);}
  }
  throw last||Error(path+' request failed');
}

(async()=>{
  const health=await call('/healthz');
  assert.equal(health.status,200,'Render health endpoint must return 200');
  const live=JSON.parse(health.text);
  assert.equal(live.ok,true);
  assert.equal(live.service,'ParlayPing');
  assert.equal(live.runtime,'render-node');
  console.log('PASS /healthz: Render backend healthy');

  const developers=await call('/developers');
  assert.equal(developers.status,200,'Developer pricing page must load');
  for(const amount of ['$20','$70','$120'])assert.ok(developers.text.includes(amount),`Pricing page missing ${amount}`);
  assert.match(developers.text,/Public paid checkout is not open yet/);
  console.log('PASS /developers: approved sandbox-only pricing displayed');

  const prices=await call('/api/plans');
  assert.equal(prices.status,200,'Plan API must be readable without a subscription');
  const list=JSON.parse(prices.text);
  assert.equal(list.ok,true);
  const plans=list.plans||[];
  const expected=new Map([['starter',[2000,5000]],['pro',[7000,20000]],['business',[12000,50000]]]);
  assert.deepEqual(new Set(plans.map(p=>p.id)),new Set(expected.keys()),'Only paid public plans must be listed');
  for(const plan of plans){
    const [cents,uses]=expected.get(plan.id);
    assert.equal(Number(plan.price_monthly_cents),cents,`${plan.id} price changed unexpectedly`);
    assert.equal(Number(plan.monthly_request_limit),uses,`${plan.id} quota changed unexpectedly`);
  }
  console.log('PASS /api/plans: three exact approved prices/limits; no Free public plan');

  for(const [route,body] of [['/api/billing-checkout',{plan:'starter'}],['/api/billing-portal',{}]]){
    const result=await call(route,{method:'POST',body});
    assert.equal(result.status,401,`${route} must reject anonymous customer requests`);
    const data=JSON.parse(result.text);
    assert.equal(data.ok,false);
    assert.equal(Boolean(data.url),false,'Anonymous request must never return a Stripe payment/portal URL');
    console.log(`PASS ${route}: anonymous caller denied without creating a Stripe session`);
  }

  for(const route of ['/api/v1/analyze','/api/v1/build']){
    const result=await call(route,{method:'POST',body:{legs:[],candidates:[]}});
    assert.equal(result.status,401,`${route} must require a private API key`);
    console.log(`PASS ${route}: unauthenticated API access rejected`);
  }
  console.log('PASS: Parlay Ping public billing smoke (read-only, no payment or subscription created).');
})().catch(error=>{console.error('FAIL: '+(error?.stack||String(error)));process.exitCode=1;});
