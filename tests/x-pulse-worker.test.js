const test=require('node:test');
const assert=require('node:assert/strict');
const pulse=require('../server/api/x-pulse-worker');

function row(key,player,market,display,slips,attention=10){return{selection_key:key,sport:'NFL',player,market,display_market:display,slip_count:slips,attention_score:attention,like_count:2,repost_count:1,earliest_start_at:'2099-09-27T17:00:00Z'};}

test('NFL pulse diversifies prop groups instead of returning only touchdowns',()=>{
  const rows=[
    row('td1','Derrick Henry','atd','ATD',8,90),
    row('td2','Jahmyr Gibbs','atd','ATD',7,80),
    row('rec1','Amon-Ra St. Brown','receptions','7+ REC',6,70),
    row('rush1','Christian McCaffrey','rushYds','90+ RUSH YDS',5,60),
    row('yds1','Puka Nacua','recYds','80+ REC YDS',4,50)
  ];
  const picks=pulse.diversifiedSelections(rows,4),groups=new Set(picks.map(pulse.propGroup));
  assert.equal(picks.length,4);
  assert.ok(groups.has('TD'));
  assert.ok(groups.has('RECEPTIONS'));
  assert.ok(groups.has('RUSH_YDS'));
  assert.ok(groups.has('REC_YDS'));
});

test('pulse post stays within X text limit',()=>{
  const picks=[
    row('td1','Derrick Henry','atd','ATD',8),
    row('rec1','Amon-Ra St. Brown','receptions','7+ RECEPTIONS',6),
    row('rush1','Christian McCaffrey','rushYds','110+ RUSH YARDS',5),
    row('yds1','Jaxon Smith-Njigba','recYds','100+ RECEIVING YARDS',4)
  ];
  const built=pulse.buildPulsePost(picks);
  assert.ok(built.text.length<=280);
  assert.match(built.text,/NFL X BETTING PULSE/);
  assert.match(built.text,/parlayping\.net\/trending/);
});

test('meaningful change detects prop composition changes',()=>{
  const previous={top:[{selectionKey:'a',slipCount:2},{selectionKey:'b',slipCount:2},{selectionKey:'c',slipCount:1}],totalSlips:5};
  const current={top:[{selectionKey:'a',slipCount:2},{selectionKey:'b',slipCount:2},{selectionKey:'d',slipCount:1}],totalSlips:5};
  const result=pulse.snapshotChanged(current,previous);
  assert.equal(result.meaningful,true);
  assert.equal(result.reason,'top-props-changed');
});
