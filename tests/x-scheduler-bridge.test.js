const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const scheduler=require('../api/x-scheduler');

function makeReq(secret,authorization){
  const headers={};
  if(secret)headers['x-parlayping-scheduler-secret']=secret;
  if(authorization)headers.authorization=authorization;
  return{headers};
}

test('scheduler bridge authenticates by SHA-256 without storing the bearer secret in source',()=>{
  const secret='unit-test-scheduler-secret';
  const expected=scheduler.hashSecret(secret);
  assert.equal(scheduler.schedulerAuthorized(makeReq(secret),expected),true);
  assert.equal(scheduler.schedulerAuthorized(makeReq('wrong-secret'),expected),false);
  assert.equal(scheduler.schedulerAuthorized(makeReq(),expected),false);
});

test('scheduler bridge accepts Vercel CRON_SECRET bearer auth without weakening legacy auth',()=>{
  const previous=process.env.CRON_SECRET;
  process.env.CRON_SECRET='unit-test-vercel-cron-secret';
  try{
    assert.equal(scheduler.schedulerAuthorized(makeReq(null,'Bearer unit-test-vercel-cron-secret'),'0'.repeat(64)),true);
    assert.equal(scheduler.schedulerAuthorized(makeReq(null,'Bearer wrong-secret'),'0'.repeat(64)),false);
    assert.equal(scheduler.schedulerAuthorized(makeReq(null,'unit-test-vercel-cron-secret'),'0'.repeat(64)),false);
  }finally{
    if(previous===undefined)delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET=previous;
  }
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

test('trusted scheduler can run mention processing while direct worker keeps its autoreply gate',()=>{
  const root=path.join(__dirname,'..');
  const bridge=fs.readFileSync(path.join(root,'server','api','x-scheduler.js'),'utf8');
  const worker=fs.readFileSync(path.join(root,'server','api','x-worker.js'),'utf8');
  assert.match(bridge,/if\(!schedulerAuthorized\(req\)\)return/);
  assert.match(bridge,/X_AI_REPLY_APPROVED/);
  assert.match(bridge,/xWorker\.processMentions\(\{dryRun:false,idempotencySecret\}\)/);
  assert.match(bridge,/autoReplyMode:'trusted-scheduler'/);
  assert.match(worker,/X_AUTOREPLY_ENABLED/);
  assert.match(worker,/if\(!\(approved&&enabled\)\)return/);
});
