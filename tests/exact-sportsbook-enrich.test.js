const test=require('node:test');
const assert=require('node:assert/strict');
const {hasFullBookPricing,applyExactResolution,enrichMissingExactSportsbooks}=require('../server/api/lib/exact-sportsbook-enrich');

test('sportsbook absent from snapshot is hydrated when every exact selection resolves',async()=>{
  const slip={legs:[
    {id:'mahomes',sport:'NFL',player:'Patrick Mahomes',market:'passYds',side:'over',line:225,inclusive:true,bookOffers:{Bovada:{oddsAmerican:-180}}},
    {id:'rice',sport:'NFL',player:'Rashee Rice',market:'recYds',side:'over',line:30,inclusive:true,bookOffers:{Bovada:{oddsAmerican:-350}}}
  ]};
  const out=await enrichMissingExactSportsbooks(slip,{books:['FanDuel'],log:false,resolve:async()=>({
    exact:false,
    url:null,
    selections:[
      {price:-154,line:224.5,marketKey:'player_pass_yds_alternate'},
      {price:-340,line:29.5,marketKey:'player_reception_yds_alternate'}
    ]
  })});
  assert.equal(hasFullBookPricing(out,'FanDuel'),true);
  assert.equal(out.legs[0].bookOffers.FanDuel.oddsAmerican,-154);
  assert.equal(out.legs[0].bookOffers.FanDuel.matchedLine,224.5);
  assert.equal(out.legs[1].bookOffers.FanDuel.oddsAmerican,-340);
  assert.equal(out.sportsbookLinks?.FanDuel,undefined);
});

test('full exact FanDuel resolution keeps real prefilled link and provider IDs',async()=>{
  const slip={legs:[
    {sport:'NFL',player:'Patrick Mahomes',market:'passYds',side:'over',line:225,inclusive:true,bookOffers:{}},
    {sport:'NFL',player:'Rashee Rice',market:'recYds',side:'over',line:30,inclusive:true,bookOffers:{}}
  ]};
  const url='https://account.sportsbook.fanduel.com/sportsbook/addToBetslip?marketId%5B0%5D=1&selectionId%5B0%5D=11&marketId%5B1%5D=2&selectionId%5B1%5D=22';
  const out=await enrichMissingExactSportsbooks(slip,{books:['FanDuel'],log:false,resolve:async()=>({
    exact:true,url,selections:[
      {price:-154,line:224.5,marketKey:'player_pass_yds_alternate',marketId:'1',selectionId:'11',selectionLink:'https://sportsbook.fanduel.com/addToBetslip?marketId=1&selectionId=11'},
      {price:-340,line:29.5,marketKey:'player_reception_yds_alternate',marketId:'2',selectionId:'22',selectionLink:'https://sportsbook.fanduel.com/addToBetslip?marketId=2&selectionId=22'}
    ]
  })});
  assert.equal(hasFullBookPricing(out,'FanDuel'),true);
  assert.equal(out.sportsbookLinks.FanDuel,url);
  assert.equal(out.legs[1].bookOffers.FanDuel.selectionId,'22');
  assert.equal(out.legs[1].bookOffers.FanDuel.marketId,'2');
});

test('missing coverage is proactively checked for both FanDuel and DraftKings',async()=>{
  const slip={legs:[{sport:'NFL',player:'Test Player',market:'recYds',side:'over',line:20,inclusive:true,bookOffers:{}}]};
  const calls=[];
  const out=await enrichMissingExactSportsbooks(slip,{log:false,resolve:async({book})=>{
    calls.push(book);
    return {exact:true,url:null,selections:[{price:book==='FanDuel'?-120:-115,line:19.5}]};
  }});
  assert.deepEqual(calls,['FanDuel','DraftKings']);
  assert.equal(hasFullBookPricing(out,'FanDuel'),true);
  assert.equal(hasFullBookPricing(out,'DraftKings'),true);
});

test('incomplete or wrong-line resolution never fabricates sportsbook coverage',async()=>{
  const slip={legs:[
    {sport:'NFL',player:'One',market:'recYds',side:'over',line:20,inclusive:true,bookOffers:{}},
    {sport:'NFL',player:'Two',market:'recYds',side:'over',line:30,inclusive:false,bookOffers:{}}
  ]};
  const incomplete={exact:false,url:null,selections:[{price:-110,line:19.5},null]};
  assert.equal(applyExactResolution(slip,'FanDuel',incomplete),slip);
  const nearby={exact:true,url:null,selections:[{price:-110,line:19.5},{price:-120,line:29.5}]};
  assert.equal(applyExactResolution(slip,'FanDuel',nearby),slip);
  const out=await enrichMissingExactSportsbooks(slip,{books:['FanDuel'],log:false,resolve:async()=>nearby});
  assert.equal(out,slip);
  assert.equal(hasFullBookPricing(out,'FanDuel'),false);
});
