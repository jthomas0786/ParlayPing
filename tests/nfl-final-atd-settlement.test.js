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
            flat: { receptions: '4', recYds: '47', recTds: '0' }
          },
          '4360248': {
            id: '4360248',
            name: 'Kyle Pitts',
            team: 'ATL',
            flat: { receptions: '1', recYds: '5', recTds: '0' }
          },
          '3043275': {
            id: '3043275',
            name: 'Austin Hooper',
            team: 'ATL',
            flat: { receptions: '2', recYds: '11' }
          }
        },
        byName: {}
      },
      scoringPlays: [
        { team:'GB', type:'Passing Touchdown', text:'J.Love pass short middle complete. Catch made by C.Watson for 4 yards. TOUCHDOWN.' },
        { team:'ATL', type:'Passing Touchdown', text:'M.Penix pass short left complete. Catch made by A.Hooper for 5 yards. TOUCHDOWN.' },
        { team:'ATL', type:'Rushing Touchdown', text:'B.Robinson rushed left guard for 7 yards. TOUCHDOWN.' },
        { team:'GB', type:'Passing Touchdown', text:'J.Love pass short middle complete. Catch made by M.Golden for 15 yards. TOUCHDOWN.' },
      ]
    }
  }
};

test('final scoring ledger resolves unresolved ATD misses when a zero-carry category is omitted', () => {
  const results = overlayLiveResults([
    { id:'kraft', gameId:'401872948', team:'GB', player:'Tucker Kraft', market:'atd', status:'UNRESOLVED', current:0 },
    { id:'pitts', gameId:'401872948', team:'ATL', player:'Kyle Pitts', market:'atd', status:'UNRESOLVED', current:0 },
  ], finalSnapshot);

  assert.deepEqual(results.map(row => row.status), ['MISS', 'MISS']);
  assert.deepEqual(results.map(row => row.current), [0, 0]);
  assert.ok(results.every(row => row.gameState === 'post'));
  assert.ok(results.every(row => row.liveData === true));
});

test('final scoring ledger can confirm an ATD hit when box-score TD categories are incomplete', () => {
  const [result] = overlayLiveResults([
    { id:'hooper', gameId:'401872948', team:'ATL', player:'Austin Hooper', market:'atd', status:'UNRESOLVED', current:0 },
  ], finalSnapshot);

  assert.equal(result.status, 'HIT');
  assert.equal(result.current, 1);
  assert.equal(result.liveData, true);
});

test('final settlement stays unresolved if both exact TD fields and the final scoring ledger are unavailable', () => {
  const partial = JSON.parse(JSON.stringify(finalSnapshot));
  delete partial.games['401872948'].scoringPlays;
  partial.games['401872948'].playerStats.byId['4360248'].flat = { receptions:'1', recYds:'5' };

  const [result] = overlayLiveResults([
    { id:'pitts', gameId:'401872948', team:'ATL', player:'Kyle Pitts', market:'atd', status:'UNRESOLVED', current:0 },
  ], partial);

  assert.equal(result.status, 'UNRESOLVED');
  assert.equal(result.current, null);
  assert.equal(result.liveData, false);
  assert.equal(result.liveDataUnavailableReason, 'market-not-found-in-live-box-score');
});
