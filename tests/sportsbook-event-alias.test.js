const test = require('node:test');
const assert = require('node:assert/strict');

const {
  teamKey,
  teamMatchScore,
  eventScore,
  matchEvent,
} = require('../server/api/lib/odds-api-deeplink');

test('NFL abbreviations match full team names for event discovery', () => {
  const target = {
    id: 'phi-chi',
    away_team: 'Philadelphia Eagles',
    home_team: 'Chicago Bears',
    commence_time: '2026-09-29T00:15:00Z',
  };
  const other = {
    id: 'other',
    away_team: 'Pittsburgh Steelers',
    home_team: 'Cleveland Browns',
    commence_time: '2026-09-29T00:15:00Z',
  };
  const ctx = {
    awayTeam: 'PHI',
    homeTeam: 'CHI',
    commenceTime: '2026-09-29T00:15:00Z',
  };

  assert.equal(teamKey('PHI'), 'PHI');
  assert.equal(teamKey('Philadelphia Eagles'), 'PHI');
  assert.equal(teamKey('CHI'), 'CHI');
  assert.equal(teamKey('Chicago Bears'), 'CHI');
  assert.equal(teamMatchScore('Philadelphia Eagles', 'PHI'), 70);
  assert.ok(eventScore(target, ctx) >= 200);
  assert.equal(matchEvent([other, target], ctx)?.id, 'phi-chi');
});

test('common NFL feed aliases normalize to the same canonical team', () => {
  assert.equal(teamKey('WSH'), 'WAS');
  assert.equal(teamKey('WAS'), 'WAS');
  assert.equal(teamKey('Washington Commanders'), 'WAS');
  assert.equal(teamKey('JAC'), 'JAX');
  assert.equal(teamKey('Jacksonville Jaguars'), 'JAX');
  assert.equal(teamKey('NWE'), 'NE');
  assert.equal(teamKey('New England Patriots'), 'NE');
});
