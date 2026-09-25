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

const benchmarkSnapshot = {
  generatedAt: '2026-09-25T01:44:01.332Z',
  games: {
    '401872948': {
      status: 'in',
      awayAbbr: 'ATL',
      homeAbbr: 'GB',
      playerStats: {
        byId: {
          '4360248': { id: '4360248', name: 'Kyle Pitts', team: 'ATL', flat: { receptions: '1', recYds: '17', recTds: '0' } },
          '3054212': { id: '3054212', name: 'Jonnu Smith', team: 'GB', flat: { receptions: '0', recYds: '0', recTds: '0' } },
          '4572680': { id: '4572680', name: 'Tucker Kraft', team: 'GB', flat: { receptions: '3', recYds: '31', recTds: '0' } },
          '4426502': { id: '4426502', name: 'Drake London', team: 'ATL', flat: { receptions: '4', recYds: '54', recTds: '0' } },
          '4248528': { id: '4248528', name: 'Christian Watson', team: 'GB', flat: { receptions: '1', recYds: '4', recTds: '0' } },
          '3043275': { id: '3043275', name: 'Austin Hooper', team: 'ATL', flat: { receptions: '2', recYds: '18', recTds: '0' } },
          '4701936': { id: '4701936', name: 'Matthew Golden', team: 'GB', flat: { receptions: '4', recYds: '53', recTds: '0' } },
          '4430807': { id: '4430807', name: 'Bijan Robinson', team: 'ATL', flat: { rushYds: '90', recYds: '38', rushTds: '0', recTds: '0' } }
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
  const pitts = overlayLiveResult({ id:'leg-1', gameId:'401999999', team:'ATL', player:'Kyle Pitts', market:'receptions', side:'over', line:5, inclusive:true, status:'PENDING', probability:.3 }, snapshot);
  const kraft = overlayLiveResult({ id:'leg-2', gameId:'401999999', team:'GB', player:'Tucker Kraft', market:'receptions', side:'over', line:4, inclusive:true, status:'PENDING', probability:.4 }, snapshot);
  assert.equal(pitts.status, 'LIVE');
  assert.equal(pitts.current, 3);
  assert.equal(kraft.status, 'HIT');
  assert.equal(kraft.current, 4);
});

test('rush plus receiving yards are tracked as the combined live total', () => {
  assert.equal(normalizeLiveMarket('rushRecYds'), 'rushRecYds');
  const bijan = overlayLiveResult({ id:'leg-3', gameId:'401999999', team:'ATL', player:'Bijan Robinson', market:'rushRecYds', side:'over', line:100, inclusive:true, status:'PENDING' }, snapshot);
  assert.equal(bijan.current, 108);
  assert.equal(bijan.status, 'HIT');
});

test('completed live games grade unfinished over legs as misses', () => {
  assert.equal(liveLegResult({ market:'recYds', side:'over', line:60, inclusive:true }, 58, 'post'), 'MISS');
});

test('ATL @ GB benchmark uses the exact live values for all eight tracked legs', () => {
  const legs = [
    { player:'Kyle Pitts', team:'ATL', market:'receptions', line:5, expectedCurrent:1, expectedStatus:'LIVE' },
    { player:'Jonnu Smith', team:'GB', market:'receptions', line:2, expectedCurrent:0, expectedStatus:'LIVE' },
    { player:'Tucker Kraft', team:'GB', market:'receptions', line:4, expectedCurrent:3, expectedStatus:'LIVE' },
    { player:'Drake London', team:'ATL', market:'recYds', line:60, expectedCurrent:54, expectedStatus:'LIVE' },
    { player:'Christian Watson', team:'GB', market:'recYds', line:60, expectedCurrent:4, expectedStatus:'LIVE' },
    { player:'Austin Hooper', team:'ATL', market:'receptions', line:1, expectedCurrent:2, expectedStatus:'HIT' },
    { player:'Matthew Golden', team:'GB', market:'recYds', line:40, expectedCurrent:53, expectedStatus:'HIT' },
    { player:'Bijan Robinson', team:'ATL', market:'rushRecYds', line:100, expectedCurrent:128, expectedStatus:'HIT' },
  ];

  for (const [index, leg] of legs.entries()) {
    const result = overlayLiveResult({
      id:`benchmark-${index + 1}`,
      gameId:'401872948',
      player:leg.player,
      team:leg.team,
      market:leg.market,
      side:'over',
      line:leg.line,
      inclusive:true,
      status:'PENDING',
    }, benchmarkSnapshot);
    assert.equal(result.current, leg.expectedCurrent, leg.player);
    assert.equal(result.status, leg.expectedStatus, leg.player);
    assert.equal(result.liveData, true, leg.player);
  }
});

test('explicit zero is preserved but an absent stat field is never invented as zero', () => {
  assert.equal(liveValue({ flat:{ receptions:'0' } }, 'receptions'), 0);
  assert.equal(liveValue({ flat:{ recYds:'0' } }, 'recYds'), 0);
  assert.equal(liveValue({ flat:{ rushYds:'12' } }, 'recYds'), null);
  assert.equal(liveValue({ flat:{ rushYds:'12' } }, 'rushRecYds'), null);
  assert.equal(liveValue({ flat:{ rushTds:'0' } }, 'atd'), null);
});

test('missing live player data never becomes a fabricated zero', () => {
  assert.equal(liveValue(null, 'receptions'), null);
  const result = overlayLiveResult({
    id:'missing-live-player',
    gameId:'401872948',
    team:'GB',
    player:'Player Not In Feed',
    market:'receptions',
    side:'over',
    line:2,
    inclusive:true,
    status:'PENDING',
    current:0,
  }, benchmarkSnapshot);
  assert.equal(result.status, 'LIVE');
  assert.equal(result.current, null);
  assert.equal(result.liveData, false);
  assert.equal(result.liveDataUnavailable, true);
  assert.equal(result.liveDataUnavailableReason, 'player-not-found-in-live-box-score');
});

test('missing live market data stays unknown instead of becoming a fabricated zero', () => {
  const partialSnapshot = JSON.parse(JSON.stringify(benchmarkSnapshot));
  partialSnapshot.games['401872948'].playerStats.byId['4360248'].flat = { recYds:'17' };
  const result = overlayLiveResult({
    id:'missing-live-market',
    gameId:'401872948',
    team:'ATL',
    player:'Kyle Pitts',
    market:'receptions',
    side:'over',
    line:5,
    inclusive:true,
    status:'PENDING',
    current:0,
  }, partialSnapshot);
  assert.equal(result.status, 'LIVE');
  assert.equal(result.current, null);
  assert.equal(result.liveDataUnavailable, true);
  assert.equal(result.liveDataUnavailableReason, 'market-not-found-in-live-box-score');
});

test('missing final live player data stays unresolved instead of grading a false miss', () => {
  const finalSnapshot = JSON.parse(JSON.stringify(benchmarkSnapshot));
  finalSnapshot.games['401872948'].status = 'post';
  const result = overlayLiveResult({
    id:'missing-final-player',
    gameId:'401872948',
    team:'ATL',
    player:'Player Not In Feed',
    market:'recYds',
    side:'over',
    line:60,
    inclusive:true,
    status:'LIVE',
    current:12,
  }, finalSnapshot);
  assert.equal(result.status, 'UNRESOLVED');
  assert.equal(result.current, null);
  assert.equal(result.liveDataUnavailable, true);
});
