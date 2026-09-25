const test = require('node:test');
const assert = require('node:assert/strict');
const { refreshProgressText } = require('../server/api/lib/share-hydrate');

test('live numeric progress replaces stale stored progress text', () => {
  const slip = {
    legs: [
      { id:'pitts', market:'receptions', current:1, target:5, progressText:'0 / 5 receptions' },
      { id:'golden', market:'recYds', current:45, target:40, progressText:'0 / 40 yards' },
      { id:'bijan', market:'rushRecYds', current:102, target:100, progressText:'0 / 100 yards' },
    ],
  };
  const next = refreshProgressText(slip);
  assert.equal(next.legs[0].progressText, '1 / 5 receptions');
  assert.equal(next.legs[1].progressText, '45 / 40 yards');
  assert.equal(next.legs[2].progressText, '102 / 100 yards');
});

test('existing nonnumeric progress text remains a fallback when values are unavailable', () => {
  const slip = { legs:[{ id:'x', market:'custom', current:null, target:null, progressText:'Awaiting official stats' }] };
  const next = refreshProgressText(slip);
  assert.equal(next.legs[0].progressText, 'Awaiting official stats');
});
