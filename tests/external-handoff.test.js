const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { safeReturnUrl, injectReturnControls } = require('../api/share-page-external');

test('Sports Outpost return URL preserves the exact HTTPS page', () => {
  const input = 'https://thesportsoutpost.com/sports.html?view=nfl#betslip';
  assert.equal(safeReturnUrl(input), input);
});

test('www Sports Outpost return URL is allowed', () => {
  const input = 'https://www.thesportsoutpost.com/nfl.html';
  assert.equal(safeReturnUrl(input), input);
});

test('return controls reject open redirects and insecure URLs', () => {
  assert.equal(safeReturnUrl('https://thesportsoutpost.com.evil.example/phish'), null);
  assert.equal(safeReturnUrl('https://evil.example/'), null);
  assert.equal(safeReturnUrl('http://thesportsoutpost.com/'), null);
  assert.equal(safeReturnUrl('javascript:alert(1)'), null);
});

test('ParlayPing page gets both Back and X controls only for a validated return URL', () => {
  const html = '<!doctype html><html><head><style>.x{}</style></head><body><main>Slip</main></body></html>';
  const returned = injectReturnControls(html, 'https://thesportsoutpost.com/nfl.html');
  assert.match(returned, /Back to The Sports Outpost/);
  assert.match(returned, /aria-label="Close ParlayPing and return to The Sports Outpost"/);
  assert.match(returned, /class="with-return"/);
  assert.equal(injectReturnControls(html, null), html);
});

test('Vercel routes generated slips through the external return-aware page', () => {
  const vercel = fs.readFileSync('vercel.json','utf8');
  assert.match(vercel, /api\/share-page-external\?slip=:token/);
});
