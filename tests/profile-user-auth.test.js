const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {isDeveloperUser}=require('../server/api/account-router');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('account page is a normal ParlayPing user login, not a developer console',()=>{
  const html=read('account.html');
  const js=read('account.js');
  assert.match(html,/Track every slip in one place\./);
  assert.match(html,/Create your profile/);
  assert.doesNotMatch(html,/Developer Account/);
  assert.doesNotMatch(html,/API Keys/);
  assert.doesNotMatch(js,/api-keys/);
});

test('Dev tab sits beside Community on the profile and is hidden by default',()=>{
  const html=read('profile.html');
  assert.match(html,/data-profile-tab="community">Community<\/button>\s*<button id="devTab"[^>]*data-profile-tab="dev" hidden>Dev<\/button>/);
  assert.match(html,/id="devSection"[^>]*hidden/);
  assert.match(html,/profile-dev\.js/);
});

test('developer access is bound to the canonical ParlayPing owner account',()=>{
  const prior=process.env.PARLAYPING_DEV_USER_ID;
  delete process.env.PARLAYPING_DEV_USER_ID;
  assert.equal(isDeveloperUser({id:'a08636ec-508e-457d-8e5a-400a0ec39729'}),true);
  assert.equal(isDeveloperUser({id:'11111111-1111-1111-1111-111111111111'}),false);
  if(prior===undefined)delete process.env.PARLAYPING_DEV_USER_ID;else process.env.PARLAYPING_DEV_USER_ID=prior;
});

test('developer API routes enforce the server-side owner guard',()=>{
  const router=read('server/api/account-router.js');
  assert.match(router,/requireDeveloper\(user\)/);
  assert.match(router,/Developer access is restricted to the ParlayPing account/);
  assert.match(router,/isDeveloper/);
});
