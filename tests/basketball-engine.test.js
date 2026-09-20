const test = require('node:test');
const assert = require('node:assert/strict');
const { heuristicParse, sanitizeLeg, BASKETBALL_MARKETS } = require('../api/lib/slip-parser');
const { parseSummaryPlayers, settleStatus, targetForLeg, quoteProbability } = require('../api/lib/basketball-engine');
const { normalizeSport, SUPPORTED_ANALYSIS } = require('../api/lib/sport-router');

test('heuristic parses WNBA points rebounds and steals without MLB/NHL collisions', () => {
  const legs = heuristicParse('WNBA\nAja Wilson 25+ Points\nAja Wilson 10+ Rebounds\nJackie Young Over 1.5 Steals');
  assert.equal(legs.length, 3);
  assert.deepEqual(legs.map(l=>l.sport), ['WNBA','WNBA','WNBA']);
  assert.deepEqual(legs.map(l=>l.market), ['points','rebounds','steals']);
  assert.equal(legs[0].inclusive, true);
  assert.equal(legs[2].line, 1.5);
});

test('heuristic recognizes NBA PRA and made threes', () => {
  const legs = heuristicParse('NBA\nJalen Brunson Over 39.5 PRA\nStephen Curry 4+ Made Threes');
  assert.equal(legs.length, 2);
  assert.equal(legs[0].market, 'pra');
  assert.equal(legs[1].market, 'threes');
  assert.equal(legs[1].inclusive, true);
});

test('basketball binary props sanitize correctly', () => {
  const leg=sanitizeLeg({sport:'NBA',player:'Nikola Jokic',market:'tripleDouble',side:'yes',line:null,inclusive:true});
  assert.ok(leg);
  assert.equal(leg.line,null);
  assert.equal(leg.side,'yes');
  assert.ok(BASKETBALL_MARKETS.has('tripleDouble'));
});

test('router treats NBA NCAAB and WNBA as supported sports', () => {
  assert.equal(normalizeSport('college basketball'),'NCAAB');
  assert.ok(SUPPORTED_ANALYSIS.has('NBA'));
  assert.ok(SUPPORTED_ANALYSIS.has('NCAAB'));
  assert.ok(SUPPORTED_ANALYSIS.has('WNBA'));
});

test('ESPN basketball boxscore parser derives core and combo stats', () => {
  const summary={boxscore:{players:[{team:{abbreviation:'LVA'},statistics:[{keys:['minutes','fieldGoalsMade-fieldGoalsAttempted','threePointFieldGoalsMade-threePointFieldGoalsAttempted','freeThrowsMade-freeThrowsAttempted','rebounds','assists','steals','blocks','turnovers','points'],athletes:[{athlete:{id:'1',displayName:"A'ja Wilson"},stats:['34','10-18','2-4','6-7','12','5','2','3','1','28']}]}]}]}};
  const [player]=parseSummaryPlayers(summary,{id:'G1'});
  assert.equal(player.current.points,28);
  assert.equal(player.current.rebounds,12);
  assert.equal(player.current.assists,5);
  assert.equal(player.current.threes,2);
  assert.equal(player.current.pra,45);
  assert.equal(player.current.doubleDouble,1);
  assert.equal(player.current.tripleDouble,0);
});

test('basketball live counting markets settle monotonically', () => {
  const over={market:'points',side:'over',line:25,inclusive:true};
  const under={market:'rebounds',side:'under',line:9.5,inclusive:false};
  assert.equal(targetForLeg(over),25);
  assert.equal(settleStatus(over,25,'in'),'HIT');
  assert.equal(settleStatus(over,24,'in'),'LIVE');
  assert.equal(settleStatus(over,24,'post'),'MISS');
  assert.equal(settleStatus(under,10,'in'),'MISS');
});

test('double-double and triple-double settle from derived indicators', () => {
  const dd={market:'doubleDouble',side:'yes',line:null,inclusive:true};
  const td={market:'tripleDouble',side:'yes',line:null,inclusive:true};
  assert.equal(settleStatus(dd,1,'in'),'HIT');
  assert.equal(settleStatus(td,0,'in'),'LIVE');
  assert.equal(settleStatus(td,0,'post'),'MISS');
});

test('basketball sportsbook probability de-vigs two-sided prices', () => {
  const odds={rows:[{player:'Aja Wilson',team:'LVA',market:'points',line:24.5,commenceTime:'2026-09-20T23:00:00Z',overPrice:-110,underPrice:-110,book:'TestBook'}]};
  const match={game:{startTime:'2026-09-20T23:00:00Z'},player:{team:'LVA'}};
  const quote=quoteProbability(odds,match,{player:'Aja Wilson',team:'LVA',market:'points',side:'over',line:25,inclusive:true});
  assert.ok(Math.abs(quote.probability-0.5)<1e-12);
  assert.equal(quote.method,'sportsbook-devig-median');
});
