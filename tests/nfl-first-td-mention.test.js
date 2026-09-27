const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeFootballMarketVariant}=require('../lib/slip-parser-wrapper-base');
const {normalizeLeg,firstTdProbability}=require('../server/api/lib/parlay-engine');

test('First Touchdown scorer text is preserved as firstTd instead of ATD',()=>{
  const leg=normalizeFootballMarketVariant({
    sport:'NFL',player:'Derrick Henry',market:'atd',side:'yes',line:null,inclusive:true,
    originalText:'Derrick Henry First Touchdown Scorer'
  });
  assert.equal(leg.market,'firstTd');
  assert.equal(leg.side,'yes');
  assert.equal(leg.line,null);
});

test('ordinary Anytime TD remains ATD',()=>{
  const leg=normalizeFootballMarketVariant({
    sport:'NFL',player:'Derrick Henry',market:'atd',side:'yes',line:null,inclusive:true,
    originalText:'Derrick Henry Anytime Touchdown Scorer'
  });
  assert.equal(leg.market,'atd');
});

test('NFL engine treats First TD as a distinct binary market',()=>{
  const leg=normalizeLeg({sport:'NFL',player:'Derrick Henry',market:'firstTd',side:'over',line:null});
  assert.equal(leg.market,'firstTd');
  assert.equal(leg.side,'yes');
  assert.equal(leg.line,0.5);
});

test('First TD probability is distinct from ATD and uses the Sports Outpost role adjustment',()=>{
  const player={probabilities:{atd:.50},usage:70,rz:10};
  const probability=firstTdProbability(player);
  assert.ok(probability>0);
  assert.ok(probability<.50);
  assert.ok(probability<=.22);
});
