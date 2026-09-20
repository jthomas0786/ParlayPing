const test = require('node:test');
const assert = require('node:assert/strict');
const { applyCorrelationSafety, replyReadiness, buildPublicReply, xWeightedLength } = require('../api/lib/analysis-safety');

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

test('blocks public reply whenever any extracted leg is unresolved', () => {
  const analysis = applyCorrelationSafety({
    counts: { hit: 0, miss: 0, live: 0, pending: 1, unresolved: 1 },
    combinedTailProbability: 0.55,
    results: [
      { id: 'a', player: 'Known Player', gameId: 'G1', status: 'PENDING', displayMarket: 'ATD', probability: 0.55 },
      { id: 'b', player: 'Unknown Player', status: 'UNRESOLVED', displayMarket: 'O50.5 REC YDS', probability: null }
    ]
  });

  const readiness = replyReadiness(analysis);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.reason, 'unresolved-legs');
  assert.equal(readiness.unresolvedCount, 1);
  assert.equal(buildPublicReply(analysis), null);
});

test('allows public reply only when all analyzed legs resolve', () => {
  const analysis = applyCorrelationSafety({
    counts: { hit: 0, miss: 0, live: 0, pending: 1, unresolved: 0 },
    combinedTailProbability: 0.55,
    results: [
      { id: 'a', player: 'Known Player', gameId: 'G1', status: 'PENDING', displayMarket: 'ATD', probability: 0.55 }
    ]
  });

  const readiness = replyReadiness(analysis);
  const reply = buildPublicReply(analysis);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.unresolvedCount, 0);
  assert.match(reply, /ParlayPing Live/);
  assert.doesNotMatch(reply, /Reply STOP to opt out/);
});

test('never truncates the Tail URL when compacting an X reply', () => {
  const tailUrl = `https://parlayping.net/tail?slip=${'x'.repeat(900)}`;
  const analysis = applyCorrelationSafety({
    counts: { hit: 0, miss: 0, live: 0, pending: 3, unresolved: 0 },
    combinedTailProbability: 0.123,
    tailUrl,
    results: [
      { id:'1', player:'A Very Long Player Name One', gameId:'G1', status:'PENDING', displayMarket:'O123.5 RECEIVING YARDS', probability:0.51 },
      { id:'2', player:'A Very Long Player Name Two', gameId:'G2', status:'PENDING', displayMarket:'O234.5 PASSING YARDS', probability:0.52 },
      { id:'3', player:'A Very Long Player Name Three', gameId:'G3', status:'PENDING', displayMarket:'O45.5 RUSHING YARDS', probability:0.53 }
    ]
  });
  const reply = buildPublicReply(analysis, {maxLegs:3});
  assert.ok(reply.includes(tailUrl));
  assert.doesNotMatch(reply, /Reply STOP to opt out/);
  assert.ok(xWeightedLength(reply) <= 275);
});
