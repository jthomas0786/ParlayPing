const test = require('node:test');
const assert = require('node:assert/strict');

const enrich = require('../server/api/lib/sportsbook-enrich-inclusive');

test('ParlayAPI snapshot keeps exact price and native FanDuel selection metadata', async () => {
  const originalFetch = global.fetch;
  const link = 'https://sportsbook.fanduel.com/addToBetslip?marketId=734.181376911&selectionId=36981570';
  global.fetch = async (url) => {
    assert.match(String(url), /slates\/nba-odds\.json/);
    return {
      ok: true,
      async json() {
        return {
          meta: { source:'parlayapi', sample:false, sport:'NBA' },
          rows: [{
            eventId:'evt-1', sport:'NBA', commenceTime:'2026-10-20T19:00:00.000Z',
            homeTeam:'Detroit Pistons', awayTeam:'Boston Celtics',
            player:'Cade Cunningham', market:'points', line:19.5,
            book:'FanDuel', bookKey:'fanduel', overPrice:-110, underPrice:-110,
            overLink:link, overSid:'36981570', snapshotTime:'2026-09-28T16:00:00.000Z',
            preserved:false, priceKind:'verified-snapshot'
          }]
        };
      }
    };
  };
  try {
    const slip = await enrich.enrichSportsbookMarkets({
      legs:[{
        sport:'NBA', matchup:'Boston Celtics @ Detroit Pistons',
        player:'Cade Cunningham', market:'points', side:'over', line:19.5,
        inclusive:false, startTimeUTC:'2026-10-20T19:00:00.000Z'
      }]
    });
    const offer = slip.legs[0].bookOffers.FanDuel;
    assert.equal(offer.oddsAmerican, -110, 'primary ParlayAPI price must stay unchanged');
    assert.equal(offer.selectionLink, link);
    assert.equal(offer.selectionId, '36981570');
    assert.equal(offer.marketId, '734.181376911');
    assert.equal(offer.priceKind, 'verified-snapshot');
  } finally {
    global.fetch = originalFetch;
  }
});

test('native URL parser never fabricates identifiers', () => {
  assert.deepEqual(enrich.nativeFieldsFromLink(null, null), { selectionId:null, marketId:null });
  assert.deepEqual(enrich.nativeFieldsFromLink('https://sportsbook.example.com/event', null), { selectionId:null, marketId:null });
});
