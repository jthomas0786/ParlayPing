const test=require('node:test');
const assert=require('node:assert/strict');
const {rescueNflPregameRows}=require('../server/api/lib/nfl-sportsbook-pregame-fallback');

function snapshot(start='2099-10-02T00:15:00Z'){
  return {games:[{
    gameId:'pit-cle',startDateUTC:start,awayTeam:'PIT',homeTeam:'CLE',
    players:[{name:'KC Concepcion',team:'CLE',odds:{receptions:{line:3.5,over:{best:{book:'FanDuel',price:-138},all:[{book:'FanDuel',price:-138},{book:'DraftKings',price:-151}]},under:{best:{book:'FanDuel',price:104},all:[{book:'FanDuel',price:104}]},alternates:[{line:3.5,over:{best:{book:'FanDuel',price:-138},all:[{book:'FanDuel',price:-138},{book:'DraftKings',price:-151}]},under:{best:{book:'FanDuel',price:104},all:[{book:'FanDuel',price:104}]}}]}}}]
  }]};
}

const unresolved={id:'leg-1',sport:'NFL',player:'KC Concepcion',market:'receptions',side:'over',line:3.5,status:'UNRESOLVED',resolutionReason:'nfl-player-or-team-not-found-in-current-simulation',marketOptions:[]};

test('verified exact NFL sportsbook board can rescue an upcoming player missing from simulation',()=>{
  const rows=rescueNflPregameRows([unresolved],[unresolved],snapshot(),{now:Date.parse('2099-10-01T00:00:00Z')});
  assert.equal(rows[0].status,'PENDING');
  assert.equal(rows[0].gameId,'pit-cle');
  assert.equal(rows[0].matchup,'PIT @ CLE');
  assert.equal(rows[0].startTimeUTC,'2099-10-02T00:15:00Z');
  assert.equal(rows[0].probability,null);
  assert.equal(rows[0].sportsbookPregameFallback,true);
  assert.equal(rows[0].resolutionReason,undefined);
});

test('sportsbook-only fallback rejects nearby lines instead of substituting them',()=>{
  const leg={...unresolved,line:4.5};
  const rows=rescueNflPregameRows([leg],[leg],snapshot(),{now:Date.parse('2099-10-01T00:00:00Z')});
  assert.equal(rows[0].status,'UNRESOLVED');
  assert.equal(rows[0].resolutionReason,'nfl-player-or-team-not-found-in-current-simulation');
});

test('sportsbook-only fallback never turns a started game into a pregame leg',()=>{
  const rows=rescueNflPregameRows([unresolved],[unresolved],snapshot('2099-10-01T00:15:00Z'),{now:Date.parse('2099-10-01T01:00:00Z')});
  assert.equal(rows[0].status,'UNRESOLVED');
});

test('ambiguous future player matches fail closed instead of guessing an event',()=>{
  const doc=snapshot();
  doc.games.push({...doc.games[0],gameId:'pit-cle-2',startDateUTC:'2099-10-03T00:15:00Z'});
  const rows=rescueNflPregameRows([unresolved],[unresolved],doc,{now:Date.parse('2099-10-01T00:00:00Z')});
  assert.equal(rows[0].status,'UNRESOLVED');
});
