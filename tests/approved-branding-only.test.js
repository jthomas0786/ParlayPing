const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('primary rendered surfaces use the approved ParlayPing artwork',()=>{
  const nav=read('app-nav.js');
  const tracking=read('tracking-branding.js');
  const builderCss=read('builder-branding-final.css');
  const builderJs=read('builder-branding-final.js');
  const tail=read('tail.html');

  for(const source of [nav,tracking,builderCss,builderJs,tail]){
    assert.doesNotMatch(source,/parlayping-approved-builder-header\.webp/);
  }
  assert.match(nav,/parlayping-approved-wordmark\.webp/);
  assert.match(tracking,/parlayping-approved-wordmark\.webp/);
  assert.match(builderCss,/parlayping-approved-wordmark\.webp/);
  assert.match(builderJs,/parlayping-approved-wordmark\.webp/);
  assert.match(builderJs,/parlayping-approved-hero\.webp/);
  assert.match(tail,/parlayping-approved-wordmark\.webp/);
  assert.match(tail,/parlayping-approved-hero\.webp/);
  assert.doesNotMatch(tail,/class="brand-mark"/);
});

test('legacy logo entrypoints can only render the two approved designs',()=>{
  const lockup=read('parlayping-approved-lockup.svg');
  const logo=read('parlayping-logo.svg');
  const mark=read('parlayping-mark.svg');
  const favicon=read('favicon.svg');
  assert.match(lockup,/parlayping-approved-wordmark\.webp/);
  assert.match(logo,/parlayping-approved-wordmark\.webp/);
  assert.match(mark,/parlayping-approved-hero\.webp/);
  assert.match(favicon,/parlayping-approved-hero\.webp/);
  assert.doesNotMatch(lockup,/BET SMARTER TOGETHER/);
});

test('approved wordmark is served from clean PNG data instead of the compressed tinted WebP bytes',()=>{
  const api=read('api/index.js');
  const vercel=read('vercel.json');
  const endpoint=read('server/api/brand-wordmark.js');
  const renderer=read('server/api/lib/share-renderer.js');
  assert.match(api,/brand-wordmark/);
  assert.match(vercel,/parlayping-approved-wordmark\.webp[^\n]+brand-wordmark/);
  assert.match(endpoint,/approved-wordmark-data/);
  assert.match(endpoint,/Content-Type','image\/png/);
  assert.match(renderer,/approvedWordmarkData/);
  assert.doesNotMatch(renderer,/localAssetDataUri\('parlayping-approved-lockup\.svg'/);
});

test('signed-out account badges never visibly expose owner initials',()=>{
  const landing=read('app.js');
  const builderJs=read('builder-branding-final.js');
  const builderCss=read('builder-branding-final.css');
  assert.match(landing,/neutralizeSignedOutProfile/);
  assert.match(landing,/Sign in or open account/);
  assert.match(builderJs,/Sign in or open account/);
  assert.match(builderJs,/data.*signedOutProfile|signedOutProfile/s);
  assert.match(builderCss,/\.profile-button\{font-size:0!important\}/);
});
