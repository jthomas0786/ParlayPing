const test=require('node:test');
const assert=require('node:assert/strict');
const dryRun=require('../server/api/x-dry-run');
function response(){return{code:200,payload:null,setHeader(){},status(v){this.code=v;return this;},json(v){this.payload=v;return this}};}
const secret=process.env.X_WORKER_SECRET, auto=process.env.X_AUTOREPLY_ENABLED,oldFetch=global.fetch;
test.after(()=>{if(secret===undefined)delete process.env.X_WORKER_SECRET;else process.env.X_WORKER_SECRET=secret;if(auto===undefined)delete process.env.X_AUTOREPLY_ENABLED;else process.env.X_AUTOREPLY_ENABLED=auto;global.fetch=oldFetch;});
test('diagnostic X dry-run is private and never calls upstream services without valid secret',async()=>{
  process.env.X_WORKER_SECRET='internal-dry-run-test-key';
  process.env.X_AUTOREPLY_ENABLED='false';
  let calls=0;
  global.fetch=async()=>{calls++;throw Error('No upstream network call was allowed');};
  for(const provided of [null,'wrong-secret']){
    const res=response();
    const headers=provided?{'x-parlayping-secret':provided}:{};
    await dryRun({method:'GET',headers},res);
    assert.equal(res.code,401);
    assert.equal(res.payload.ok,false);
  }
  assert.equal(calls,0);
});
test('missing worker secret disables X diagnostic endpoint even if any caller supplied a token',async()=>{
  delete process.env.X_WORKER_SECRET;
  let calls=0;global.fetch=async()=>{calls++;throw Error('No upstream call allowed');};
  const res=response();
  await dryRun({method:'GET',headers:{'x-parlayping-secret':'anything'}},res);
  assert.equal(res.code,401);
  assert.equal(calls,0);
});
test('authenticated diagnostic endpoint stays disabled when live replies are enabled',async()=>{
  process.env.X_WORKER_SECRET='internal-dry-run-test-key';
  process.env.X_AUTOREPLY_ENABLED='true';
  let calls=0;global.fetch=async()=>{calls++;throw Error('No upstream call allowed');};
  const res=response();
  await dryRun({method:'GET',headers:{'x-parlayping-secret':'internal-dry-run-test-key'}},res);
  assert.equal(res.code,409);
  assert.equal(calls,0);
});
