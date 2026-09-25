const test = require('node:test');
const assert = require('node:assert/strict');
const { overlayLiveResults } = require('../server/api/lib/parlay-engine-live');

const finalSnapshot = {
  generatedAt: '2026-09-25T03:19:01.204Z',
  games: {
    '401872948': {
      status: 'post',
      awayAbbr: 'ATL',
      homeAbbr: 'GB',
      playerStats: {
        byId: {
          '4572680': {
            id: '4572680',
            name: 'Tucker Kraft',
            team: 'GB',
            flat: { receptions: '4', recYds: '47', rushTds: '0', recTds: '0' }
          },
          '4360248': {
            id: '4360248',
            name: 'Kyle Pitts',
            team: 'ATL',
            flat: { receptions: '1', recYds: '5', rushTds: '0', recTds: '0' }
          }
        },
        byName: {}
      }
    }
  }
};

test('final live box score resolves previously unresolved ATD legs with explicit zero TDs', () => {
  const results = overlayLiveResults([
    { id:'kraft', gameId:'401872948', team:'GB', player:'Tucker Kraft', market:'atd', status:'UNRESOLVED', current:0 },
    { id:'pitts', gameId:'401872948', team:'ATL', player:'Kyle Pitts', market:'atd', status:'UNRESOLVED', current:0 },
  ], finalSnapshot);

  assert.deepEqual(results.map(row => row.status), ['MISS', 'MISS']);
  assert.deepEqual(results.map(row => row.current), [0, 0]);
  assert.ok(results.every(row => row.gameState === 'post'));
  assert.ok(results.every(row => row.liveData === true));
});

test('final settlement still refuses to fabricate a miss when exact TD fields are absent', () => {
  const partial = JSON.parse(JSON.stringify(finalSnapshot));
  partial.games['401872948'].playerStats.byId['4360248'].flat = { receptions:'1', recYds:'5' };

  const [result] = overlayLiveResults([
    { id:'pitts', gameId:'401872948', team:'ATL', player:'Kyle Pitts', market:'atd', status:'UNRESOLVED', current:0 },
  ], partial);

  assert.equal(result.status, 'UNRESOLVED');
  assert.equal(result.current, null);
  assert.equal(result.liveData, false);
  assert.equal(result.liveDataUnavailableReason, 'market-not-found-in-live-box-score');
});
