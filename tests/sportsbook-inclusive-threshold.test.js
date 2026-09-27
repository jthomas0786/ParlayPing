const test=require('node:test');
const assert=require('node:assert/strict');
const {parseNestedSnapshot,sportsbookLineForLeg,lineMatchesLeg}=require('../server/api/lib/sportsbook-enrich');

function nflDoc(){
  return {games:[{
    gameId:'kc-mia',away:'KC',home:'MIA',
    players:[{name:'Patrick Mahomes',team:'KC',odds:{passYds:{
      line:224.5,
      over:{best:{book:'FanDuel',price:-110},all:[{book:'FanDuel',price:-110},{book:'DraftKings',price:-112}]},
      under:{best:{book:'FanDuel',price:-110},all:[{book:'FanDuel',price:-110}]},
      alternates:[{line:224.5,over:{best:{book:'FanDuel',price:-110},all:[{book:'FanDuel',price:-110},{book:'DraftKings',price:-112}]},under:{best:{book:'FanDuel',price:-110},all:[{book:'FanDuel',price:-110}]}}]
    }}}]
  }]};
}

test('whole-number plus thresholds map to the exact sportsbook half-line',()=>{
  const leg={sport:'NFL',player:'Patrick Mahomes',team:'KC',gameId:'kc-mia',market:'passYds',side:'over',line:225,inclusive:true};
  assert.equal(sportsbookLineForLeg(leg),224.5);
  assert.equal(lineMatchesLeg(224.5,leg),true);
  const parsed=parseNestedSnapshot(nflDoc(),leg);
  assert.equal(parsed.bookOffers.FanDuel.oddsAmerican,-110);
  assert.equal(parsed.bookOffers.DraftKings.oddsAmerican,-112);
});

test('non-inclusive 225 does not silently substitute over 224.5',()=>{
  const leg={sport:'NFL',player:'Patrick Mahomes',team:'KC',gameId:'kc-mia',market:'passYds',side:'over',line:225,inclusive:false};
  assert.equal(sportsbookLineForLeg(leg),225);
  assert.equal(lineMatchesLeg(224.5,leg),false);
  const parsed=parseNestedSnapshot(nflDoc(),leg);
  assert.equal(parsed.bookOffers.FanDuel,undefined);
});

test('inclusive under thresholds map upward by a half point',()=>{
  const leg={market:'rushYds',side:'under',line:70,inclusive:true};
  assert.equal(sportsbookLineForLeg(leg),70.5);
  assert.equal(lineMatchesLeg(70.5,leg),true);
});
