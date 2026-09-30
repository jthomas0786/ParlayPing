const test = require('node:test');
const assert = require('node:assert/strict');

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

test('NHL ESPN scoreboard 403 leaves the leg unresolved instead of crashing the scheduler', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const target = String(url);
    if (target.includes('raw.githubusercontent.com') && target.endsWith('/nhl.json')) {
      return response(200, { generatedAt: '2026-09-29T23:00:00Z', games: [] });
    }
    if (target.includes('raw.githubusercontent.com') && target.endsWith('/nhl-sim.json')) {
      return response(200, { generatedAt: '2026-09-29T23:00:00Z', games: [] });
    }
    if (target.includes('raw.githubusercontent.com') && target.endsWith('/nhl-odds.json')) {
      return response(200, { generatedAt: '2026-09-29T23:00:00Z', quotes: [] });
    }
    if (target.includes('site.api.espn.com') && target.includes('/scoreboard')) {
      return response(403, { error: 'forbidden' });
    }
    throw new Error(`Unexpected test URL: ${target}`);
  };

  const modulePath = require.resolve('../server/api/lib/nhl-engine');
  delete require.cache[modulePath];
  const { analyzeNhlSlip } = require(modulePath);

  try {
    const result = await analyzeNhlSlip([{
      sport: 'NHL',
      player: 'Unavailable Test Player',
      market: 'shotsOnGoal',
      side: 'over',
      line: 2.5,
    }], { referenceTime: '2026-09-29T23:00:00Z' });

    assert.equal(result.ok, true);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].status, 'UNRESOLVED');
    assert.equal(result.results[0].resolutionReason, 'nhl-player-not-found-near-reference-date');
    assert.equal(result.counts.unresolved, 1);
  } finally {
    global.fetch = originalFetch;
    delete require.cache[modulePath];
  }
});
