const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const shareCardSource = fs.readFileSync(require.resolve('../server/api/share-card'), 'utf8');
const builderPageSource = fs.readFileSync(require.resolve('../server/api/builder-page'), 'utf8');
const xShareSource = fs.readFileSync(require.resolve('../server/api/lib/x-share-bundle'), 'utf8');
const { renderPng } = require('../server/api/share-card');

test('share card renderer uses deterministic Inter font via Resvg', () => {
  assert.match(shareCardSource, /SHARE_FONT_URL/);
  assert.match(shareCardSource, /fontFiles:\[fontFile\]/);
  assert.match(shareCardSource, /defaultFontFamily:'Inter'/);
  assert.match(shareCardSource, /forceShareFont/);
});

test('share card renderer produces a real PNG with packaged font path', async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#071725"/><text x="80" y="170" font-family="Arial,sans-serif" font-size="72" font-weight="800" fill="#fff">ParlayPing Live</text><text x="80" y="270" font-family="Arial,sans-serif" font-size="48" fill="#fff">Reese O15.5 PTS · 52%</text></svg>`;
  const png = await renderPng(svg);
  assert.ok(Buffer.isBuffer(png));
  assert.equal(png.subarray(1,4).toString('ascii'), 'PNG');
  assert.ok(png.length > 10000, `PNG unexpectedly small: ${png.length}`);
});

test('share card cache versions were bumped after renderer hotfix', () => {
  assert.match(builderPageSource, /20260924g/);
  assert.match(xShareSource, /20260924g/);
});
