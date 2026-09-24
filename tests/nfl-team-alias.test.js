const test=require('node:test');
const assert=require('node:assert/strict');
const {teamMatches,normalizeLeg}=require('../server/api/lib/parlay-engine');

const game={game:{away:{abbr:'ATL',name:'Atlanta Falcons'},home:{abbr:'GB',name:'Green Bay Packers'}}};

test('NFL team matching accepts full team names from screenshot parser',()=>{
  assert.equal(teamMatches('ATLANTA FALCONS','ATL',game),true);
  assert.equal(teamMatches('GREEN BAY PACKERS','GB',game),true);
});

test('NFL team matching still rejects the wrong side',()=>{
  assert.equal(teamMatches('GREEN BAY PACKERS','ATL',game),false);
  assert.equal(teamMatches('ATLANTA FALCONS','GB',game),false);
});

test('ATD normalization remains intact for parsed mentions',()=>{
  const leg=normalizeLeg({sport:'NFL',player:'Kyle Pitts',team:'ATLANTA FALCONS',market:'atd',side:'yes'});
  assert.equal(leg.market,'atd');
  assert.equal(leg.line,0.5);
  assert.equal(leg.team,'ATLANTA FALCONS');
});
