const test=require('node:test');
const assert=require('node:assert/strict');
const {canonicalLeg}=require('../server/api/lib/share-slip');

test('legacy X First TD tokens are upgraded before sportsbook enrichment',()=>{
  const leg=canonicalLeg({sport:'NFL',player:'Jahmyr Gibbs',market:'atd',displayMarket:'ATD',originalText:'Jahmyr Gibbs First Touchdown Scorer',oddsAmerican:270});
  assert.equal(leg.market,'firstTd');
  assert.equal(leg.displayMarket,'1ST TD');
  assert.equal(leg.oddsAmerican,270);
});

test('true anytime TD legs stay ATD',()=>{
  const leg=canonicalLeg({sport:'NFL',player:'Jahmyr Gibbs',market:'atd',displayMarket:'ATD',originalText:'Jahmyr Gibbs Anytime Touchdown Scorer'});
  assert.equal(leg.market,'atd');
});
