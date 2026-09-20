const test = require('node:test');
const assert = require('node:assert/strict');
const { heuristicParse } = require('../api/lib/slip-parser');
const { normalizeLeg, encodeSlip } = require('../api/lib/parlay-engine');

test('parses common NFL alt receiving yard leg', () => {
  const [leg] = heuristicParse('Jordan Addison 50+ receiving yards');
  assert.ok(leg);
  assert.equal(leg.player, 'Jordan Addison');
  assert.equal(leg.market, 'recYds');
  assert.equal(leg.side, 'over');
  assert.equal(leg.line, 50);
  assert.equal(leg.inclusive, true);
});

test('parses sportsbook over line', () => {
  const [leg] = heuristicParse('Travis Kelce Over 59.5 Receiving Yards');
  assert.ok(leg);
  assert.equal(leg.player, 'Travis Kelce');
  assert.equal(leg.market, 'recYds');
  assert.equal(leg.side, 'over');
  assert.equal(leg.line, 59.5);
  assert.equal(leg.inclusive, false);
});

test('parses sportsbook under line', () => {
  const [leg] = heuristicParse('Patrick Mahomes Under 2.5 passing touchdowns');
  assert.ok(leg);
  assert.equal(leg.player, 'Patrick Mahomes');
  assert.equal(leg.market, 'passTds');
  assert.equal(leg.side, 'under');
  assert.equal(leg.line, 2.5);
});

test('parses anytime touchdown', () => {
  const [leg] = heuristicParse('Bijan Robinson Anytime TD');
  assert.ok(leg);
  assert.equal(leg.player, 'Bijan Robinson');
  assert.equal(leg.market, 'atd');
  assert.equal(leg.side, 'yes');
  assert.equal(leg.line, null);
});

test('parses multiple newline-separated legs', () => {
  const legs = heuristicParse('Bijan Robinson ATD\nKyle Pitts 50+ receiving yards\nMichael Penix Jr. O 249.5 passing yards');
  assert.equal(legs.length, 3);
  assert.equal(legs[2].market, 'passYds');
  assert.equal(legs[2].line, 249.5);
});

test('normalizer converts market alias and team', () => {
  const leg = normalizeLeg({ sport:'nfl', player:'Bijan Robinson', team:'atl', market:'receiving yards', side:'OVER', line:49.5 }, 0);
  assert.equal(leg.sport, 'NFL');
  assert.equal(leg.team, 'ATL');
  assert.equal(leg.market, 'recYds');
  assert.equal(leg.side, 'over');
});

test('encoded slip contains versioned legs payload', () => {
  const token = encodeSlip([{ player:'Bijan Robinson', market:'atd', sport:'NFL' }]);
  const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  assert.equal(decoded.v, 1);
  assert.equal(decoded.legs[0].player, 'Bijan Robinson');
});
