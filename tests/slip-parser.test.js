const test = require('node:test');
const assert = require('node:assert/strict');
const { heuristicParse, dedupeLegs, sanitizeLeg, normalizeMediaUrls, parseSlip } = require('../api/lib/slip-parser');
const { normalizeLeg, encodeSlip } = require('../api/lib/parlay-engine');
const { fairProbability, desiredBookLine } = require('../api/lib/ncaaf-engine');
const { normalizeUniversalLeg } = require('../api/lib/sport-router');

test('parses common NFL alt receiving yard leg', () => {
  const [leg] = heuristicParse('Jordan Addison 50+ receiving yards');
  assert.ok(leg);
  assert.equal(leg.player, 'Jordan Addison');
  assert.equal(leg.market, 'recYds');
  assert.equal(leg.side, 'over');
  assert.equal(leg.line, 50);
  assert.equal(leg.inclusive, true);
  assert.equal(leg.sport, 'NFL');
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

test('heuristic marks explicit college football text as NCAAF', () => {
  const [leg] = heuristicParse('NCAAF\nJaleel Skinner 40+ receiving yards');
  assert.ok(leg);
  assert.equal(leg.sport, 'NCAAF');
  assert.equal(leg.player, 'Jaleel Skinner');
  assert.equal(leg.line, 40);
});

test('normalizer converts market alias and team', () => {
  const leg = normalizeLeg({ sport:'nfl', player:'Bijan Robinson', team:'atl', market:'receiving yards', side:'OVER', line:49.5 }, 0);
  assert.equal(leg.sport, 'NFL');
  assert.equal(leg.team, 'ATL');
  assert.equal(leg.market, 'recYds');
  assert.equal(leg.side, 'over');
});

test('universal router normalizes college football aliases', () => {
  const leg = normalizeUniversalLeg({ sport:'CFB', player:'Jaleel Skinner', market:'recYds', side:'over', line:40, inclusive:true }, 0);
  assert.equal(leg.sport, 'NCAAF');
  assert.equal(leg.player, 'Jaleel Skinner');
});

test('encoded slip contains versioned legs payload', () => {
  const token = encodeSlip([{ player:'Bijan Robinson', market:'atd', sport:'NFL' }]);
  const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  assert.equal(decoded.v, 1);
  assert.equal(decoded.legs[0].player, 'Bijan Robinson');
});

test('dedupes repeated sportsbook UI copies of the same leg', () => {
  const legs = dedupeLegs([
    { sport:'NFL', player:'Bijan Robinson', market:'receptions', side:'over', line:4.5, inclusive:false, originalText:'Bijan Robinson Over 4.5 Receptions' },
    { sport:'NFL', player:'Bijan Robinson', market:'receptions', side:'over', line:4.5, inclusive:false, originalText:'Bijan Robinson Over 4.5 Receptions' }
  ]);
  assert.equal(legs.length, 1);
});

test('same selection in different sports is not deduped together', () => {
  const legs = dedupeLegs([
    { sport:'NFL', player:'Alex Smith', market:'passYds', side:'over', line:200.5, inclusive:false },
    { sport:'NCAAF', player:'Alex Smith', market:'passYds', side:'over', line:200.5, inclusive:false }
  ]);
  assert.equal(legs.length, 2);
});

test('rejects unsupported or malformed extracted screenshot legs', () => {
  assert.equal(sanitizeLeg({ sport:'NFL', player:'Bijan Robinson', market:'moneyline', side:'yes', line:null }), null);
  assert.equal(sanitizeLeg({ sport:'NFL', player:'', market:'atd', side:'yes', line:null }), null);
  assert.equal(sanitizeLeg({ sport:'NFL', player:'Bijan Robinson', market:'recYds', side:'over', line:'not-a-number' }), null);
});

test('NCAAF milestone lines map to conventional half-yard sportsbook lines', () => {
  assert.equal(desiredBookLine({ market:'recYds', side:'over', line:40, inclusive:true }), 39.5);
  assert.equal(desiredBookLine({ market:'recYds', side:'over', line:40.5, inclusive:false }), 40.5);
});

test('NCAAF two-way market price is de-vigged', () => {
  const row = { overPrice:-110, underPrice:-110 };
  assert.equal(Math.round(fairProbability(row,'over') * 1000) / 1000, 0.5);
});

test('only accepts safe screenshot image inputs and caps at four', () => {
  const urls = normalizeMediaUrls([
    'https://pbs.twimg.com/media/one.jpg',
    'http://example.com/nope.jpg',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'https://pbs.twimg.com/media/two.jpg',
    'https://pbs.twimg.com/media/three.jpg',
    'https://pbs.twimg.com/media/four.jpg'
  ]);
  assert.equal(urls.length, 4);
  assert.equal(urls[0], 'https://pbs.twimg.com/media/one.jpg');
  assert.match(urls[1], /^data:image\/png;base64,/);
});

test('marks image parsing as unconfigured when no OpenAI key is present', async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const result = await parseSlip({ text:'', mediaUrls:['https://pbs.twimg.com/media/slip.jpg'] });
    assert.equal(result.method, 'vision-unconfigured');
    assert.equal(result.mediaCount, 1);
    assert.equal(result.visionConfigured, false);
    assert.equal(result.legs.length, 0);
  } finally {
    if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
  }
});
