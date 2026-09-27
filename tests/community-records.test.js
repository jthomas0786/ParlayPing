const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const worker=require('../server/api/community-grade-worker');

function leg(status,extra={}){return {sport:'NFL',player:'Test Player',market:'REC_YDS',side:'OVER',line:49.5,status,...extra};}

test('Community grading only finalizes after every leg is final',()=>{
  assert.equal(worker.gradeStatus([leg('HIT'),leg('HIT')]).status,'WON');
  assert.equal(worker.gradeStatus([leg('HIT'),leg('PUSH')]).status,'WON');
  assert.equal(worker.gradeStatus([leg('HIT'),leg('MISS')]).status,'LOST');
  assert.equal(worker.gradeStatus([leg('HIT'),leg('LIVE')]).status,'LIVE');
  assert.equal(worker.gradeStatus([leg('HIT'),leg('PENDING')]).status,'PENDING');
  assert.equal(worker.gradeStatus([leg('VOID'),leg('VOID')]).status,'VOID');
  assert.equal(worker.gradeStatus([leg('PUSH'),leg('VOID')]).status,'PUSH');
});

test('future Community submissions stay pending without premature grading',async()=>{
  const start=new Date(Date.now()+2*60*60*1000).toISOString();
  const row={id:'future-test',created_at:new Date().toISOString(),legs:[leg('PENDING',{startTimeUTC:start})]};
  const result=await worker.gradeOne(row);
  assert.equal(result.result_status,'PENDING');
  assert.match(result.result_summary,/waiting for the games to start/i);
});

test('Community result storage is read-only to browser clients and views use invoker security',()=>{
  const sql=read('sql/community-verified-records.sql');
  assert.match(sql,/create table if not exists public\.community_results/i);
  assert.match(sql,/revoke insert, update, delete on public\.community_results from anon, authenticated/i);
  assert.match(sql,/community_public_posts with \(security_invoker=true\)/i);
  assert.match(sql,/community_leaderboard with \(security_invoker=true\)/i);
  assert.match(sql,/parlayping_community_grade_candidates/i);
  assert.match(sql,/parlayping_apply_community_grades/i);
  assert.match(sql,/parlayping-community-grade/i);
});

test('Community grading worker is routed through the Vercel dispatcher',()=>{
  const api=read('api/index.js'),config=JSON.parse(read('vercel.json'));
  assert.match(api,/'community-grade-worker':\(\)=>require\('\.\.\/server\/api\/community-grade-worker'\)/);
  assert.ok(config.rewrites.some(item=>item.source==='/api/community-grade-worker'&&item.destination==='/api/index?__pp_route=community-grade-worker'));
});

test('profile and Explore surfaces expose transparent verified records',()=>{
  const profile=read('profile-growth.js'),explore=read('trending-growth.js'),html=read('trending.html');
  assert.match(profile,/settled_submission_count/);
  assert.match(profile,/community_public_posts/);
  assert.match(profile,/VERIFIED RECORD/);
  assert.match(profile,/Settled losses remain part of the record/);
  assert.match(explore,/community_leaderboard/);
  assert.match(explore,/win_count/);
  assert.match(html,/VERIFIED COMMUNITY RECORDS/);
  assert.match(html,/Settled losses remain visible/);
});
