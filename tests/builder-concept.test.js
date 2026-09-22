const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('main builder page matches the approved ParlayPing concept surface', () => {
  const html = read('index.html');
  const css = read('styles.css');
  const js = read('app.js');

  assert.match(html, /BUILD\. TWEAK\. SHARE\./);
  assert.match(html, /TAIL\./);
  assert.match(html, /My Parlay/);
  assert.match(html, /Parlay Tune/);
  assert.match(html, /Open This Parlay on Your Sportsbook/);
  assert.match(html, /Open Parlay on/);
  assert.match(html, /Share Your Betslip/);
  assert.match(html, /Similar Parlays/);
  assert.match(html, /Insights/);
  assert.match(html, /Add Another Pick/);
  assert.match(html, /DraftKings/);
  assert.match(html, /FanDuel/);
  assert.match(html, /bet365/);
  assert.match(html, /Caesars/);
  assert.match(html, /ESPN BET/);
  assert.doesNotMatch(html, /Gambly/i);

  assert.match(css, /\.tune-open \.alt-lines/);
  assert.match(css, /\.concept-hero/);
  assert.match(css, /\.sportsbook-grid/);
  assert.match(js, /setTuneState/);
  assert.match(js, /navigator\.share/);
  assert.match(js, /localStorage\.setItem/);
});

test('builder work does not replace the signed shared-slip renderer', () => {
  const renderer = read('server/api/share-page.js');
  assert.match(renderer, /Best Book for This Parlay/);
  assert.match(renderer, /SHARE YOUR BETSLIP/);
  assert.match(renderer, /decodeShareSlip/);
});
