const test=require('node:test');
const assert=require('node:assert/strict');
const {extendedHeuristic,canonicalizeLeg,normalizeSport}=require('../lib/slip-parser-wrapper');

const cases=[
  ['Volleyball\nTeam A moneyline','VOLLEYBALL','Team A'],
  ['Cricket\nGuyana Amazon Warriors to win the match','CRICKET','Guyana Amazon Warriors'],
  ['NRL\nMelbourne Storm match winner','RUGBY_LEAGUE','Melbourne Storm'],
  ['AFL\nCollingwood to win the game','AFL','Collingwood'],
  ['Boxing\nFighter One to win the fight','BOXING','Fighter One']
];

for(const [text,sport,selection] of cases){
  test(`${sport} text parses a binary match-winner selection`,()=>{
    const legs=extendedHeuristic(text);
    assert.equal(legs.length,1);
    assert.equal(legs[0].sport,sport);
    assert.equal(legs[0].player,selection);
    assert.equal(legs[0].market,'matchWinner');
    assert.equal(legs[0].side,'yes');
    assert.equal(legs[0].line,null);
  });
}

test('generic structured moneyline aliases canonicalize safely',()=>{
  const leg=canonicalizeLeg({sport:'Cricket',player:'Team X',market:'moneyline',side:'yes',line:null,inclusive:true});
  assert.equal(leg.sport,'CRICKET');
  assert.equal(leg.market,'matchWinner');
});

test('generic sport aliases normalize consistently',()=>{
  const expected={Volleyball:'VOLLEYBALL',Cricket:'CRICKET',NRL:'RUGBY_LEAGUE','Rugby League':'RUGBY_LEAGUE',AFL:'AFL','Aussie Rules':'AFL',Boxing:'BOXING'};
  for(const [value,sport] of Object.entries(expected))assert.equal(normalizeSport(value),sport);
});

test('soccer text does not get treated as a generic match-winner sport',()=>{
  const legs=extendedHeuristic('Premier League\nArsenal to win the game');
  assert.equal(legs.length,0);
});
