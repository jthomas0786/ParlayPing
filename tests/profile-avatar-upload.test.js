const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function read(name){return fs.readFileSync(path.join(__dirname,'..',name),'utf8');}

test('account profile supports choosing a profile picture from the device',()=>{
  const html=read('account.html');
  const js=read('account.js');
  assert.match(html,/id="avatarFile"[^>]*type="file"[^>]*accept="image\/\*"/);
  assert.match(html,/Choose from device/);
  assert.doesNotMatch(html,/>Avatar image URL</);
  assert.match(js,/function normalizeAvatar\(/);
  assert.match(js,/canvas\.toBlob\(resolve,'image\/jpeg'/);
  assert.match(js,/storage\/v1\/object\/\$\{AVATAR_BUCKET\}/);
  assert.match(js,/'x-upsert':'true'/);
  assert.match(js,/avatar_url:avatarUrl/);
  assert.doesNotThrow(()=>new Function(js));
});

test('uploaded avatar is rendered on both Account and Tracking profile views',()=>{
  const accountJs=read('account.js');
  const profileJs=read('profile.js');
  const accountCss=read('account.css');
  const profileCss=read('profile.css');
  assert.match(accountJs,/paintAvatar\(\$\('accountAvatar'\),name,avatar\)/);
  assert.match(accountJs,/paintAvatar\(\$\('avatarEditorPreview'\),name,avatar\)/);
  assert.match(profileJs,/paintAvatar\(\$\('profileAvatar'\),name,profile\?\.avatar_url\)/);
  assert.match(accountCss,/account-avatar img/);
  assert.match(profileCss,/\.avatar img/);
  assert.doesNotThrow(()=>new Function(profileJs));
});

test('avatar storage is user-scoped and only accepts optimized JPEG uploads',()=>{
  const sql=read('sql/profile-avatar-storage.sql');
  assert.match(sql,/profile-avatars/);
  assert.match(sql,/2097152/);
  assert.match(sql,/image\/jpeg/);
  assert.match(sql,/storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  assert.match(sql,/for insert to authenticated/i);
  assert.match(sql,/for update to authenticated/i);
});
