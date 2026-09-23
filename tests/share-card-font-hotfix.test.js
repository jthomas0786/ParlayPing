const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const shareCardSource = fs.readFileSync(require.resolve('../server/api/share-card'), 'utf8');
const builderPageSource = fs.readFileSync(require.resolve('../server/api/builder-page'), 'utf8');
const xShareSource = fs.readFileSync(require.resolve('../server/api/lib/x-share-bundle'), 'utf8');

test('share card renderer uses deterministic Inter font via Resvg', () => {
  assert.match(shareCardSource, /SHARE_FONT_URL/);
  assert.match(shareCardSource, /fontFiles:\[fontFile\]/);
  assert.match(shareCardSource, /defaultFontFamily:'Inter'/);
  assert.match(shareCardSource, /forceShareFont/);
});

test('share card cache versions were bumped after renderer hotfix', () => {
  assert.match(builderPageSource, /20260923e/);
  assert.match(xShareSource, /20260923e/);
});
