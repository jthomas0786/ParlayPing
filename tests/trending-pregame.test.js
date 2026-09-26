const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const pregame=require('../server/api/discovery-worker-pregame');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('promo hashtag blocks do not hijack trending sport classification',()=>{
  assert.equal(pregame.fallbackSport('LATE NIGHT HRR MEGA #NBA #WNBA #CBB #MLB #NFL #DraftKings #Fanduel'),'MLB');
  assert.equal(pregame.fallbackSport('cfb green #1! Cale Hellums o94.5 Rush Yards #NBA #WNBA #MLB #NFL'),'NCAAF');
  assert.equal(pregame.fallbackSport('Anytime touchdown parlay for Sunday #NBA #MLB #NFL'),'NFL');
});

test('current slate matching resolves a future player event',()=>{
  const future=new Date(Date.now()+6*60*60*1000).toISOString();
  const doc={games:[{away:'ATL',home:'GB',startDateUTC:future,players:[{name:'Drake London'},{name:'Tucker Kraft'}]}]};
  const hit=pregame.resolveLegFromSnapshot({sport:'NFL',player:'Drake London',team:'ATL'},doc);
  assert.ok(hit);
  assert.equal(hit.start,future);
  assert.equal(hit.label,'ATL @ GB');
});

test('started current-slate events are never resolved as pregame',()=>{
  const past=new Date(Date.now()-10*60*1000).toISOString();
  const doc={games:[{away:'ATL',home:'GB',startDateUTC:past,players:[{name:'Drake London'}]}]};
  assert.equal(pregame.resolveLegFromSnapshot({sport:'NFL',player:'Drake London'},doc),null);
});

test('Trending UI uses stable sport buttons and only requests confirmed future slips',()=>{
  const hub=read('landing-hub.js');
  assert.match(hub,/TREND_SPORTS=\['ALL','NFL','NCAAF','NBA','WNBA','NCAAB','MLB','NHL'\]/);
  assert.match(hub,/is_pregame_confirmed=eq\.true/);
  assert.match(hub,/event_start_at=gt\./);
  assert.match(hub,/Upcoming only/);
});

test('discovery route is wrapped by pregame validation and schema migration is committed',()=>{
  const api=read('api/index.js');
  const sql=read('sql/trending-betslips-pregame.sql');
  assert.match(api,/discovery-worker-pregame/);
  assert.match(sql,/is_pregame_confirmed/);
  assert.match(sql,/event_start_at/);
  assert.match(sql,/parlayping_apply_trending_pregame/);
});
