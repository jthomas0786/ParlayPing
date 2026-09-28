const test=require('node:test');
const assert=require('node:assert/strict');
const {
  sportKey,
  bookKey,
  marketCandidates,
  matchEvent,
  findOutcome,
  composeFanDuel,
  composeDraftKings,
  getEvents,
  getEventOdds,
  getEventOddsForBooks,
  clearOddsApiCaches
}=require('../server/api/lib/odds-api-deeplink');

test('maps ParlayPing sports and player markets to The Odds API keys',()=>{
  assert.equal(sportKey('WNBA'),'basketball_wnba');
  assert.equal(bookKey('FanDuel'),'fanduel');
  assert.equal(bookKey('DraftKings'),'draftkings');
  assert.equal(bookKey('BetMGM'),'betmgm');
  assert.equal(bookKey('BetRivers'),'betrivers');
  assert.equal(bookKey('Bovada'),'bovada');
  assert.equal(bookKey('theScore Bet'),'espnbet');
  assert.equal(bookKey('ESPN BET'),'espnbet');
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
  const url=composeDraftKings([
    {selectionLink:'https://sportsbook.draftkings.com/?outcomes=111'},
    {selectionLink:'https://sportsbook.draftkings.com/?outcomes=222'}
  ]);
  assert.ok(url.includes('outcomes=111+222'));
});

test('coalesces concurrent cold event and event-odds provider requests',async()=>{
  clearOddsApiCaches();
  let calls=0;
  const fetchImpl=async url=>{
    calls+=1;
    await new Promise(resolve=>setTimeout(resolve,20));
    const href=String(url);
    const data=href.includes('/odds')?{bookmakers:[]}:[];
    return {ok:true,status:200,json:async()=>data,headers:{get:()=>null}};
  };
  await Promise.all([
    getEvents('NFL','test-key',fetchImpl),
    getEvents('NFL','test-key',fetchImpl),
    getEvents('NFL','test-key',fetchImpl)
  ]);
  assert.equal(calls,1);
  await Promise.all([
    getEventOdds({sport:'NFL',eventId:'event-1',book:'theScore Bet',markets:['player_pass_yds'],apiKey:'test-key',fetchImpl}),
    getEventOdds({sport:'NFL',eventId:'event-1',book:'theScore Bet',markets:['player_pass_yds'],apiKey:'test-key',fetchImpl})
  ]);
  assert.equal(calls,2);
  clearOddsApiCaches();
});

test('batches up to six exact sportsbooks into one event odds provider request',async()=>{
  clearOddsApiCaches();
  const urls=[];
  const fetchImpl=async url=>{
    urls.push(String(url));
    return {ok:true,status:200,json:async()=>({bookmakers:[]}),headers:{get:name=>name==='x-requests-last'?'1':null}};
  };
  const result=await getEventOddsForBooks({
    sport:'NFL',
    eventId:'event-batch',
    books:['FanDuel','DraftKings','BetMGM','BetRivers','Bovada','theScore Bet'],
    markets:['player_pass_yds','player_reception_yds'],
    apiKey:'test-key',
    fetchImpl
  });
  assert.equal(urls.length,1);
  const url=new URL(urls[0]);
  const books=url.searchParams.get('bookmakers').split(',').sort();
  assert.deepEqual(books,['betmgm','betrivers','bovada','draftkings','espnbet','fanduel']);
  assert.equal(url.searchParams.has('regions'),false);
  assert.equal(result.usage.last,1);
  clearOddsApiCaches();
});


test('suppresses repeated provider calls while usage credits are exhausted',async()=>{
  clearOddsApiCaches();
  let calls=0;
  const fetchImpl=async()=>{
    calls+=1;
    return {
      ok:false,
      status:401,
      json:async()=>({error_code:'OUT_OF_USAGE_CREDITS',message:'Usage credits have been exhausted'}),
      headers:{get:()=>null}
    };
  };
  await assert.rejects(
    getEventOddsForBooks({sport:'NFL',eventId:'quota-1',books:['FanDuel','BetMGM'],markets:['player_pass_yds'],apiKey:'test-key',fetchImpl}),
    error=>error?.data?.error_code==='OUT_OF_USAGE_CREDITS'
  );
  await assert.rejects(
    getEventOddsForBooks({sport:'NFL',eventId:'quota-2',books:['FanDuel','BetMGM'],markets:['player_pass_yds'],apiKey:'test-key',fetchImpl}),
    error=>error?.data?.error_code==='OUT_OF_USAGE_CREDITS'&&error?.data?.cached===true
  );
  assert.equal(calls,1);
  clearOddsApiCaches();
});
