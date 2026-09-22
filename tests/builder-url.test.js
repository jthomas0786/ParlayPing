const test = require('node:test');
const assert = require('node:assert/strict');

const { buildBuilderUrl } = require('../api/lib/builder-url');

test('signed builder URLs use the canonical /build/s route', () => {
  assert.equal(
    buildBuilderUrl('s1.payload.signature', 'https://parlayping.net/'),
    'https://parlayping.net/build/s/s1.payload.signature',
  );
});
