const test = require('node:test');
const assert = require('node:assert/strict');
const { heuristicParse, dedupeLegs, sanitizeLeg, normalizeMediaUrls, parseSlip } = require('../api/lib/slip-parser');
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

test('dedupes repeated sportsbook UI copies of the same leg', () => {
  const legs = dedupeLegs([
    { player:'Bijan Robinson', market:'receptions', side:'over', line:4.5, inclusive:false, originalText:'Bijan Robinson Over 4.5 Receptions' },
    { player:'Bijan Robinson', market:'receptions', side:'over', line:4.5, inclusive:false, originalText:'Bijan Robinson Over 4.5 Receptions' }
  ]);
  assert.equal(legs.length, 1);
});

test('rejects unsupported or malformed extracted screenshot legs', () => {
  assert.equal(sanitizeLeg({ player:'Bijan Robinson', market:'moneyline', side:'yes', line:null }), null);
  assert.equal(sanitizeLeg({ player:'', market:'atd', side:'yes', line:null }), null);
  assert.equal(sanitizeLeg({ player:'Bijan Robinson', market:'recYds', side:'over', line:'not-a-number' }), null);
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
