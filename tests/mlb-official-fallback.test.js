const test = require('node:test');
const assert = require('node:assert/strict');
const {
  analyzeMlbSlip,
  playerGameStats,
  currentForMarket,
  settleStatus,
  MARKET_META
} = require('../api/lib/mlb-engine-v2');

function response(status,payload){return {status,ok:status>=200&&status<300,json:async()=>payload};}

function installFourPlayerFetch(){
  const players=[
    {id:1,fullName:'Riley Greene',currentTeam:{id:116,name:'Detroit Tigers'}},
    {id:2,fullName:'Coby Mayo',currentTeam:{id:110,name:'Baltimore Orioles'}},
    {id:3,fullName:'Josh Bell',currentTeam:{id:142,name:'Minnesota Twins'}},
    {id:4,fullName:'Jake Burger',currentTeam:{id:140,name:'Texas Rangers'}}
  ];
  const games=[
    {gamePk:1001,gameDate:'2099-09-23T17:00:00Z',status:{abstractGameState:'Preview'},teams:{away:{team:{id:116,name:'Detroit Tigers'}},home:{team:{id:147,name:'New York Yankees'}}}},
    {gamePk:1002,gameDate:'2099-09-23T18:00:00Z',status:{abstractGameState:'Preview'},teams:{away:{team:{id:110,name:'Baltimore Orioles'}},home:{team:{id:111,name:'Boston Red Sox'}}}},
    {gamePk:1003,gameDate:'2099-09-23T19:00:00Z',status:{abstractGameState:'Preview'},teams:{away:{team:{id:142,name:'Minnesota Twins'}},home:{team:{id:145,name:'Chicago White Sox'}}}},
    {gamePk:1004,gameDate:'2099-09-23T20:00:00Z',status:{abstractGameState:'Preview'},teams:{away:{team:{id:140,name:'Texas Rangers'}},home:{team:{id:117,name:'Houston Astros'}}}}
  ];
  global.fetch=async url=>{
    const value=String(url);
    if(value.includes('raw.githubusercontent.com'))return response(404,{});
    if(value.includes('/schedule?'))return response(200,{dates:value.includes('2099-09-23')?[{games}]:[]});
    if(value.includes('/sports/1/players'))return response(200,{people:players});
    if(value.includes('/roster?'))return response(200,{roster:[]});
    throw new Error(`Unexpected MLB test request: ${value}`);
  };
}

test('missing Sports Outpost snapshot falls back to official MLB and keeps the four reported HR legs', async t=>{
  const original=global.fetch;t.after(()=>{global.fetch=original;});installFourPlayerFetch();
  const legs=[
    {sport:'MLB',player:'Riley Greene',team:'DETROIT TIGERS',market:'homeRun',side:'yes',line:null,inclusive:true},
    {sport:'MLB',player:'Coby Mayo',team:'BALTIMORE ORIOLES',market:'homeRun',side:'yes',line:null,inclusive:true},
    {sport:'MLB',player:'Josh Bell',team:'MINNESOTA TWINS',market:'homeRun',side:'yes',line:null,inclusive:true},
    {sport:'MLB',player:'Jake Burger',team:'TEXAS RANGERS',market:'homeRun',side:'yes',line:null,inclusive:true}
  ];
  const out=await analyzeMlbSlip(legs,{referenceTime:'2099-09-23T15:00:00Z',now:'2099-09-23T15:00:00Z'});
  assert.equal(out.counts.unresolved,0);
  assert.equal(out.counts.pending,4);
  assert.deepEqual(out.results.map(r=>r.gameId),['1001','1002','1003','1004']);
  assert.ok(out.results.every(r=>String(r.resolutionSource).startsWith('mlb-official-')));
  assert.ok(out.results.every(r=>r.probability===null));
});

test('official MLB fallback does not reject a supported prop just because the model has no probability row', async t=>{
  const original=global.fetch;t.after(()=>{global.fetch=original;});installFourPlayerFetch();
  const out=await analyzeMlbSlip([
    {sport:'MLB',player:'Riley Greene',team:'DETROIT TIGERS',market:'runs',side:'over',line:0.5,inclusive:false}
  ],{referenceTime:'2099-09-23T15:00:00Z',now:'2099-09-23T15:00:00Z'});
  assert.equal(out.results[0].status,'PENDING');
  assert.equal(out.results[0].probability,null);
  assert.equal(out.counts.unresolved,0);
});

test('MLB live stat extraction covers batter and pitcher markets beyond the old six-market set', ()=>{
  const feed={
    liveData:{
      decisions:{winner:{id:99}},
      boxscore:{teams:{away:{players:{ID7:{person:{id:7,fullName:'Test Hitter'},stats:{batting:{hits:3,doubles:1,triples:0,homeRuns:1,totalBases:7,rbi:2,runs:2,baseOnBalls:1,strikeOuts:1,stolenBases:1}}}}},home:{players:{ID99:{person:{id:99,fullName:'Test Pitcher'},stats:{pitching:{strikeOuts:8,inningsPitched:'6.2',hits:5,earnedRuns:2,baseOnBalls:1,homeRuns:1}}}}}}}
    }
  };
  const hitter=playerGameStats(feed,7,'Test Hitter');
  assert.equal(currentForMarket(hitter,'singles'),1);
  assert.equal(currentForMarket(hitter,'extraBaseHits'),2);
  assert.equal(currentForMarket(hitter,'hitsRuns'),5);
  assert.equal(currentForMarket(hitter,'runsRbi'),4);
  assert.equal(currentForMarket(hitter,'batterStrikeouts'),1);
  const pitcher=playerGameStats(feed,99,'Test Pitcher');
  assert.equal(currentForMarket(pitcher,'pitcherStrikeouts'),8);
  assert.equal(currentForMarket(pitcher,'pitchingOuts'),20);
  assert.equal(currentForMarket(pitcher,'hitsAllowed'),5);
  assert.equal(currentForMarket(pitcher,'earnedRuns'),2);
  assert.equal(currentForMarket(pitcher,'walksAllowed'),1);
  assert.equal(currentForMarket(pitcher,'homeRunsAllowed'),1);
  assert.equal(currentForMarket(pitcher,'pitcherWin'),1);
});

test('expanded MLB market metadata settles common live props without unsupported-market rejection', ()=>{
  for(const market of ['runs','singles','doubles','triples','walks','batterStrikeouts','hitsRuns','hitsRbi','runsRbi','extraBaseHits','pitcherStrikeouts','pitchingOuts','hitsAllowed','earnedRuns','walksAllowed','homeRunsAllowed','pitcherWin']){
    assert.ok(MARKET_META[market],`${market} should be tracked`);
  }
  assert.equal(settleStatus({market:'pitcherStrikeouts',side:'over',line:7.5,inclusive:false},8,'in'),'HIT');
  assert.equal(settleStatus({market:'pitcherWin',side:'yes',line:null,inclusive:true},0,'in'),'LIVE');
  assert.equal(settleStatus({market:'pitcherWin',side:'yes',line:null,inclusive:true},1,'post'),'HIT');
});
