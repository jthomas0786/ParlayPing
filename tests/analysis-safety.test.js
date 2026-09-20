const test = require('node:test');
const assert = require('node:assert/strict');
const { applyCorrelationSafety, buildPublicReply } = require('../api/lib/analysis-safety');

test('withholds naive combined probability for same-game pending legs', () => {
  const analysis = applyCorrelationSafety({
    counts: { hit: 0, miss: 0, live: 0, pending: 2, unresolved: 0 },
    combinedTailProbability: 0.15,
    combinedTailProbabilityPct: 15,
    tailUrl: 'https://parlayping.net/tail?slip=test',
    results: [
      { id: 'a', player: 'Bijan Robinson', gameId: 'ATL-TB', status: 'PENDING', displayMarket: 'O4.5 REC', probability: 0.5 },
      { id: 'b', player: 'Bijan Robinson', gameId: 'ATL-TB', status: 'PENDING', displayMarket: 'ATD', probability: 0.3 }
    ]
  });

  assert.equal(analysis.correlation.hasRisk, true);
  assert.equal(analysis.correlation.groups[0].type, 'same-player-same-game');
  assert.equal(analysis.combinedTailProbability, null);
  assert.equal(analysis.combinedTailProbabilityMethod, 'withheld-correlated-legs');
  assert.match(buildPublicReply(analysis), /Combined model withheld/);
  assert.doesNotMatch(buildPublicReply(analysis), /15%/);
});

test('keeps independence product when all pending legs are in distinct games', () => {
  const analysis = applyCorrelationSafety({
    counts: { hit: 0, miss: 0, live: 0, pending: 2, unresolved: 0 },
    combinedTailProbability: 0.24,
    combinedTailProbabilityPct: 24,
    tailUrl: 'https://parlayping.net/tail?slip=test',
    results: [
      { id: 'a', player: 'Player One', gameId: 'G1', status: 'PENDING', displayMarket: 'O50.5 REC YDS', probability: 0.6 },
      { id: 'b', player: 'Player Two', gameId: 'G2', status: 'PENDING', displayMarket: 'ATD', probability: 0.4 }
    ]
  });

  assert.equal(analysis.correlation.hasRisk, false);
  assert.equal(analysis.combinedTailProbability, 0.24);
  assert.equal(analysis.combinedTailProbabilityMethod, 'independence-product-distinct-games');
  assert.match(buildPublicReply(analysis), /Remaining model: 24%/);
});
