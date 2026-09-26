const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('canonical app navigation matches the Builder header destinations and actions',()=>{
  const nav=read('app-nav.js');
  for(const label of ['Build','Explore','Community','Insights'])assert.match(nav,new RegExp(`label:'${label}'`));
  assert.doesNotMatch(nav,/label:'Tracking'/);
  assert.doesNotMatch(nav,/label:'Account'/);
  assert.match(nav,/pp-builder-search-button/);
  assert.match(nav,/pp-builder-notification-button/);
  assert.match(nav,/pp-builder-profile-button/);
  assert.match(nav,/parlayping-approved-wordmark\.webp/);
  assert.match(nav,/profile\?tab=community/);
  assert.match(nav,/#communityInsights/);
});

test('home builder tracking account and tail all load the same canonical nav',()=>{
  assert.match(read('app.js'),/app-nav\.js\?v=20260925b/);
  assert.match(read('server/api/builder-page.js'),/app-nav\.js\?v=20260925b/);
  assert.match(read('profile.html'),/app-nav\.js\?v=20260925b/);
  assert.match(read('account.html'),/app-nav\.js\?v=20260925b/);
  assert.match(read('tail.html'),/app-nav\.js\?v=20260925b/);
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

test('active navigation derives from route while account and tracking live in Builder action controls',()=>{
  const nav=read('app-nav.js');
  assert.match(nav,/params\.get\('tab'\)==='community'/);
  assert.match(nav,/path\.startsWith\('\/build\/'\)/);
  assert.match(nav,/hash\.includes\('trending'\)/);
  assert.match(nav,/hash\.includes\('communityinsights'\)/);
  assert.match(nav,/pp-builder-notification-button/);
  assert.match(nav,/pp-builder-profile-button/);
});
