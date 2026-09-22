const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('public homepage remains the original ParlayPing marketing surface', () => {
  const html = read('index.html');
  assert.match(html, /See the bet\./);
  assert.match(html, /Ping what’s left\./);
  assert.doesNotMatch(html, /BUILD\. TWEAK\. SHARE\. TAIL\./);
  assert.doesNotMatch(html, /My Parlay/);
});

test('signed builder route owns the approved ParlayPing concept surface', () => {
  const template = read('server/templates/builder-template.html');
  const css = read('builder-assets/styles.css');
  const js = read('builder-assets/app.js');
  const route = read('server/api/builder-page.js');
  const vercel = read('vercel.json');

  assert.match(template, /BUILD\. TWEAK\. SHARE\./);
  assert.match(template, /TAIL\./);
  assert.match(template, /My Parlay/);
  assert.match(template, /Parlay Tune/);
  assert.match(template, /Open This Parlay on Your Sportsbook/);
  assert.match(template, /Share Your Betslip/);
  assert.match(template, /Similar Parlays/);
  assert.match(template, /Insights/);
  assert.doesNotMatch(template, /Gambly/i);

  assert.match(css, /\.tune-open \.alt-lines/);
  assert.match(css, /\.concept-hero/);
  assert.match(css, /\.sportsbook-grid/);
  assert.match(js, /pp-builder-data/);
  assert.match(js, /renderSlip/);
  assert.match(js, /navigator\.share/);
  assert.match(js, /combinedOddsVerified/);
  assert.doesNotMatch(js, /93\.7\s*\/\s*100/);

  assert.match(route, /decodeShareSlip/);
  assert.match(route, /hydrateSharedSlip/);
  assert.match(route, /buildBuilderUrl/);
  assert.match(route, /twitter:card/);
  assert.match(vercel, /"source": "\/build\/s\/:token"/);
  assert.match(vercel, /__pp_route=builder-page/);
});

test('legacy signed slip renderer remains available separately', () => {
  const renderer = read('server/api/share-page.js');
  const vercel = read('vercel.json');
  assert.match(renderer, /Best Book for This Parlay/);
  assert.match(renderer, /SHARE YOUR BETSLIP/);
  assert.match(renderer, /decodeShareSlip/);
  assert.match(vercel, /"source": "\/slip\/:token"/);
  assert.match(vercel, /__pp_route=share-page/);
});
