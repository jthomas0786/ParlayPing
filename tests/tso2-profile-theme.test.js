const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=(f)=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('My Parlays uses current broadcast theme only when embedded in TSO',()=>{
  const shell=read('tso2-shell.js'),css=read('tso2-profile-broadcast.css');
  assert.match(shell,/if\(inTsoWorkspace\)/);
  assert.match(shell,/location\.pathname==='\/profile'/);
  assert.match(shell,/tso2-profile-broadcast\.css\?v=/);
  assert.doesNotMatch(read('profile.html'),/tso2-profile-broadcast\.css/);
  assert.match(css,/html\[data-tso2pp-embed\]/);
  for(const color of ['#05070a','#090d12','#ff4d1c','#ffd84d'])
    assert.ok(css.includes(color),color);
  for(const part of ['.tracking-card','.tracking-toolbar','.filter-row','.profile-hero','.tracking-grid','.auth-gate'])
    assert.ok(css.includes(part),part);
  assert.match(css,/@media\(max-width:920px\)/);
  assert.match(css,/@media\(max-width:540px\)/);
});
test('Embedded TSO tracking hides duplicate community, account and developer pages without disabling real tracking',()=>{
 const css=read('tso2-profile-broadcast.css'),js=read('profile.js'),html=read('profile.html');
 for(const element of ['.edit-profile','.profile-tabs','#communitySection','#devSection'])
   assert.ok(css.includes(element),'must hide '+element);
 assert.match(css,/#signedOut\[hidden\]/);
 assert.match(css,/#profileApp\[hidden\]/);
 assert.match(js,/if\(tso\?\.enabled\)/);
 assert.match(js,/textContent='My Parlays'/);
 assert.match(js,/tso\?\.enabled\?Promise\.resolve\(\[\]\)/);
 assert.match(js,/data-share-track/);
 assert.match(js,/async function refreshRows/);
 assert.match(js,/async function validSession/);
 assert.match(js,/tso\.requestSignIn\(\)/);
 for(const value of ['id="trackingGrid"','id="trackingFilters"','id="refreshTracking"','id="signedOut"'])
  assert.ok(html.includes(value),value);
});
