const test=require('node:test');
const assert=require('node:assert/strict');
const {
  sportKey,
  marketCandidates,
  matchEvent,
  findOutcome,
  composeFanDuel,
  composeDraftKings
}=require('../server/api/lib/odds-api-deeplink');

test('maps ParlayPing sports and player markets to The Odds API keys',()=>{
  assert.equal(sportKey('WNBA'),'basketball_wnba');
  assert.deepEqual(marketCandidates({sport:'WNBA',market:'pra'}),['player_points_rebounds_assists','player_points_rebounds_assists_alternate']);
  assert.deepEqual(marketCandidates({sport:'NFL',market:'Anytime Touchdown'}),['player_anytime_td']);
  assert.deepEqual(marketCandidates({sport:'MLB',market:'Home Run'}),['batter_home_runs','batter_home_runs_alternate']);
});

test('matches The Odds API event using full sportsbook snapshot context',()=>{
  const events=[
    {id:'wrong',away_team:'Dallas Wings',home_team:'Seattle Storm',commence_time:'2026-09-24T02:00:00Z'},
    {id:'right',away_team:'Atlanta Dream',home_team:'New York Liberty',commence_time:'2026-09-24T00:00:00Z'}
  ];
  const hit=matchEvent(events,{awayTeam:'Atlanta Dream',homeTeam:'New York Liberty',commenceTime:'2026-09-24T00:00:00Z'});
  assert.equal(hit.id,'right');
});

test('finds exact FanDuel alternate player outcome and extracts native IDs',()=>{
  const doc={bookmakers:[{
    key:'fanduel',
    sid:'33617147',
    markets:[{
      key:'player_points_alternate',
      outcomes:[
        {name:'Over',description:'Allisha Gray',price:-125,point:19.5,link:'https://sportsbook.fanduel.com/addToBetslip?marketId=42.448600011&selectionId=29165',sid:'29165'},
        {name:'Under',description:'Allisha Gray',price:-105,point:19.5,link:'https://sportsbook.fanduel.com/addToBetslip?marketId=42.448600011&selectionId=29166',sid:'29166'}
      ]
    }]
  }]};
  const hit=findOutcome(doc,'FanDuel',{sport:'WNBA',player:'Allisha Gray',market:'points',side:'over',line:20,inclusive:true});
  assert.ok(hit);
  assert.equal(hit.marketKey,'player_points_alternate');
  assert.equal(hit.marketId,'42.448600011');
  assert.equal(hit.selectionId,'29165');
  assert.equal(hit.selectionLink,'https://sportsbook.fanduel.com/addToBetslip?marketId=42.448600011&selectionId=29165');
});

test('does not bind a sportsbook selection to the wrong player',()=>{
  const doc={bookmakers:[{key:'fanduel',markets:[{key:'player_rebounds',outcomes:[{name:'Over',description:'Breanna Stewart',price:-110,point:8.5,link:'https://sportsbook.fanduel.com/addToBetslip?marketId=42.1&selectionId=9'}]}]}]};
  assert.equal(findOutcome(doc,'FanDuel',{sport:'WNBA',player:'Jonquel Jones',market:'rebounds',side:'over',line:8.5}),null);
});

test('composes FanDuel parlay only from native market and selection IDs',()=>{
  const url=new URL(composeFanDuel([
    {marketId:'42.100',selectionId:'111'},
    {marketId:'42.200',selectionId:'222'}
  ]));
  assert.equal(url.hostname,'account.sportsbook.fanduel.com');
  assert.equal(url.searchParams.get('marketId[0]'),'42.100');
  assert.equal(url.searchParams.get('selectionId[0]'),'111');
  assert.equal(url.searchParams.get('marketId[1]'),'42.200');
  assert.equal(url.searchParams.get('selectionId[1]'),'222');
  assert.equal(composeFanDuel([{marketId:'42.100',selectionId:null}]),null);
});

test('composes DraftKings parlay only from one exact outcome per leg',()=>{
  const url=new URL(composeDraftKings([
    {selectionLink:'https://sportsbook.draftkings.com/?outcomes=111'},
    {selectionLink:'https://sportsbook.draftkings.com/?outcomes=222'}
  ]));
  assert.equal(url.searchParams.get('outcomes'),'111+222');
});
