const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canonicalSlip,
  encodeShareSlip,
  decodeShareSlip,
  mergeAnalysisIntoSlip,
} = require('../api/lib/share-slip');
const {
  resolveLegDisplay,
  resolveSlipState,
  summaryText,
  selectVisibleLegs,
  renderShareSvg,
} = require('../api/lib/share-renderer');
const { pageHtml } = require('../api/share-page');

const SECRET = 'unit-test-share-secret-0123456789-abcdef';

function leg(index, extra = {}) {
  return {
    id:`leg-${index}`,
    sport:'NFL',
    player:`Player ${index}`,
    team:`T${index}`,
    gameId:`game-${index}`,
    market:'Rushing Yards',
    side:'over',
    line:59.5,
    oddsAmerican: index % 2 ? 140 : -110,
    pregameProbability:.417,
    status:'PENDING',
    ...extra,
  };
}

test('signed share slips round-trip and reject tampering', () => {
  const input = { legs:[leg(1),leg(2)], combinedOddsAmerican:785, combinedOddsVerified:true };
  const token = encodeShareSlip(input, SECRET);
  assert.match(token, /^s1\./);
  const decoded = decodeShareSlip(token, SECRET);
  assert.equal(decoded.legs.length, 2);
  assert.equal(decoded.combinedOddsAmerican, 785);
  assert.equal(decoded.combinedOddsVerified, true);
  const parts = token.split('.');
  const tampered = `${parts[0]}.${parts[1].slice(0,-1)}A.${parts[2]}`;
  assert.throws(() => decodeShareSlip(tampered, SECRET), /signature|token/i);
});

test('share slips allow 25 legs but reject 26', () => {
  assert.equal(canonicalSlip({legs:Array.from({length:25},(_,i)=>leg(i+1))}).legs.length,25);
  assert.throws(() => canonicalSlip({legs:Array.from({length:26},(_,i)=>leg(i+1))}), /at most 25/i);
});

test('live legs use current conditional probability when explicitly available', () => {
  const display = resolveLegDisplay({
    ...leg(1), status:'LIVE', liveProbability:.684, progressText:'47 / 60 yards'
  });
  assert.equal(display.displayOddsText,'+140');
  assert.equal(display.displayProbabilityCompact,'68.4%');
  assert.equal(display.probabilityKind,'live');
  assert.equal(display.displayProgressText,'LIVE • 47 / 60 yards');
});

test('live legs never present stale pregame probability as current', () => {
  const display = resolveLegDisplay({
    ...leg(1), status:'LIVE', liveProbability:null, pregameProbability:.417, progressText:'47 / 60 yards'
  });
  assert.equal(display.displayProbabilityCompact,'PG 41.7%');
  assert.equal(display.probabilityKind,'pregame_fallback');
});

test('settled legs hide probability and show result badge', () => {
  const display = resolveLegDisplay({ ...leg(1), status:'HIT', liveProbability:.99 });
  assert.equal(display.displayProbabilityCompact,null);
  assert.equal(display.badgeText,'HIT');
});

test('mixed slip resolves 2 hit, 2 live and 2 pending independently', () => {
  const legs = [
    leg(1,{status:'HIT'}),leg(2,{status:'HIT'}),
    leg(3,{status:'LIVE',liveProbability:.684,progressText:'47 / 60 yards'}),
    leg(4,{status:'LIVE',liveProbability:.612,progressText:'4 / 6 receptions'}),
    leg(5),leg(6),
  ];
  assert.equal(resolveSlipState(legs),'mixed_live');
  assert.equal(summaryText(legs),'2 Hit • 2 Live • 2 Pending');
});

test('X reply cards prioritize live then settled legs before pending', () => {
  const legs = [leg(1),leg(2),leg(3),leg(4),leg(5),leg(6),leg(7,{status:'LIVE'}),leg(8,{status:'HIT'})];
  const visible = selectVisibleLegs(legs,'x_reply',6);
  assert.equal(visible[0].id,'leg-7');
  assert.equal(visible[1].id,'leg-8');
  assert.equal(visible.length,6);
});

test('more than six legs renders only six plus a +N more indicator', () => {
  const legs = Array.from({length:8},(_,i)=>leg(i+1));
  const svg = renderShareSvg({slip:{legs,combinedOddsAmerican:2216,combinedOddsVerified:true},pageUrl:'https://parlayping.net/slip/demo'});
  assert.match(svg,/8-LEG PARLAY/);
  assert.match(svg,/\+2216/);
  assert.match(svg,/\+2 more legs/);
  assert.doesNotMatch(svg,/Player 7/);
  assert.doesNotMatch(svg,/Player 8/);
});

test('25-leg card says +19 more legs', () => {
  const svg = renderShareSvg({slip:{legs:Array.from({length:25},(_,i)=>leg(i+1))}});
  assert.match(svg,/\+19 more legs/);
});

test('unverified combined odds are never fabricated into the card', () => {
  const svg = renderShareSvg({slip:{legs:[leg(1),leg(2),leg(3)],combinedOddsAmerican:785,combinedOddsVerified:false}});
  assert.doesNotMatch(svg,/\+785/);
  assert.match(svg,/PARLAYPING SHARE CARD/);
});

test('NFL live analysis probability is treated as verified rest-of-game probability', () => {
  const saved = canonicalSlip({legs:[leg(1,{pregameProbability:.417})]});
  const hydrated = mergeAnalysisIntoSlip(saved,{
    results:[{
      ...saved.legs[0], status:'LIVE', gameState:'in', probability:.684,
      current:47, target:60, displayMarket:'O59.5 RUSH YDS'
    }]
  });
  const row = hydrated.legs[0];
  assert.equal(row.liveProbability,.684);
  assert.equal(row.probabilitySource,'live_model_nfl_rest_of_game_sim');
  assert.equal(row.progressText,'47 / 60 yards');
});

test('non-NFL live probability requires an explicit live source label', () => {
  const saved = canonicalSlip({legs:[leg(1,{sport:'NBA',market:'Points',pregameProbability:.52})]});
  const hydrated = mergeAnalysisIntoSlip(saved,{results:[{...saved.legs[0],status:'LIVE',probability:.77,current:18,target:25}]});
  assert.equal(hydrated.legs[0].liveProbability,null);
  const display = resolveLegDisplay(hydrated.legs[0]);
  assert.equal(display.displayProbabilityCompact,'PG 52.0%');
});

test('share page emits social preview metadata pointing to the canonical card', () => {
  const slip = canonicalSlip({legs:[leg(1),leg(2),leg(3)]});
  const html = pageHtml({
    slip,
    shareUrl:'https://parlayping.net/slip/token',
    cardUrl:'https://parlayping.net/share/token.png',
    baseUrl:'https://parlayping.net',
    liveDataAvailable:true,
  });
  assert.match(html,/twitter:card/);
  assert.match(html,/summary_large_image/);
  assert.match(html,/https:\/\/parlayping\.net\/share\/token\.png/);
  assert.match(html,/Your Shared/);
});
