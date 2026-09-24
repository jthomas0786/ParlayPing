const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const apiKeyAuth=require('../api/lib/api-key-auth');
const v1Analyze=require('../api/v1/analyze');

function makeRes(){return{statusCode:200,headers:{},payload:null,setHeader(k,v){this.headers[String(k).toLowerCase()]=v;},status(code){this.statusCode=code;return this;},json(payload){this.payload=payload;return this;}};}
function read(rel){return fs.readFileSync(path.join(__dirname,'..',rel),'utf8');}

test('API key extraction accepts x-api-key and Bearer pp_live keys only',()=>{
  const key='pp_live_'+'a'.repeat(48);
  assert.equal(apiKeyAuth.extractApiKey({headers:{'x-api-key':key}}),key);
  assert.equal(apiKeyAuth.extractApiKey({headers:{authorization:`Bearer ${key}`}}),key);
  assert.equal(apiKeyAuth.extractApiKey({headers:{authorization:'Bearer not-a-parlayping-key'}}),'');
});

test('versioned analyze route fails closed without API key before any analysis call',async()=>{
  const req={method:'POST',headers:{},body:{legs:[{sport:'NFL',player:'Test',market:'receivingYards',side:'over',line:10.5}]}};
  const res=makeRes();
  await v1Analyze(req,res);
  assert.equal(res.statusCode,401);
  assert.equal(res.payload.ok,false);
  assert.match(res.payload.error,/API key required/i);
});

test('regular account surface contains user auth and profile settings while developer tools live on profile',()=>{
  const account=read('account.html');
  const profile=read('profile.html');
  for(const needle of ['Create account','Sign in','Profile details','Open Tracking'])assert.match(account,new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(account,/API Keys/i);
  assert.doesNotMatch(account,/>Usage</i);
  for(const needle of ['>Dev<','API keys','Usage','/api/v1/analyze'])assert.match(profile,new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
});

test('private profile Dev runtime owns Stripe billing and API-key management flows',()=>{
  const devJs=read('profile-dev.js');
  const profile=read('profile.html');
  const router=read('server/api/account-router.js');
  assert.match(devJs,/\/api\/billing-checkout/);
  assert.match(devJs,/\/api\/billing-portal/);
  assert.match(devJs,/\/api\/api-keys/);
  assert.match(profile,/Upgrade Pro/);
  assert.match(profile,/Business/);
  assert.match(profile,/Manage billing/);
  assert.match(router,/priceIdForPlan/);
  assert.match(router,/requireDeveloper\(user\)/);
});

test('Vercel account/API source never requires or embeds Supabase service-role credentials',()=>{
  const files=['api/lib/supabase-account.js','api/account-router.js','api/lib/api-key-auth.js','api/v1/analyze.js','account.js'];
  for(const rel of files){
    const source=read(rel);
    assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(source,/service_role/i);
  }
});

test('public developer API auth is pinned to the dedicated ParlayPing Supabase project',()=>{
  assert.match(apiKeyAuth.AUTH_URL,/avwqjgiitxqphvmitolw\.supabase\.co\/functions\/v1\/parlayping-api-auth$/);
});
