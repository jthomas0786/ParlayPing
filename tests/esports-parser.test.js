const test=require('node:test');
const assert=require('node:assert/strict');
const {extendedHeuristic,canonicalizeLeg,normalizeSport}=require('../lib/slip-parser-wrapper');

test('esports text heuristic parses CS2 team moneyline as match winner',()=>{
  const legs=extendedHeuristic('CS2\nTeam Vitality moneyline');
  assert.equal(legs.length,1);
  assert.equal(legs[0].sport,'ESPORTS');
  assert.equal(legs[0].player,'Team Vitality');
  assert.equal(legs[0].market,'matchWinner');
  assert.equal(legs[0].side,'yes');
  assert.equal(legs[0].line,null);
});

test('esports text heuristic parses Valorant series winner',()=>{
  const legs=extendedHeuristic('Valorant\nSentinels to win the series');
  assert.equal(legs.length,1);
  assert.equal(legs[0].sport,'ESPORTS');
  assert.equal(legs[0].player,'Sentinels');
  assert.equal(legs[0].market,'matchWinner');
});

test('structured esports moneyline aliases canonicalize to matchWinner',()=>{
  const leg=canonicalizeLeg({sport:'CS2',player:'NAVI',market:'moneyline',side:'yes',line:null,inclusive:true});
  assert.equal(leg.sport,'ESPORTS');
  assert.equal(leg.market,'matchWinner');
});

test('esports game aliases normalize safely',()=>{
  for(const name of ['CS2','Counter Strike 2','Valorant','League of Legends','LoL','Dota 2'])assert.equal(normalizeSport(name),'ESPORTS');
});
