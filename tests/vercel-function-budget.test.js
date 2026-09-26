const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');

test('Vercel deploy tree contains one committed API function',()=>{
  const entries=fs.readdirSync(path.join(root,'api'),{withFileTypes:true});
  const realFunctions=entries.filter((entry)=>entry.isFile()&&/\.(?:js|mjs|cjs|ts)$/.test(entry.name)).map((entry)=>entry.name);
  assert.deepEqual(realFunctions,['index.js']);
});

test('single-function dispatcher preserves all public API URLs',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  const rewrites=new Map((config.rewrites||[]).map((item)=>[item.source,item.destination]));
  const expected={
    '/api/analyze':'/api/index?__pp_route=analyze',
    '/api/parse':'/api/index?__pp_route=parse',
    '/api/status':'/api/index?__pp_route=status',
    '/api/account':'/api/index?__pp_route=account',
    '/api/api-keys':'/api/index?__pp_route=api-keys',
    '/api/plans':'/api/index?__pp_route=plans',
    '/api/billing-checkout':'/api/index?__pp_route=billing-checkout',
    '/api/billing-portal':'/api/index?__pp_route=billing-portal',
    '/api/v1/analyze':'/api/index?__pp_route=v1-analyze',
    '/api/v1/build':'/api/index?__pp_route=v1-build',
    '/api/v1/share':'/api/index?__pp_route=v1-share',
    '/api/x-dry-run':'/api/index?__pp_route=x-dry-run',
    '/api/x-scheduler':'/api/index?__pp_route=x-scheduler',
    '/api/x-worker':'/api/index?__pp_route=x-worker',
    '/api/discovery-worker':'/api/index?__pp_route=discovery-worker',
    '/slip/:token':'/api/index?__pp_route=share-page&slip=:token',
    '/share/:token.png':'/api/index?__pp_route=share-card&slip=:token'
  };
  for(const [source,destination] of Object.entries(expected))assert.equal(rewrites.get(source),destination,source);
});
