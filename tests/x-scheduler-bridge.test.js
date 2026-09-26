const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const scheduler=require('../api/x-scheduler');

function makeReq(secret){return{headers:secret?{'x-parlayping-scheduler-secret':secret}:{}};}

test('Supabase scheduler bridge authenticates by SHA-256 without storing the bearer secret in source',()=>{
  const secret='unit-test-scheduler-secret';
  const expected=scheduler.hashSecret(secret);
  assert.equal(scheduler.schedulerAuthorized(makeReq(secret),expected),true);
  assert.equal(scheduler.schedulerAuthorized(makeReq('wrong-secret'),expected),false);
  assert.equal(scheduler.schedulerAuthorized(makeReq(),expected),false);
});

test('shared scheduler auth contains only the fixed production digest and no bearer secret',()=>{
  const root=path.join(__dirname,'..');
  const bridge=fs.readFileSync(path.join(root,'server','api','x-scheduler.js'),'utf8');
  const auth=fs.readFileSync(path.join(root,'server','api','lib','scheduler-auth.js'),'utf8');
  const match=auth.match(/SCHEDULER_SECRET_SHA256='([a-f0-9]{64})'/);
  assert.ok(match,'production scheduler SHA-256 digest is missing');
  assert.equal(match[1].length,64);
  assert.match(bridge,/require\('\.\/lib\/scheduler-auth'\)/);
  assert.doesNotMatch(`${bridge}\n${auth}`,/vault\.decrypted_secrets|parlayping_scheduler_secret/);
  assert.doesNotMatch(`${bridge}\n${auth}`,/unit-test-scheduler-secret/);
});
