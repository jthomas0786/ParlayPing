const test=require('node:test');
const assert=require('node:assert/strict');
const {SPORT_ENUM,normalizeSport,sanitizeLeg,heuristicParse}=require('../api/lib/slip-parser');

test('legacy/vision parser schema allows TABLE_TENNIS explicitly',()=>{
  assert.ok(SPORT_ENUM.includes('TABLE_TENNIS'));
  assert.equal(normalizeSport('table tennis'),'TABLE_TENNIS');
  assert.equal(normalizeSport('ping pong'),'TABLE_TENNIS');
});

test('matchWinner is accepted as a binary leg without a numeric line',()=>{
  const leg=sanitizeLeg({sport:'TABLE_TENNIS',player:'Alexis Lebrun',market:'matchWinner',side:'yes',line:null,inclusive:true,originalText:'Alexis Lebrun Match Winner'});
  assert.ok(leg);
  assert.equal(leg.sport,'TABLE_TENNIS');
  assert.equal(leg.market,'matchWinner');
  assert.equal(leg.line,null);
  assert.equal(leg.inclusive,true);
});

test('fightWinner is accepted as a binary leg without a numeric line',()=>{
  const leg=sanitizeLeg({sport:'MMA',player:'Alex Pereira',market:'fightWinner',side:'yes',line:null,inclusive:true,originalText:'Alex Pereira Fight Winner'});
  assert.ok(leg);
  assert.equal(leg.market,'fightWinner');
  assert.equal(leg.line,null);
});

test('plain Table Tennis text can parse a match-winner selection without AI',()=>{
  const legs=heuristicParse('Table Tennis\nAlexis Lebrun Match Winner');
  assert.equal(legs.length,1);
  assert.equal(legs[0].sport,'TABLE_TENNIS');
  assert.equal(legs[0].player,'Alexis Lebrun');
  assert.equal(legs[0].market,'matchWinner');
  assert.equal(legs[0].side,'yes');
});
