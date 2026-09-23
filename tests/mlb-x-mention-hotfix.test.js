const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const {mlbIdentityCandidates}=require('../server/api/lib/sport-router');
const {mlbOfficialPngHeadshot}=require('../server/api/share-card');

test('MLB identity fallback safely maps Leonardo Bernal to official Leo Bernal name',()=>{
  const candidates=mlbIdentityCandidates('Leonardo Bernal');
  assert.equal(candidates[0],'Leonardo Bernal');
  assert.ok(candidates.some(name=>name.toLowerCase()==='leo bernal'));
  assert.deepEqual(mlbIdentityCandidates('Shohei Ohtani'),['Shohei Ohtani']);
});

test('MLB share card has an explicit PNG official headshot fallback keyed by MLB player id',()=>{
  const url=mlbOfficialPngHeadshot({sport:'MLB',playerId:'660271'});
  assert.match(url,/img\.mlbstatic\.com/);
  assert.match(url,/f_png/);
  assert.match(url,/people\/660271\/headshot/);
  assert.equal(mlbOfficialPngHeadshot({sport:'NFL',playerId:'660271'}),null);
});

test('mobile sportsbook hotfix is stable, concise, tappable, always linkable, and labels implied probabilities',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','builder-summary-odds-hotfix.js'),'utf8');
  assert.doesNotMatch(source,/new MutationObserver/);
  assert.match(source,/Choose a sportsbook/);
  assert.match(source,/Exact slip when available; sportsbook page otherwise/);
  assert.match(source,/BOOK_HOME/);
  assert.match(source,/syncOpenButton/);
  assert.match(source,/grid\.onclick/);
  assert.match(source,/impliedFromAmerican/);
  assert.match(source,/pp-implied/);
  assert.doesNotMatch(source,/ParlayPing labels combined numbers as calculated because they are not a sportsbook-quoted parlay/);
});
