const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function read(name){return fs.readFileSync(path.join(__dirname,'..',name),'utf8');}

test('Tracking cards use the approved ParlayPing watermark and linked brand lockup',()=>{
  const html=read('profile.html');
  const css=read('tracking-branding.css');
  const js=read('tracking-branding.js');
  assert.match(html,/tracking-branding\.css/);
  assert.match(html,/tracking-branding\.js/);
  assert.match(css,/parlayping-approved-hero\.webp/);
  assert.match(css,/tracking-card::after/);
  assert.match(css,/opacity:\.075/);
  assert.match(js,/parlayping-approved-wordmark\.webp/);
  assert.match(js,/tracking-brand/);
  assert.match(js,/https:\/\/parlayping\.net/);
  assert.match(js,/ParlayPing\.net/);
});
