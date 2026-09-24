const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('shared app navigation exposes all primary ParlayPing destinations',()=>{
  const nav=read('app-nav.js');
  for(const label of ['Build','Explore','Community','Insights','Tracking','Account'])assert.match(nav,new RegExp(`label:'${label}'`));
  assert.match(nav,/parlayping-approved-lockup\.svg/);
  assert.match(nav,/profile\?tab=community/);
  assert.match(nav,/#communityInsights/);
});

test('home build profile account and tail all load the shared nav',()=>{
  assert.match(read('app.js'),/app-nav\.js/);
  assert.match(read('profile-push.js'),/app-nav\.js/);
  assert.match(read('account.js'),/app-nav\.js/);
  assert.match(read('tail.html'),/app-nav\.js/);
});

test('shared nav is sticky and collapses to a mobile menu',()=>{
  const css=read('app-nav.css');
  assert.match(css,/position:sticky/);
  assert.match(css,/\.pp-app-menu-button/);
  assert.match(css,/@media\(max-width:820px\)/);
  assert.match(css,/\.pp-app-mobile-menu:not\(\[hidden\]\)/);
});

test('active navigation derives from page route and profile community tab',()=>{
  const nav=read('app-nav.js');
  assert.match(nav,/params\.get\('tab'\)==='community'/);
  assert.match(nav,/path\.startsWith\('\/build\/'\)/);
  assert.match(nav,/hash\.includes\('trending'\)/);
  assert.match(nav,/hash\.includes\('communityinsights'\)/);
});
