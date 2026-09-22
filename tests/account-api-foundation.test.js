const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const apiKeyAuth=require('../api/lib/api-key-auth');
const v1Analyze=require('../api/v1/analyze');

function makeRes(){return{statusCode:200,headers:{},payload:null,setHeader(k,v){this.headers[String(k).toLowerCase()]=v;},status(code){this.statusCode=code;return this;},json(payload){this.payload=payload;return this;}};}

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

test('account console contains signup, signin, API keys, usage, and versioned quick start',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','account.html'),'utf8');
  for(const needle of ['Create account','Sign in','API Keys','Usage','/api/v1/analyze'])assert.match(html,new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('account console exposes upgrade and Stripe billing management flows',()=>{
  const js=fs.readFileSync(path.join(__dirname,'..','account.js'),'utf8');
  assert.match(js,/\/api\/billing-checkout/);
  assert.match(js,/\/api\/billing-portal/);
  assert.match(js,/Upgrade to Pro/);
  assert.match(js,/Upgrade to Business/);
  assert.match(js,/Manage billing/);
  assert.match(js,/price_monthly_cents/);
});

test('Vercel account/API source never requires or embeds Supabase service-role credentials',()=>{
  const files=['api/lib/supabase-account.js','api/account-router.js','api/lib/api-key-auth.js','api/v1/analyze.js','account.js'];
  for(const rel of files){
    const source=fs.readFileSync(path.join(__dirname,'..',rel),'utf8');
    assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(source,/service_role/i);
  }
});

test('public developer API auth is pinned to the dedicated ParlayPing Supabase project',()=>{
  assert.match(apiKeyAuth.AUTH_URL,/avwqjgiitxqphvmitolw\.supabase\.co\/functions\/v1\/parlayping-api-auth$/);
});
