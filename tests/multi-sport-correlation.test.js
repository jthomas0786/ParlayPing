const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeMultiSport}=require('../api/lib/sport-router');

const golfSnapshot={
  meta:{fetchedAt:'2026-09-20T19:00:00.000Z',source:'parlayapi-pinnacle',settlementConnected:false},
  rows:[
    {sport:'GOLF',sportKey:'golf_test',eventId:'evt',marketId:'mkt',tournament:'Test Open',market:'tournamentWinner',selection:'Golfer One',bookKey:'pinnacle',fairProbability:0.20,settlementConnected:false},
    {sport:'GOLF',sportKey:'golf_test',eventId:'evt',marketId:'mkt',tournament:'Test Open',market:'tournamentWinner',selection:'Golfer Two',bookKey:'pinnacle',fairProbability:0.10,settlementConnected:false}
  ]
};

test('multi-sport router withholds same-tournament Golf probability before reply formatting',async()=>{
  const analysis=await analyzeMultiSport([
    {sport:'GOLF',player:'Golfer One',market:'tournamentWinner',side:'yes'},
    {sport:'GOLF',player:'Golfer Two',market:'tournamentWinner',side:'yes'}
  ],{golfSnapshot});

  assert.equal(analysis.counts.pending,2);
  assert.equal(analysis.correlation.hasRisk,true);
  assert.equal(analysis.correlation.groups.length,1);
  assert.equal(analysis.correlation.groups[0].type,'same-game');
  assert.equal(analysis.combinedTailProbability,null);
  assert.equal(analysis.combinedTailProbabilityPct,null);
  assert.equal(analysis.combinedTailProbabilityMethod,'withheld-correlated-legs');
});
