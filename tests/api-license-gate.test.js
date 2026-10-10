const test=require('node:test');
const assert=require('node:assert/strict');
const {apiAuth}=require('../server/api/lib/api-key-auth');

test('versioned API denies free/unverified license even when private auth returns HTTP 200',async()=>{
  const original=global.fetch;
  const examples=[
    [{ok:true,plan:'free'},false,403],
    [{ok:true,plan:'pro'},false,403],
    [{ok:true,licenseType:'paid',plan:'pro',subscriptionStatus:'active'},true,200],
    [{ok:true,licenseType:'paid',plan:'pro',subscriptionStatus:'past_due'},false,403],
    [{ok:true,licenseType:'partner',partnerStatus:'pending',expiresAt:'2099-01-01T00:00:00.000Z'},false,403],
    [{ok:true,licenseType:'partner',partnerStatus:'approved',expiresAt:'2099-01-01T00:00:00.000Z'},true,200],
    [{ok:true,licenseType:'first_party',authorized:true},true,200]
  ];
  try{
    for(const [payload,allowed,status] of examples){
      global.fetch=async()=>new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
      const res=await apiAuth({apiKey:'pp_live_'+'a'.repeat(48),endpoint:'/api/v1/analyze',requestId:'test'});
      assert.equal(res.ok,allowed,JSON.stringify(payload));
      assert.equal(res.status,status);
    }
  }finally{global.fetch=original;}
});

test('metering finalization call still reaches the private Edge function',async()=>{
  const original=global.fetch;
  try{
    global.fetch=async()=>new Response(JSON.stringify({ok:true}),{status:200});
    const res=await apiAuth({apiKey:'test',endpoint:'/api/v1/analyze',requestId:'req',action:'finalize',statusCode:201});
    assert.equal(res.ok,true);
  }finally{global.fetch=original;}
});
