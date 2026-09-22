const test = require('node:test');
const assert = require('node:assert/strict');

process.env.PARLAYPING_SHARE_SECRET = 'test-only-parlayping-share-secret-0123456789abcdef';
process.env.PUBLIC_BASE_URL = 'https://parlayping.net';

const { canonicalSlip } = require('../api/lib/share-slip');
const { pageHtml } = require('../api/share-page');

function leg(id, overrides = {}) {
  return {
    id,
    sport:'NFL',
    player:id === 'one' ? 'Derrick Henry' : 'Christian McCaffrey',
    team:id === 'one' ? 'BAL' : 'SF',
    gameId:`game-${id}`,
    matchup:id === 'one' ? 'New Orleans Saints vs Baltimore Ravens' : 'Miami Dolphins vs San Francisco 49ers',
    market:'Anytime TD Scorer',
    displayMarket:'Over 0.5',
    side:'over',
    line:0.5,
    oddsAmerican:id === 'one' ? -235 : -240,
    sportsbook:'DraftKings',
    sportsbookLink:'https://sportsbook.draftkings.com/',
    status:'PENDING',
    pregameProbability:id === 'one' ? 0.937 : 0.94,
    ...overrides,
  };
}

test('signed slip page renders the approved ParlayPing product design instead of the legacy share-card shell', () => {
  const slip = canonicalSlip({
    source:'The Sports Outpost',
    sportsbook:'DraftKings',
    combinedOddsAmerican:102,
    combinedOddsVerified:true,
    returnUrl:'https://thesportsoutpost.com/nfl.html#betslip',
    returnLabel:'The Sports Outpost',
    legs:[leg('one'),leg('two')],
  });
  const cardUrl='https://parlayping.net/share/test.png';
  const html=pageHtml({
    slip,
    shareUrl:'https://parlayping.net/slip/test',
    cardUrl,
    baseUrl:'https://parlayping.net',
    liveDataAvailable:true,
  });

  assert.match(html,/Best Book for This Parlay/);
  assert.match(html,/Compare your full slip across top books/);
  assert.match(html,/Supports up to 25 legs/);
  assert.match(html,/DraftKings/);
  assert.match(html,/2\/2 bets/);
  assert.match(html,/\+102/);
  assert.match(html,/PLACE ALL 2 BETS/);
  assert.match(html,/Your 2-Bet Parlay/);
  assert.match(html,/Parlay Tune/);
  assert.match(html,/SHARE YOUR BETSLIP/);
  assert.match(html,/Copy Link/);
  assert.match(html,/X \(Twitter\)/);
  assert.match(html,/Messages/);
  assert.match(html,/SMS/);
  assert.match(html,/Back to The Sports Outpost/);
  assert.doesNotMatch(html,/Your Shared <span>Betslip<\/span>/);
  assert.doesNotMatch(html,/class="card-wrap"/);
  assert.match(html,new RegExp(`<meta property="og:image" content="${cardUrl.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"`));
  assert.doesNotMatch(html,new RegExp(`<img[^>]+src="${cardUrl.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"`));
});

test('unverified combined odds are never fabricated into the approved sportsbook panel', () => {
  const slip=canonicalSlip({
    source:'The Sports Outpost',
    combinedOddsAmerican:102,
    combinedOddsVerified:false,
    legs:[leg('one'),leg('two')],
  });
  const html=pageHtml({
    slip,
    shareUrl:'https://parlayping.net/slip/test',
    cardUrl:'https://parlayping.net/share/test.png',
    baseUrl:'https://parlayping.net',
    liveDataAvailable:true,
  });
  assert.doesNotMatch(html,/class="parlay-price">\+102/);
  assert.match(html,/class="parlay-price">—/);
});
