const test = require('node:test');
const assert = require('node:assert/strict');

const shareAssets = require('../server/api/lib/share-assets');
const headshots = require('../server/api/lib/headshot-ensure');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers:{ 'content-type':'application/json' },
  });
}

function imageResponse(status = 200) {
  return new Response(Buffer.from([0x89,0x50,0x4e,0x47]), {
    status,
    headers:{ 'content-type':'image/png' },
  });
}

async function withFetch(mock, task) {
  const original = global.fetch;
  global.fetch = mock;
  try { return await task(); }
  finally { global.fetch = original; }
}

test('ESPN summary parser includes roster athletes even before boxscore stats exist', () => {
  const parsed = shareAssets.parseSummaryPlayers({
    header:{ competitions:[{ competitors:[{ team:{ abbreviation:'LVA', displayName:'Las Vegas Aces' } }] }] },
    rosters:[{
      team:{ abbreviation:'LVA' },
      roster:[{ athlete:{ id:'4065870', displayName:'Jackie Young', headshot:{ href:'https://a.espncdn.com/i/headshots/wnba/players/full/4065870.png' } } }],
    }],
  }, 'WNBA');
  assert.equal(parsed.players.length, 1);
  assert.equal(parsed.players[0].name, 'Jackie Young');
  assert.equal(parsed.players[0].id, '4065870');
  assert.match(parsed.players[0].headshot, /4065870\.png$/);
});

test('ParlayAPI numeric game id cannot block resolving the real ESPN event and headshot', async () => {
  const realEvent = {
    id:'401810360',
    date:'2026-09-23T02:00:00Z',
    competitions:[{ competitors:[
      { team:{ abbreviation:'SEA', displayName:'Seattle Storm' } },
      { team:{ abbreviation:'LVA', displayName:'Las Vegas Aces' } },
    ] }],
  };
  const realSummary = {
    header:{ competitions:[{ date:'2026-09-23T02:00:00Z', competitors:realEvent.competitions[0].competitors }] },
    rosters:[{
      team:{ abbreviation:'LVA' },
      roster:[{ athlete:{ id:'4065870', displayName:'Jackie Young', headshot:{ href:'https://a.espncdn.com/i/headshots/wnba/players/full/4065870.png' } } }],
    }],
  };

  await withFetch(async url => {
    const href = String(url);
    if (href.includes('summary?event=999999999')) return jsonResponse({}, 404);
    if (href.includes('/scoreboard?')) return jsonResponse({ events:[realEvent] });
    if (href.includes('summary?event=401810360')) return jsonResponse(realSummary);
    if (href.includes('4065870.png')) return imageResponse();
    throw new Error(`Unexpected fetch ${href}`);
  }, async () => {
    const result = await shareAssets.enrichShareAssets({ legs:[{
      sport:'WNBA',
      player:'Jackie Young',
      team:'LVA',
      gameId:'999999999',
      matchup:'SEA @ LVA',
      startTimeUTC:'2026-09-23T02:00:00Z',
    }] });
    assert.equal(result.legs[0].espnGameId, '401810360');
    assert.equal(result.legs[0].playerId, '4065870');
    assert.match(result.legs[0].playerImageUrl, /4065870\.png$/);
  });
});

test('global ESPN player search supplies a trusted headshot when game data has none', async () => {
  await withFetch(async url => {
    const href = String(url);
    if (href.includes('/search') && href.includes('Test%20Player')) {
      return jsonResponse({ results:[{ displayName:'Test Player', id:'12345', headshot:{ href:'https://a.espncdn.com/i/headshots/nfl/players/full/12345.png' } }] });
    }
    if (href.includes('12345.png')) return imageResponse();
    throw new Error(`Unexpected fetch ${href}`);
  }, async () => {
    const result = await headshots.ensureHeadshots({ legs:[{ sport:'NFL', player:'Test Player' }] });
    assert.equal(result.legs[0].playerImageUrl, 'https://a.espncdn.com/i/headshots/nfl/players/full/12345.png');
  });
});

test('MLB official player search is used when ESPN search has no usable player image', async () => {
  await withFetch(async url => {
    const href = String(url);
    if (href.includes('site.web.api.espn.com/apis/') && href.includes('Fallback%20Hitter')) return jsonResponse({ results:[] });
    if (href.includes('statsapi.mlb.com/api/v1/people/search')) {
      return jsonResponse({ people:[{ id:777777, fullName:'Fallback Hitter' }] });
    }
    if (href.includes('mlbstatic.com') && href.includes('/people/777777/')) return imageResponse();
    throw new Error(`Unexpected fetch ${href}`);
  }, async () => {
    const result = await headshots.ensureHeadshots({ legs:[{ sport:'MLB', player:'Fallback Hitter' }] });
    assert.match(result.legs[0].playerImageUrl, /mlbstatic\.com/);
    assert.match(result.legs[0].playerImageUrl, /777777/);
  });
});

test('random third-party portrait URLs are never accepted as trusted player headshots', () => {
  assert.equal(headshots.isTrustedImageUrl('https://random-example.com/player.png'), false);
  assert.equal(headshots.isTrustedImageUrl('https://a.espncdn.com/i/headshots/nfl/players/full/12345.png'), true);
  assert.equal(headshots.isTrustedImageUrl('https://cdn.nba.com/headshots/nba/latest/1040x760/123.png'), true);
  assert.equal(headshots.isTrustedImageUrl('https://img.mlbstatic.com/mlb-photos/image/upload/test.png'), true);
});
