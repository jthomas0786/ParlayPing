const test = require('node:test');
const assert = require('node:assert/strict');
const nfl = require('../server/api/lib/nfl-headshot-fallback');

function imageResponse() {
  return new Response(Buffer.from([0x89,0x50,0x4e,0x47]), { status:200, headers:{ 'content-type':'image/png' } });
}

async function withFetch(mock, task) {
  const original = global.fetch;
  global.fetch = mock;
  try { return await task(); }
  finally { global.fetch = original; }
}

test('NFL roster fallback resolves an NFL-hosted headshot by exact player and team', async () => {
  const chiefs = 'https://static.www.nfl.com/image/upload/f_auto,q_auto/league/testchiefs';
  const bills = 'https://static.www.nfl.com/image/upload/f_auto,q_auto/league/testbills';
  const csv = [
    'season,team,full_name,headshot_url',
    `2026,BUF,Roster Receiver,${bills}`,
    `2026,KC,Roster Receiver,${chiefs}`,
  ].join('\n');

  await withFetch(async url => {
    const href = String(url);
    if (href.includes('nflverse-data/releases/download/rosters/roster_2026.csv')) {
      return new Response(csv, { status:200, headers:{ 'content-type':'text/csv' } });
    }
    if (href === chiefs || href === bills) return imageResponse();
    throw new Error(`Unexpected fetch ${href}`);
  }, async () => {
    const result = await nfl.searchNflRosterHeadshot('Roster Receiver', 'KC', 2026);
    assert.equal(result, chiefs);
  });
});

test('NFL fallback only fills a leg that still lacks a player image', async () => {
  const existing = 'https://a.espncdn.com/i/headshots/nfl/players/full/123.png';
  const slip = await nfl.ensureNflOfficialHeadshots({ legs:[{ sport:'NFL', player:'Existing Player', team:'KC', playerImageUrl:existing }] });
  assert.equal(slip.legs[0].playerImageUrl, existing);
});
