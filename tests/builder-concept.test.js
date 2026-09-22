const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(file){return fs.readFileSync(path.join(__dirname,'..',file),'utf8');}

test('marketing homepage is restored and does not contain the builder concept',()=>{
  const html=read('index.html');
  assert.match(html,/See the bet\./);
  assert.match(html,/Tag it\. Track it\. Tail what's left\./);
  assert.doesNotMatch(html,/BUILD\. TWEAK\. SHARE\./);
});

test('social builder template matches the approved concept surface',()=>{
  const html=read('builder-template.html');
  const css=read('builder.css');
  const js=read('builder-runtime.js');
  assert.match(html,/BUILD\. TWEAK\. SHARE\./);
  assert.match(html,/My Parlay/);
  assert.match(html,/Parlay Tune/);
  assert.match(html,/Open This Parlay on Your Sportsbook/);
  assert.match(html,/Share Your Betslip/);
  assert.match(html,/Similar Parlays/);
  assert.match(html,/Insights/);
  assert.doesNotMatch(html,/Gambly/i);
  assert.match(css,/\.tune-open \.alt-lines/);
  assert.match(js,/__PARLAYPING_BUILDER__/);
  assert.match(js,/setTuneState/);
  assert.match(js,/navigator\.share/);
});

test('build route is separate from the signed shared-slip route',()=>{
  const vercel=read('vercel.json');
  const dispatcher=read('api/index.js');
  const shared=read('server/api/share-page.js');
  const builder=read('server/api/builder-page.js');
  assert.match(vercel,/\/build\/:token/);
  assert.match(vercel,/builder-page/);
  assert.match(vercel,/\/slip\/:token/);
  assert.match(dispatcher,/builder-page/);
  assert.match(builder,/decodeShareSlip/);
  assert.match(builder,/builder-template\.html/);
  assert.match(shared,/Best Book for This Parlay/);
});
