const test=require('node:test');
const assert=require('node:assert/strict');
const {hasFullBookPricing,applyExactResolution,enrichMissingExactSportsbooks}=require('../server/api/lib/exact-sportsbook-enrich');

test('exact FanDuel fallback fills every missing price and full betslip link',async()=>{
  const slip={legs:[
    {id:'mahomes',bookOffers:{FanDuel:{oddsAmerican:-154}}},
    {id:'rice',bookOffers:{Bovada:{oddsAmerican:-400}}}
  ]};
  let calls=0;
  const out=await enrichMissingExactSportsbooks(slip,{books:['FanDuel'],log:false,resolve:async({book,legs})=>{
    calls++;
    assert.equal(book,'FanDuel');
    assert.equal(legs.length,2);
    return {exact:true,url:'https://account.sportsbook.fanduel.com/sportsbook/addToBetslip?marketId%5B0%5D=1&selectionId%5B0%5D=11&marketId%5B1%5D=2&selectionId%5B1%5D=22',selections:[
      {price:-154,line:224.5,marketKey:'player_pass_yds_alternate',marketId:'1',selectionId:'11',selectionLink:'https://sportsbook.fanduel.com/addToBetslip?marketId=1&selectionId=11'},
      {price:-340,line:29.5,marketKey:'player_reception_yds_alternate',marketId:'2',selectionId:'22',selectionLink:'https://sportsbook.fanduel.com/addToBetslip?marketId=2&selectionId=22'}
    ]};
  }});
  assert.equal(calls,1);
  assert.equal(hasFullBookPricing(out,'FanDuel'),true);
  assert.equal(out.legs[1].bookOffers.FanDuel.oddsAmerican,-340);
  assert.equal(out.legs[1].bookOffers.FanDuel.matchedLine,29.5);
  assert.match(out.sportsbookLinks.FanDuel,/account\.sportsbook\.fanduel\.com/);
});

test('complete FanDuel snapshot coverage does not spend a resolver request',async()=>{
  const slip={legs:[
    {bookOffers:{FanDuel:{oddsAmerican:-150}}},
    {bookOffers:{FanDuel:{oddsAmerican:-200}}}
  ]};
  let calls=0;
  const out=await enrichMissingExactSportsbooks(slip,{books:['FanDuel'],log:false,resolve:async()=>{calls++;return null;}});
  assert.equal(calls,0);
  assert.equal(out,slip);
});

test('incomplete or failed exact resolution never fabricates FanDuel coverage',async()=>{
  const slip={legs:[{bookOffers:{}},{bookOffers:{}}]};
  const result={exact:false,url:null,selections:[{price:-110},null]};
  assert.equal(applyExactResolution(slip,'FanDuel',result),slip);
  const out=await enrichMissingExactSportsbooks(slip,{books:['FanDuel'],log:false,resolve:async()=>result});
  assert.equal(out,slip);
  assert.equal(hasFullBookPricing(out,'FanDuel'),false);
});
