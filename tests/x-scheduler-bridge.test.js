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

test('scheduler bridge source contains only a fixed SHA-256 digest for production scheduler auth',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','api','x-scheduler.js'),'utf8');
  const match=source.match(/SCHEDULER_SECRET_SHA256='([a-f0-9]{64})'/);
  assert.ok(match,'production scheduler SHA-256 digest is missing');
  assert.equal(match[1].length,64);
  assert.doesNotMatch(source,/vault\.decrypted_secrets|parlayping_scheduler_secret/);
});
