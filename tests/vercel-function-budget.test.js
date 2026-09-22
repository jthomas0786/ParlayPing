const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');

function collectFunctionFiles(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.name==='lib')continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...collectFunctionFiles(full));
    else if(entry.isFile()&&/\.(?:js|mjs|cjs|ts)$/.test(entry.name))out.push(path.relative(root,full).replace(/\\/g,'/'));
  }
  return out;
}

test('Vercel Hobby serverless function budget stays at or below 12',()=>{
  const files=collectFunctionFiles(path.join(root,'api'));
  assert.ok(files.length<=12,`Expected <= 12 deployable API functions, found ${files.length}: ${files.join(', ')}`);
  assert.equal(files.length,12);
});

test('consolidated account routes preserve all public API URLs',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  const rewrites=new Map((config.rewrites||[]).map((item)=>[item.source,item.destination]));
  assert.equal(rewrites.get('/api/account'),'/api/account-router?route=account');
  assert.equal(rewrites.get('/api/api-keys'),'/api/account-router?route=api-keys');
  assert.equal(rewrites.get('/api/plans'),'/api/account-router?route=plans');
  assert.equal(rewrites.get('/api/billing-checkout'),'/api/account-router?route=billing-checkout');
  assert.equal(rewrites.get('/api/billing-portal'),'/api/account-router?route=billing-portal');
  for(const removed of ['account.js','api-keys.js','plans.js','billing-checkout.js','billing-portal.js']){
    assert.equal(fs.existsSync(path.join(root,'api',removed)),false,`${removed} must stay consolidated to preserve the Hobby function budget`);
  }
});
