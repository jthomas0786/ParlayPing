const test=require('node:test');
const assert=require('node:assert/strict');
const idem=require('../api/lib/x-idempotency');

async function withFetch(mock,fn){
  const prior=global.fetch;global.fetch=mock;
  try{return await fn();}finally{global.fetch=prior;}
}

async function withEnv(values,fn){
  const prior={};
  for(const [key,value] of Object.entries(values)){
    prior[key]=process.env[key];
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
  try{return await fn();}finally{
    for(const [key,value] of Object.entries(prior)){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
}

test('idempotency endpoint is pinned to dedicated ParlayPing Supabase project',()=>{
  assert.equal(idem.IDEMPOTENCY_ENDPOINT,'https://avwqjgiitxqphvmitolw.supabase.co/functions/v1/parlayping-x-idempotency');
});

test('idempotency timeout is launch-safe and bounded',async()=>{
  await withEnv({X_IDEMPOTENCY_TIMEOUT_MS:undefined},async()=>assert.equal(idem.idempotencyTimeoutMs(),5000));
  await withEnv({X_IDEMPOTENCY_TIMEOUT_MS:'500'},async()=>assert.equal(idem.idempotencyTimeoutMs(),2000));
  await withEnv({X_IDEMPOTENCY_TIMEOUT_MS:'50000'},async()=>assert.equal(idem.idempotencyTimeoutMs(),10000));
});

test('claim call uses scheduler secret and POST body',async()=>{
  const calls=[];
  const mockFetch=async(url,options={})=>{
    calls.push({url:String(url),options});
    return {ok:true,status:200,async text(){return JSON.stringify({ok:true,claimed:true,status:'claimed'});}};
  };
  await withFetch(mockFetch,async()=>{
    const result=await idem.claimMention('scheduler-secret','123456789');
    assert.equal(result.claimed,true);
  });
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,idem.IDEMPOTENCY_ENDPOINT);
  assert.equal(calls[0].options.method,'POST');
  assert.equal(calls[0].options.headers['x-parlayping-scheduler-secret'],'scheduler-secret');
  assert.deepEqual(JSON.parse(calls[0].options.body),{action:'claim',mentionId:'123456789'});
  assert.ok(calls[0].options.signal);
});

test('idempotency failures fail closed',async()=>{
  const mockFetch=async()=>({ok:false,status:401,async text(){return JSON.stringify({ok:false,error:'Unauthorized.'});}});
  await withFetch(mockFetch,async()=>{
    await assert.rejects(()=>idem.claimMention('bad-secret','123456789'),/Unauthorized/);
  });
  await assert.rejects(()=>idem.claimMention('', '123456789'),/secret is unavailable/i);
});
