const test=require('node:test');
const assert=require('node:assert/strict');
const {parseSlip,sanitizeLeg}=require('../server/api/lib/slip-parser');
const {normalizeUniversalLeg}=require('../server/api/lib/sport-router');
const {pregameResult,sportsbookQuotesSafe}=require('../lib/basketball-adapter');

test('sanitizeLeg preserves only valid explicit American odds and sportsbook',()=>{
  const leg=sanitizeLeg({sport:'WNBA',player:'Breanna Stewart',market:'pra',side:'over',line:30,inclusive:true,originalText:'Breanna Stewart 30+ PRA +125',oddsAmerican:125,sportsbook:'FanDuel'});
  assert.equal(leg.oddsAmerican,125);
  assert.equal(leg.sportsbook,'FanDuel');
  const invalid=sanitizeLeg({sport:'WNBA',player:'Breanna Stewart',market:'pra',side:'over',line:30,inclusive:true,oddsAmerican:50,sportsbook:'FanDuel'});
  assert.equal(invalid.oddsAmerican,null);
});

test('vision schema requests exact per-leg sportsbook price metadata and keeps it',async()=>{
  const oldKey=process.env.OPENAI_API_KEY,oldFetch=global.fetch;
  process.env.OPENAI_API_KEY='test-key';
  let sawOddsSchema=false;
  global.fetch=async(_url,init)=>{
    const body=JSON.parse(init.body);
    const props=body?.text?.format?.schema?.properties?.legs?.items?.properties||{};
    sawOddsSchema=Boolean(props.oddsAmerican&&props.sportsbook);
    return {ok:true,status:200,json:async()=>({output_text:JSON.stringify({legs:[{sport:'WNBA',player:'Breanna Stewart',team:'NYL',market:'pra',side:'over',line:30,inclusive:true,originalText:'Breanna Stewart 30+ PRA +125',oddsAmerican:125,sportsbook:'FanDuel'}]})})};
  };
  try{
    const parsed=await parseSlip({mediaUrls:['https://example.com/slip.png']});
    assert.equal(sawOddsSchema,true);
    assert.equal(parsed.legs[0].oddsAmerican,125);
    assert.equal(parsed.legs[0].sportsbook,'FanDuel');
  }finally{
    global.fetch=oldFetch;
    if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;
  }
});

test('multi-sport normalization carries explicit slip quote metadata',()=>{
  const leg=normalizeUniversalLeg({sport:'WNBA',player:'Angel Reese',market:'rebsAsts',side:'over',line:12,inclusive:true,oddsAmerican:-105,sportsbook:'DraftKings Sportsbook'},0);
  assert.equal(leg.oddsAmerican,-105);
  assert.equal(leg.sportsbook,'DraftKings Sportsbook');
});

test('WNBA exact slip price fills a combo milestone missing from provider quotes',()=>{
  const leg={id:'stewart-pra',sport:'WNBA',player:'Breanna Stewart',team:'NYL',market:'pra',side:'over',line:30,inclusive:true,oddsAmerican:125,sportsbook:'FanDuel'};
  const eventRow={eventId:'wnba-1',sport:'WNBA',commenceTime:'2026-09-24T01:00:00.000Z',awayTeam:'Chicago Sky',homeTeam:'New York Liberty',player:'Breanna Stewart',team:'NYL',market:'points',line:20.5,book:'FanDuel',overPrice:-110,underPrice:-110};
  const result=pregameResult({rows:[eventRow]},leg,eventRow);
  assert.equal(result.oddsAmerican,125);
  assert.equal(result.sportsbook,'FanDuel');
  assert.equal(result.oddsPriceKind,'explicit-slip');
  assert.equal(result.bookOffers.FanDuel.oddsAmerican,125);
  assert.equal(result.bookOffers.FanDuel.priceKind,'explicit-slip');
  assert.equal(result.probabilityMethod,'sportsbook-slip-implied');
  assert.ok(Math.abs(result.probability-(100/225))<1e-9);
});

test('fresh exact provider quote wins over screenshot price for same sportsbook',()=>{
  const leg={sport:'WNBA',player:'Jordin Canada',market:'assists',side:'over',line:6,inclusive:true,oddsAmerican:140,sportsbook:'DraftKings'};
  const exact={eventId:'wnba-2',commenceTime:'2026-09-24T01:00:00.000Z',player:'Jordin Canada',market:'assists',line:5.5,book:'DraftKings',overPrice:115,underPrice:-145};
  const offers=sportsbookQuotesSafe({rows:[exact]},leg,exact);
  assert.equal(offers.bookOffers.DraftKings.oddsAmerican,115);
  assert.notEqual(offers.bookOffers.DraftKings.priceKind,'explicit-slip');
});
