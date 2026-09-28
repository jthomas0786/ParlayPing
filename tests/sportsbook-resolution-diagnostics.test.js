const test = require('node:test');
const assert = require('node:assert/strict');

const { buildResolutionDiagnostics } = require('../server/api/lib/exact-selection-validation');
const { finalizeResolution } = require('../server/api/sportsbook-link');

function leg(overrides = {}) {
  return {
    sport: 'NFL',
    player: 'Patrick Mahomes',
    market: 'passYds',
    side: 'over',
    line: 225,
    inclusive: true,
    ...overrides,
  };
}

function selection(overrides = {}) {
  return {
    player: 'Patrick Mahomes',
    marketKey: 'player_pass_yds_alternate',
    side: 'Over',
    line: 224.5,
    price: -130,
    selectionLink: 'https://sportsbook.fanduel.com/example',
    selectionId: 'selection-1',
    marketId: 'market-1',
    ...overrides,
  };
}

test('diagnostics distinguish a missing selection from a wrong line', () => {
  const missing = buildResolutionDiagnostics([leg()], [], { book: 'FanDuel' });
  assert.equal(missing.code, 'INCOMPLETE_EXACT_COVERAGE');
  assert.equal(missing.legs[0].code, 'SELECTION_NOT_FOUND');

  const mismatch = buildResolutionDiagnostics(
    [leg({ inclusive: false })],
    [selection()],
    { book: 'FanDuel' }
  );
  assert.equal(mismatch.code, 'INCOMPLETE_EXACT_COVERAGE');
  assert.equal(mismatch.legs[0].code, 'LINE_MISMATCH');
  assert.equal(mismatch.legs[0].requestedLine, 225);
  assert.equal(mismatch.legs[0].resolvedLine, 224.5);
});

test('diagnostics report exact price coverage separately from exact selection coverage', () => {
  const diagnostics = buildResolutionDiagnostics(
    [leg()],
    [selection({ price: null })],
    { book: 'FanDuel' }
  );
  assert.equal(diagnostics.exactCoverage.matched, 1);
  assert.equal(diagnostics.pricedCoverage.matched, 0);
  assert.equal(diagnostics.code, 'EXACT_PRICE_COVERAGE_INCOMPLETE');
  assert.equal(diagnostics.legs[0].code, 'PRICE_MISSING');
});

test('exact selections stay exact when a combined deeplink cannot be composed', () => {
  const result = finalizeResolution([leg()], { selections: [selection()], url: null }, 'FanDuel');
  assert.equal(result.exact, true);
  assert.equal(result.prefilled, false);
  assert.equal(result.url, null);
  assert.equal(result.diagnostics.code, 'EXACT_COVERAGE_DEEPLINK_UNAVAILABLE');
  assert.equal(result.diagnostics.pricedCoverage.matched, 1);
});

test('verified exact selections with a safe combined deeplink report prefilled success', () => {
  const url = 'https://account.sportsbook.fanduel.com/sportsbook/addToBetslip?marketId%5B0%5D=market-1&selectionId%5B0%5D=selection-1';
  const result = finalizeResolution([leg()], { selections: [selection()], url }, 'FanDuel');
  assert.equal(result.exact, true);
  assert.equal(result.prefilled, true);
  assert.equal(result.url, url);
  assert.equal(result.diagnostics.code, 'EXACT_PREFILLED');
  assert.deepEqual(result.diagnostics.providerReferenceCoverage, { matched: 1, total: 1 });
});
