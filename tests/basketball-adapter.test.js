const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeBasketballSlip,exactBookOffers}=require('../lib/basketball-adapter');

const snapshot={
  meta:{sport:'WNBA',fetchedAt:'2026-09-20T15:55:00.000Z'},
  rows:[
    {
      eventId:'evt1',sport:'WNBA',commenceTime:'2026-09-20T17:00:00.000Z',homeTeam:'Connecticut Sun',awayTeam:'Minnesota Lynx',
      player:'Aaliyah Edwards',team:null,market:'points',marketKey:'player_points',line:10.5,book:'Caesars',
      overPrice:-110,underPrice:-110,overImplied:null,underImplied:null,deepLink:'https://example.com/caesars/aaliyah'
    }
  ]
};

test('basketball adapter resolves pregame props from Sports Outpost without ESPN',async()=>{
  const original=global.fetch;
  const calls=[];
  global.fetch=async url=>{
    calls.push(String(url));
    return {ok:true,status:200,json:async()=>snapshot};
  };
  try{
    const result=await analyzeBasketballSlip('WNBA',[{sport:'WNBA',player:'Aaliyah Edwards',market:'points',side:'over',line:10.5,inclusive:false}],{referenceTime:'2026-09-20T16:00:00.000Z'});
    assert.equal(result.results.length,1);
    assert.equal(result.results[0].status,'PENDING');
    assert.equal(result.results[0].gameId,'evt1');
    assert.equal(result.results[0].probability,0.5);
    assert.equal(result.results[0].probabilityMethod,'sportsbook-devig-median');
    assert.equal(result.results[0].oddsAmerican,-110);
    assert.equal(result.results[0].sportsbook,'Caesars');
    assert.equal(result.results[0].bookOffers.Caesars.oddsAmerican,-110);
    assert.equal(result.results[0].bookOffers.Caesars.selectionLink,'https://example.com/caesars/aaliyah');
    assert.ok(calls.every(url=>!url.includes('espn.com')));
  }finally{global.fetch=original;}
});

test('WNBA milestone and combo props preserve every matching sportsbook offer for builder display',async()=>{
  const original=global.fetch;
  const base={eventId:'evt2',sport:'WNBA',commenceTime:'2026-09-24T00:00:00.000Z',homeTeam:'New York Liberty',awayTeam:'Atlanta Dream',team:null};
  const rows=[
    {...base,player:'Jordin Canada',market:'assists',marketKey:'player_assists',line:5.5,book:'FanDuel',overPrice:-125,underPrice:-105},
    {...base,player:'Jordin Canada',market:'assists',marketKey:'player_assists_alt',line:6,book:'DraftKings',overPrice:-115,underPrice:null},
    {...base,player:'Allisha Gray',market:'points',marketKey:'player_points',line:14.5,book:'FanDuel',overPrice:-130,underPrice:+100},
    {...base,player:'Angel Reese',market:'rebsAsts',marketKey:'player_rebounds_assists',line:11.5,book:'bet365',overPrice:-120,underPrice:-110},
    {...base,player:'Pauline Astier',market:'ptsRebs',marketKey:'player_points_rebounds',line:9.5,book:'Caesars',overPrice:-118,underPrice:-112},
    {...base,player:'Breanna Stewart',market:'pra',marketKey:'player_points_rebounds_assists',line:29.5,book:'DraftKings',overPrice:-122,underPrice:-108},
    {...base,player:'Jonquel Jones',market:'points',marketKey:'player_points',line:9.5,book:'FanDuel',overPrice:-155,underPrice:+120}
  ];
  global.fetch=async url=>{
    if(String(url).includes('raw.githubusercontent.com'))return {ok:true,status:200,json:async()=>({meta:{sport:'WNBA',fetchedAt:'2026-09-23T22:00:00.000Z'},rows})};
    throw new Error(`Unexpected URL ${url}`);
  };
  try{
    const legs=[
      ['Jordin Canada','assists',6],['Allisha Gray','points',15],['Angel Reese','rebsAsts',12],
      ['Pauline Astier','ptsRebs',10],['Breanna Stewart','pra',30],['Jonquel Jones','points',10]
    ].map(([player,market,line])=>({sport:'WNBA',player,market,side:'over',line,inclusive:true}));
    const result=await analyzeBasketballSlip('WNBA',legs,{referenceTime:'2026-09-23T23:00:00.000Z'});
    assert.equal(result.results.length,6);
    for(const leg of result.results){
      assert.equal(leg.status,'PENDING',leg.player);
      assert.ok(Number.isFinite(leg.oddsAmerican),`${leg.player} should have display odds`);
      assert.ok(Object.keys(leg.bookOffers||{}).length>=1,`${leg.player} should preserve book offers`);
      assert.ok(Number.isFinite(leg.probability),`${leg.player} should have probability from the same quote rows`);
    }
    const canada=result.results.find(x=>x.player==='Jordin Canada');
    assert.equal(canada.bookOffers.FanDuel.oddsAmerican,-125);
    assert.equal(canada.bookOffers.DraftKings.oddsAmerican,-115);
    assert.equal(canada.oddsAmerican,-115);
    assert.equal(result.results.find(x=>x.player==='Angel Reese').bookOffers.bet365.oddsAmerican,-120);
    assert.equal(result.results.find(x=>x.player==='Breanna Stewart').bookOffers.DraftKings.oddsAmerican,-122);
  }finally{global.fetch=original;}
});

test('basketball offers preserve the exact side-specific sportsbook link and selection id',()=>{
  const row={eventId:'evt-side',sport:'WNBA',commenceTime:'2026-09-24T00:00:00.000Z',player:'Test Player',market:'points',line:10.5,book:'DraftKings',overPrice:-105,underPrice:-115,overLink:'https://sportsbook.draftkings.com/over',underLink:'https://sportsbook.draftkings.com/under',overSid:'over-123',underSid:'under-456',snapshotTime:'2026-09-23T23:00:00.000Z'};
  const odds={rows:[row]};
  const over=exactBookOffers(odds,{sport:'WNBA',player:'Test Player',market:'points',side:'over',line:10.5},row).bookOffers.DraftKings;
  const under=exactBookOffers(odds,{sport:'WNBA',player:'Test Player',market:'points',side:'under',line:10.5},row).bookOffers.DraftKings;
  assert.equal(over.selectionLink,'https://sportsbook.draftkings.com/over');
  assert.equal(over.selectionId,'over-123');
  assert.equal(over.oddsAmerican,-105);
  assert.equal(under.selectionLink,'https://sportsbook.draftkings.com/under');
  assert.equal(under.selectionId,'under-456');
  assert.equal(under.oddsAmerican,-115);
});

test('basketball adapter returns safe unresolved instead of throwing when ESPN blocks live grading',async()=>{
  const original=global.fetch;
  global.fetch=async url=>{
    const text=String(url);
    if(text.includes('raw.githubusercontent.com'))return {ok:true,status:200,json:async()=>snapshot};
    if(text.includes('espn.com'))return {ok:false,status:403,json:async()=>({})};
    throw new Error(`Unexpected URL ${text}`);
  };
  try{
    const result=await analyzeBasketballSlip('WNBA',[{sport:'WNBA',player:'Aaliyah Edwards',market:'points',side:'over',line:10.5,inclusive:false}],{referenceTime:'2026-09-20T18:00:00.000Z'});
    assert.equal(result.results.length,1);
    assert.equal(result.results[0].status,'UNRESOLVED');
    assert.equal(result.results[0].resolutionReason,'basketball-live-feed-unavailable');
  }finally{global.fetch=original;}
});
