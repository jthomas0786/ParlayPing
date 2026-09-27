const test=require('node:test');
const assert=require('node:assert/strict');
const {sportsbookEquivalentLeg}=require('../server/api/lib/sportsbook-enrich-inclusive');

test('225+ passing yards maps to the sportsbook over 224.5 line',()=>{
  const leg=sportsbookEquivalentLeg({market:'passYds',side:'over',line:225,inclusive:true});
  assert.equal(leg.line,224.5);
  assert.equal(leg.inclusive,false);
});

test('30+ receiving yards maps to over 29.5',()=>{
  const leg=sportsbookEquivalentLeg({market:'recYds',side:'over',line:30,inclusive:true});
  assert.equal(leg.line,29.5);
});

test('inclusive under whole-number thresholds map upward by half a point',()=>{
  const leg=sportsbookEquivalentLeg({market:'rushYds',side:'under',line:70,inclusive:true});
  assert.equal(leg.line,70.5);
});

test('non-inclusive lines are never shifted',()=>{
  const leg=sportsbookEquivalentLeg({market:'passYds',side:'over',line:225,inclusive:false});
  assert.equal(leg.line,225);
});
