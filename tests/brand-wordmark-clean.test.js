const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('approved browser wordmark is served from the clean lossless asset',()=>{
  const vercel=JSON.parse(read('vercel.json'));
  const api=read('api/index.js');
  const handler=read('server/api/brand-wordmark.js');
  const route=vercel.rewrites.find(item=>item.source==='/parlayping-approved-wordmark.webp');

  assert.ok(route,'missing canonical wordmark rewrite');
  assert.equal(route.destination,'/api/index?__pp_route=brand-wordmark');
  assert.match(api,/'brand-wordmark':\(\)=>require\('\.\.\/server\/api\/brand-wordmark'\)/);
  assert.match(handler,/approved-wordmark-data/);
  assert.match(handler,/Content-Type','image\/png'/);
  assert.match(handler,/max-age=31536000, immutable/);
  assert.doesNotMatch(handler,/parlayping-approved-wordmark\.webp/);
});
