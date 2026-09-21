const test = require('node:test');
const assert = require('node:assert/strict');

process.env.PARLAYPING_SHARE_SECRET = 'test-only-parlayping-share-secret-0123456789abcdef';
process.env.PUBLIC_BASE_URL = 'https://parlayping.net';

const {
  canonicalSlip,
  encodeShareSlip,
  decodeShareSlip,
  buildShareUrl,
  buildCardUrl,
  mergeAnalysisIntoSlip,
} = require('../api/lib/share-slip');
const {
  resolveLegDisplay,
  resolveSlipState,
  summaryText,
  selectVisibleLegs,
  renderShareSvg,
} = require('../api/lib/share-renderer');
const { Resvg } = require('@resvg/resvg-js');

function leg(i, overrides = {}) {
  return {
    id: `leg-${i}`,
    sport: 'NFL',
    player: `Player ${i}`,
    team: i % 2 ? 'KC' : 'SF',
    gameId: `game-${Math.ceil(i / 2)}`,
    market: 'Rushing Yards',
    displayMarket: 'Over 59.5 Rushing Yards',
    side: 'over',
    line: 59.5,
    oddsAmerican: 140,
    status: 'PENDING',
    pregameProbability: 0.417,
    ...overrides,
  };
}

test('share token round-trips a canonical premade slip and rejects tampering', () => {
  const input = canonicalSlip({
    source: 'The Sports Outpost',
    sportsbook: 'DraftKings',
    combinedOddsAmerican: 785,
    combinedOddsVerified: true,
    legs: [leg(1), leg(2), leg(3)],
  });
  const token = encodeShareSlip(input);
  const decoded = decodeShareSlip(token);
  assert.equal(decoded.legs.length, 3);
  assert.equal(decoded.sportsbook, 'DraftKings');
  assert.equal(decoded.combinedOddsAmerican, 785);
  assert.equal(decoded.combinedOddsVerified, true);
  assert.equal(buildShareUrl(token), `https://parlayping.net/slip/${encodeURIComponent(token)}`);
  assert.equal(buildCardUrl(token), `https://parlayping.net/share/${encodeURIComponent(token)}.png`);

  const last = token.at(-1);
  const tampered = `${token.slice(0, -1)}${last === 'a' ? 'b' : 'a'}`;
  assert.throws(() => decodeShareSlip(tampered), /signature|token/i);
});

test('share slips support 25 legs but reject 26', () => {
  const twentyFive = Array.from({ length: 25 }, (_, i) => leg(i + 1));
  assert.equal(canonicalSlip({ legs: twentyFive }).legs.length, 25);
  assert.throws(() => canonicalSlip({ legs: [...twentyFive, leg(26)] }), /25/);
});

test('pending cards show pregame probability directly under odds', () => {
  const display = resolveLegDisplay(leg(1));
  assert.equal(display.displayOddsText, '+140');
  assert.equal(display.displayProbabilityCompact, '41.7%');
  assert.equal(display.probabilityKind, 'pregame');
});

test('live cards prefer current conditional probability and progress', () => {
  const display = resolveLegDisplay(leg(1, {
    status: 'LIVE',
    pregameProbability: 0.417,
    liveProbability: 0.684,
    progressText: '47 / 60 yards',
  }));
  assert.equal(display.displayProbabilityCompact, '68.4%');
  assert.equal(display.displayProbabilityText, '68.4% to hit');
  assert.equal(display.displayProgressText, 'LIVE • 47 / 60 yards');
  assert.equal(display.probabilityKind, 'live');
});

test('live cards label stale pregame probability instead of presenting it as live', () => {
  const display = resolveLegDisplay(leg(1, {
    status: 'LIVE',
    liveProbability: null,
    pregameProbability: 0.417,
    progressText: '47 / 60 yards',
  }));
  assert.equal(display.displayProbabilityCompact, 'PG 41.7%');
  assert.equal(display.displayProbabilityText, 'Pregame: 41.7%');
  assert.equal(display.probabilityKind, 'pregame_fallback');
});

test('settled legs hide probability and show result', () => {
  const hit = resolveLegDisplay(leg(1, { status: 'HIT', liveProbability: 1 }));
  const miss = resolveLegDisplay(leg(2, { status: 'MISS', liveProbability: 0 }));
  assert.equal(hit.displayProbabilityCompact, null);
  assert.equal(hit.badgeText, 'HIT');
  assert.equal(miss.displayProbabilityCompact, null);
  assert.equal(miss.badgeText, 'MISS');
});

test('mixed slips keep per-leg state and summarize hit live and pending legs', () => {
  const legs = [
    leg(1, { status: 'HIT' }),
    leg(2, { status: 'HIT' }),
    leg(3, { status: 'LIVE', liveProbability: 0.684, progressText: '47 / 60 yards' }),
    leg(4, { status: 'LIVE', liveProbability: 0.572, progressText: '4 / 6 receptions' }),
    leg(5),
    leg(6),
  ];
  assert.equal(resolveSlipState(legs), 'mixed_live');
  assert.equal(summaryText(legs), '2 Hit • 2 Live • 2 Pending');
});

test('X reply cards prioritize live and settled information and never show more than six legs', () => {
  const legs = [
    leg(1), leg(2), leg(3), leg(4), leg(5), leg(6),
    leg(7, { status: 'LIVE', liveProbability: 0.7 }),
    leg(8, { status: 'HIT' }),
  ];
  const visible = selectVisibleLegs(legs, 'x_reply', 6);
  assert.equal(visible.length, 6);
  assert.equal(visible[0].status, 'LIVE');
  assert.equal(visible[1].status, 'HIT');
});

test('analysis hydration only promotes an explicitly current live probability', () => {
  const slip = canonicalSlip({ legs: [leg(1, { status: 'PENDING', pregameProbability: 0.417 })] });
  const hydrated = mergeAnalysisIntoSlip(slip, {
    results: [{
      id: 'leg-1', sport: 'NFL', player: 'Player 1', market: 'Rushing Yards', side: 'over', line: 59.5,
      status: 'LIVE', gameState: 'in', current: 47, target: 60, probability: 0.684,
    }],
  });
  assert.equal(hydrated.legs[0].liveProbability, 0.684);
  assert.equal(hydrated.legs[0].pregameProbability, 0.417);
  assert.equal(hydrated.legs[0].progressText, '47 / 60 yards');
});

test('8-leg share card renders six legs plus +2 more and rasterizes as a real PNG', () => {
  const legs = Array.from({ length: 8 }, (_, i) => leg(i + 1, i === 0 ? {
    status: 'LIVE', liveProbability: 0.684, progressText: '47 / 60 yards',
  } : {}));
  const svg = renderShareSvg({
    slip: canonicalSlip({ legs, combinedOddsAmerican: 2216, combinedOddsVerified: true }),
    context: 'x_reply',
    pageUrl: 'https://parlayping.net/slip/example',
  });
  assert.match(svg, /Parlay/);
  assert.match(svg, /Ping/);
  assert.match(svg, /\+2 more legs/);
  assert.match(svg, /68\.4%/);
  assert.match(svg, /47 \/ 60 yards/);
  assert.match(svg, /ADDITIONAL PICKS NOT SHOWN/i);

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  assert.ok(png.length > 1000);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
