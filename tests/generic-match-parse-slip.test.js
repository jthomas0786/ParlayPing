const test=require('node:test');
const assert=require('node:assert/strict');
const {parseSlip}=require('../lib/slip-parser-wrapper');

const cases=[
  ['Volleyball\nTeam A moneyline','VOLLEYBALL','Team A'],
  ['Cricket\nGuyana Amazon Warriors to win the match','CRICKET','Guyana Amazon Warriors'],
  ['NRL\nMelbourne Storm match winner','RUGBY_LEAGUE','Melbourne Storm'],
  ['AFL\nCollingwood to win the game','AFL','Collingwood'],
  ['Boxing\nFighter One to win the fight','BOXING','Fighter One']
];

for(const [text,sport,selection] of cases){
  test(`parseSlip routes ${sport} winner text end to end`,async()=>{
    const parsed=await parseSlip({text,mediaUrls:[]});
    const leg=parsed.legs.find(item=>item.sport===sport&&item.market==='matchWinner');
    assert.ok(leg,`expected ${sport} matchWinner leg`);
    assert.equal(leg.player,selection);
    assert.equal(leg.side,'yes');
    assert.equal(leg.line,null);
    assert.equal(parsed.sport,sport);
  });
}

test('parseSlip does not invent a winner from a matchup-only generic sport line',async()=>{
  const parsed=await parseSlip({text:'Volleyball\nTeam A vs Team B',mediaUrls:[]});
  const invented=parsed.legs.find(item=>item.sport==='VOLLEYBALL'&&item.market==='matchWinner');
  assert.equal(invented,undefined);
});
