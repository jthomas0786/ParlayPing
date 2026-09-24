const test=require('node:test');
const assert=require('node:assert/strict');

const {parseNestedSnapshot}=require('../server/api/lib/sportsbook-enrich');
const {safePlayerImageUrl,renderShareSvg}=require('../server/api/lib/share-renderer');

test('NFL binary ATD snapshot enriches sportsbook prices for full-team-name parsed legs',()=>{
  const doc={games:[{
    fixtureId:'parlay-event-123',
    gameId:'401872948',
    away:'ATL',
    home:'GB',
    awayName:'Atlanta Falcons',
    homeName:'Green Bay Packers',
    startDateUTC:'2026-09-24T19:15:00Z',
    players:[{
      name:'Tucker Kraft',
      team:'GB',
      odds:{
        atd:{
          best:{book:'FanDuel',price:425,link:'https://sportsbook.example/fd-kraft'},
          all:[
            {book:'FanDuel',price:425,link:'https://sportsbook.example/fd-kraft'},
            {book:'DraftKings',price:400,link:'https://sportsbook.example/dk-kraft'},
            {book:'BetMGM',price:390,link:'https://sportsbook.example/mgm-kraft'},
          ],
        },
      },
    }],
  }]};

  const parsed=parseNestedSnapshot(doc,{
    sport:'NFL',
    player:'Tucker Kraft',
    team:'GREEN BAY PACKERS',
    gameId:'401872948',
    matchup:'ATL @ GB',
    startTimeUTC:'2026-09-24T19:15:00Z',
    market:'atd',
    side:'yes',
    line:0.5,
  });

  assert.ok(parsed,'ATD market should resolve');
  assert.equal(parsed.preferred.sportsbook,'FanDuel');
  assert.equal(parsed.preferred.oddsAmerican,425);
  assert.equal(parsed.bookOffers.FanDuel.oddsAmerican,425);
  assert.equal(parsed.bookOffers.DraftKings.oddsAmerican,400);
  assert.equal(parsed.bookOffers.BetMGM.oddsAmerican,390);
  assert.equal(parsed.altLinesByBook.FanDuel[0].line,0.5);
  assert.equal(parsed.altLinesByBook.FanDuel[0].side,'yes');
  assert.equal(parsed.gameId,'401872948');
});

test('share renderer accepts server-embedded player headshot data URIs',()=>{
  const headshot='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAA';
  assert.equal(safePlayerImageUrl(headshot),headshot);
  assert.equal(safePlayerImageUrl('https://not-a-trusted-host.example/player.png'),null);

  const svg=renderShareSvg({
    slip:{
      legs:[{
        id:'leg-1',sport:'NFL',player:'Tucker Kraft',team:'GB',market:'atd',displayMarket:'ATD',side:'yes',line:0.5,
        status:'PENDING',pregameProbability:0.155,oddsAmerican:425,playerImageUrl:headshot,
      }],
    },
    context:'x_reply',
    pageUrl:'https://parlayping.net/build/example',
  });

  assert.match(svg,/data:image\/png;base64,iVBORw0KGgo/);
  assert.match(svg,/\+425/);
  assert.doesNotMatch(svg,/>TK<\/text>/);
});
