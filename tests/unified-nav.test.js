const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('canonical app navigation matches the current growth-loop destinations and actions',()=>{
  const nav=read('app-nav.js');
  for(const label of ['Build','Explore','Submit','Community'])assert.match(nav,new RegExp(`label:'${label}'`));
  assert.doesNotMatch(nav,/label:'Tracking'/);
  assert.doesNotMatch(nav,/label:'Account'/);
  assert.doesNotMatch(nav,/label:'Insights'/);
  assert.match(nav,/pp-builder-search-button/);
  assert.match(nav,/pp-builder-notification-button/);
  assert.match(nav,/pp-builder-profile-button/);
  assert.match(nav,/parlayping-approved-wordmark\.webp/);
  assert.match(nav,/profile\?tab=community/);
  assert.match(nav,/href:'\/submit'/);
});

test('home builder tracking account tail shared slips and submit load the canonical nav',()=>{
  const navRef=/app-nav\.js\?v=\d+[a-z]?/;
  assert.match(read('app.js'),navRef);
  assert.match(read('server/api/builder-page.js'),navRef);
  assert.match(read('profile.html'),navRef);
  assert.match(read('account.html'),navRef);
  assert.match(read('tail.html'),navRef);
  assert.match(read('submit.html'),navRef);
  assert.match(read('api/index.js'),/share-page-with-nav/);
  assert.match(read('server/api/share-page-with-nav.js'),navRef);
});

test('canonical nav preserves the Builder desktop and two-row mobile geometry',()=>{
  const css=read('app-nav.css');
  assert.match(css,/\.pp-builder-header\{[^}]*height:92px!important/s);
  assert.match(css,/\.pp-builder-main-nav\{[^}]*gap:28px!important/s);
  assert.match(css,/\.pp-builder-header-actions\{[^}]*gap:12px!important/s);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/height:148px!important/);
  assert.match(css,/grid-template-rows:82px 66px!important/);
  assert.match(css,/grid-template-columns:repeat\(4,1fr\)!important/);
  assert.doesNotMatch(css,/pp-app-menu-button/);
});

test('active navigation derives from route while account and tracking live in action controls',()=>{
  const nav=read('app-nav.js');
  assert.match(nav,/path==='\/submit'/);
  assert.match(nav,/params\.get\('tab'\)==='community'/);
  assert.match(nav,/path\.startsWith\('\/build\/'\)/);
  assert.match(nav,/hash\.includes\('trending'\)/);
  assert.match(nav,/hash\.includes\('communityinsights'\)/);
  assert.match(nav,/pp-builder-notification-button/);
  assert.match(nav,/pp-builder-profile-button/);
});
