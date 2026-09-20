const test=require('node:test');
const assert=require('node:assert/strict');
const {extendedHeuristic,canonicalizeLeg,sanitizeExtended,normalizeSport}=require('../lib/slip-parser-wrapper');

test('soccer text parses shots on target before generic shots',()=>{
  const legs=extendedHeuristic('Premier League\nBukayo Saka Over 1.5 Shots on Target\nCole Palmer 3+ Shots');
  assert.equal(legs.length,2);
  assert.equal(legs[0].sport,'SOCCER');
  assert.equal(legs[0].market,'shotsOnTarget');
  assert.equal(legs[0].line,1.5);
  assert.equal(legs[1].market,'shots');
  assert.equal(legs[1].inclusive,true);
});

test('soccer binary markets parse as yes selections',()=>{
  const legs=extendedHeuristic('Soccer\nErling Haaland Anytime Goal Scorer\nDeclan Rice To Receive A Card');
  assert.deepEqual(legs.map(l=>l.market),['anytimeGoal','toReceiveCard']);
  assert.ok(legs.every(l=>l.side==='yes'&&l.line===null));
});

test('tennis parses aces and match winner',()=>{
  const legs=extendedHeuristic('ATP Tennis\nCarlos Alcaraz Over 7.5 Aces\nJannik Sinner To Win Match');
  assert.equal(legs[0].sport,'TENNIS');
  assert.equal(legs[0].market,'aces');
  assert.equal(legs[1].market,'matchWinner');
  assert.equal(legs[1].side,'yes');
});

test('MMA winner is a fighter binary market',()=>{
  const legs=extendedHeuristic('UFC\nAlex Pereira To Win Fight');
  assert.equal(legs.length,1);
  assert.equal(legs[0].sport,'MMA');
  assert.equal(legs[0].market,'fightWinner');
});

test('esports map kill props use explicit canonical market',()=>{
  const legs=extendedHeuristic('CS2 Esports\nZywOo Over 32.5 Kills Maps 1-2');
  assert.equal(legs.length,1);
  assert.equal(legs[0].sport,'ESPORTS');
  assert.equal(legs[0].market,'killsMaps12');
});

test('table tennis aliases normalize and match winner stays binary',()=>{
  assert.equal(normalizeSport('ping pong'),'TABLE_TENNIS');
  const legs=extendedHeuristic('Table Tennis\nAlexis Lebrun To Win Match');
  assert.equal(legs.length,1);
  assert.equal(legs[0].sport,'TABLE_TENNIS');
  assert.equal(legs[0].market,'matchWinner');
});

test('legacy AI soccer market aliases canonicalize safely',()=>{
  const leg=canonicalizeLeg({sport:'SOCCER',player:'Bukayo Saka',market:'shotsOnGoal',side:'over',line:1.5,inclusive:false,originalText:'Saka O1.5 shots on target'});
  assert.equal(leg.market,'shotsOnTarget');
});

test('extended binary sanitizer does not require a numeric line',()=>{
  const leg=sanitizeExtended({sport:'MMA',player:'Fighter One',market:'fightWinner',side:'yes',line:null});
  assert.ok(leg);
  assert.equal(leg.line,null);
});
