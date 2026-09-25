const test = require('node:test');
const assert = require('node:assert/strict');
const { gameById, gameState, livePlayer, liveValue } = require('../server/api/lib/nfl-live-feed');
const { overlayLiveResult, liveLegResult, normalizeLiveMarket } = require('../server/api/lib/parlay-engine-live');

const snapshot = {
  generatedAt: '2026-09-25T00:55:00.000Z',
  games: {
    '401999999': {
      status: 'in',
      awayAbbr: 'ATL',
      homeAbbr: 'GB',
      playerStats: {
        byId: {
          '1': { id: '1', name: 'Kyle Pitts', team: 'ATL', flat: { receptions: '3', recYds: '44', recTds: '0' } },
          '2': { id: '2', name: 'Tucker Kraft', team: 'GB', flat: { receptions: '4', recYds: '51', recTds: '0' } },
          '3': { id: '3', name: 'Bijan Robinson', team: 'ATL', flat: { rushYds: '82', recYds: '26', rushTds: '0', recTds: '0' } }
        },
        byName: {}
      }
    }
  }
};

test('reads authoritative live NFL player values from the current game', () => {
  const game = gameById(snapshot, '401999999');
  assert.equal(gameState(game), 'in');
  assert.equal(liveValue(livePlayer(game, 'Kyle Pitts'), 'receptions'), 3);
  assert.equal(liveValue(livePlayer(game, 'Tucker Kraft'), 'recYds'), 51);
  assert.equal(liveValue(livePlayer(game, 'Bijan Robinson'), 'rushRecYds'), 108);
});

test('live tracking marks inclusive milestones hit and unfinished milestones live', () => {
  const pitts = overlayLiveResult({ id:'leg-1', gameId:'401999999', player:'Kyle Pitts', market:'receptions', side:'over', line:5, inclusive:true, status:'PENDING', probability:.3 }, snapshot);
  const kraft = overlayLiveResult({ id:'leg-2', gameId:'401999999', player:'Tucker Kraft', market:'receptions', side:'over', line:4, inclusive:true, status:'PENDING', probability:.4 }, snapshot);
  assert.equal(pitts.status, 'LIVE');
  assert.equal(pitts.current, 3);
  assert.equal(kraft.status, 'HIT');
  assert.equal(kraft.current, 4);
});

test('rush plus receiving yards are tracked as the combined live total', () => {
  assert.equal(normalizeLiveMarket('rushRecYds'), 'rushRecYds');
  const bijan = overlayLiveResult({ id:'leg-3', gameId:'401999999', player:'Bijan Robinson', market:'rushRecYds', side:'over', line:100, inclusive:true, status:'PENDING' }, snapshot);
  assert.equal(bijan.current, 108);
  assert.equal(bijan.status, 'HIT');
});

test('completed live games grade unfinished over legs as misses', () => {
  assert.equal(liveLegResult({ market:'recYds', side:'over', line:60, inclusive:true }, 58, 'post'), 'MISS');
});
