const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('approved browser wordmark redirects to clean lossless PNG asset',()=>{
  const vercel=JSON.parse(read('vercel.json'));
  const api=read('api/index.js');
  const handler=read('server/api/brand-wordmark.js');
  const redirect=vercel.redirects.find(item=>item.source==='/parlayping-approved-wordmark.webp');
  const route=vercel.rewrites.find(item=>item.source==='/brand/parlayping-wordmark.png');

  assert.ok(redirect,'missing static wordmark redirect');
  assert.equal(redirect.destination,'/brand/parlayping-wordmark.png');
  assert.equal(redirect.permanent,false);
  assert.ok(route,'missing clean wordmark route');
  assert.equal(route.destination,'/api/index?__pp_route=brand-wordmark');
  assert.match(api,/'brand-wordmark':\(\)=>require\('\.\.\/server\/api\/brand-wordmark'\)/);
  assert.match(handler,/approved-wordmark-data/);
  assert.match(handler,/Content-Type','image\/png'/);
  assert.match(handler,/max-age=31536000, immutable/);
  assert.doesNotMatch(handler,/parlayping-approved-wordmark\.webp/);
});
