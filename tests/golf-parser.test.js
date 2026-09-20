const test=require('node:test');
const assert=require('node:assert/strict');
const {extendedHeuristic,canonicalizeLeg,normalizeSport,parseSlip}=require('../lib/slip-parser-wrapper');

test('Golf text parses explicit tournament winner',()=>{
  const legs=extendedHeuristic('Golf\nRory McIlroy to win the tournament');
  assert.equal(legs.length,1);
  assert.equal(legs[0].sport,'GOLF');
  assert.equal(legs[0].player,'Rory McIlroy');
  assert.equal(legs[0].market,'tournamentWinner');
  assert.equal(legs[0].side,'yes');
  assert.equal(legs[0].line,null);
});

test('Golf structured outright alias canonicalizes to tournamentWinner',()=>{
  const leg=canonicalizeLeg({sport:'PGA',player:'Scottie Scheffler',market:'outright',side:'yes',line:null});
  assert.equal(leg.sport,'GOLF');
  assert.equal(leg.market,'tournamentWinner');
});

test('Golf aliases normalize consistently',()=>{
  assert.equal(normalizeSport('Golf'),'GOLF');
  assert.equal(normalizeSport('PGA'),'GOLF');
  assert.equal(normalizeSport('DP World'),'GOLF');
  assert.equal(normalizeSport('LIV Golf'),'GOLF');
});

test('parseSlip routes Golf winner text end to end',async()=>{
  const parsed=await parseSlip({text:'PGA Golf\nScottie Scheffler tournament winner'});
  assert.equal(parsed.sport,'GOLF');
  assert.equal(parsed.legs.length,1);
  assert.equal(parsed.legs[0].player,'Scottie Scheffler');
  assert.equal(parsed.legs[0].market,'tournamentWinner');
});

test('Golf matchup or leaderboard text does not invent a tournament winner',()=>{
  assert.equal(extendedHeuristic('Golf\nRory McIlroy vs Scottie Scheffler').length,0);
  assert.equal(extendedHeuristic('Golf\nRory McIlroy top 10').length,0);
});
