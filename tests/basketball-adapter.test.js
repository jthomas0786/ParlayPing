const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeBasketballSlip}=require('../lib/basketball-adapter');

const snapshot={
  meta:{sport:'WNBA',fetchedAt:'2026-09-20T15:55:00.000Z'},
  rows:[
    {
      eventId:'evt1',sport:'WNBA',commenceTime:'2026-09-20T17:00:00.000Z',homeTeam:'Connecticut Sun',awayTeam:'Minnesota Lynx',
      player:'Aaliyah Edwards',team:null,market:'points',marketKey:'player_points',line:10.5,book:'Caesars',
      overPrice:-110,underPrice:-110,overImplied:null,underImplied:null
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
    assert.ok(calls.every(url=>!url.includes('espn.com')));
  }finally{global.fetch=original;}
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
