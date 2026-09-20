const test = require('node:test');
const assert = require('node:assert/strict');
const { gradeLeg, currentValue } = require('../api/lib/ncaaf-engine');

test('grades inclusive NCAAF receiving-yard milestone as hit', () => {
  const leg = { market:'recYds', side:'over', line:40, inclusive:true };
  assert.equal(gradeLeg(leg, 40, 'post'), 'HIT');
  assert.equal(gradeLeg(leg, 39, 'post'), 'MISS');
});

test('keeps unfinished milestone live until reached', () => {
  const leg = { market:'recYds', side:'over', line:50, inclusive:true };
  assert.equal(gradeLeg(leg, 37, 'in'), 'LIVE');
  assert.equal(gradeLeg(leg, 50, 'in'), 'HIT');
});

test('grades NCAAF under without prematurely marking hit', () => {
  const leg = { market:'recYds', side:'under', line:49.5, inclusive:false };
  assert.equal(gradeLeg(leg, 22, 'in'), 'LIVE');
  assert.equal(gradeLeg(leg, 50, 'in'), 'MISS');
  assert.equal(gradeLeg(leg, 22, 'post'), 'HIT');
});

test('anytime touchdown combines rushing and receiving touchdowns', () => {
  assert.equal(currentValue({ rushTds:1, recTds:0 }, 'atd'), 1);
  assert.equal(currentValue({ rushTds:0, recTds:2 }, 'atd'), 2);
});
