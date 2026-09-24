const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {summarizeTrackingSlip}=require('../server/api/tracking-refresh');

function slip(statuses){return{legs:statuses.map((status,index)=>({id:`leg-${index+1}`,status}))};}

test('tracking summary marks any missed leg as a loss',()=>{
  assert.deepEqual(summarizeTrackingSlip(slip(['HIT','MISS','LIVE'])),{
    status:'LOST',hitCount:1,missCount:1,liveCount:1,pendingCount:0,pushCount:0,voidCount:0,unresolvedCount:0,
  });
});

test('tracking summary only declares a winner when every leg is terminal without a miss',()=>{
  assert.equal(summarizeTrackingSlip(slip(['HIT','HIT','PUSH','VOID'])).status,'WON');
  assert.equal(summarizeTrackingSlip(slip(['HIT','UNRESOLVED'])).status,'UPCOMING');
});

test('tracking summary preserves live and upcoming states',()=>{
  assert.equal(summarizeTrackingSlip(slip(['HIT','LIVE','PENDING'])).status,'LIVE');
  assert.equal(summarizeTrackingSlip(slip(['PENDING','PENDING'])).status,'UPCOMING');
});

test('builder loads Track workflow and Tracking profile assets exist',()=>{
  const builder=fs.readFileSync(path.join(__dirname,'..','server','api','builder-page.js'),'utf8');
  const tracking=fs.readFileSync(path.join(__dirname,'..','builder-tracking.js'),'utf8');
  const profile=fs.readFileSync(path.join(__dirname,'..','profile.html'),'utf8');
  const profileJs=fs.readFileSync(path.join(__dirname,'..','profile.js'),'utf8');
  assert.match(builder,/builder-tracking\.js/);
  assert.match(builder,/builder-tracking\.css/);
  assert.match(tracking,/tracked_parlays/);
  assert.match(tracking,/Placed Bet/);
  assert.match(tracking,/Watching/);
  assert.match(profile,/>Tracking</);
  assert.match(profileJs,/Share Progress/);
});

test('tracking refresh route is wired through the API router and Vercel',()=>{
  const api=fs.readFileSync(path.join(__dirname,'..','api','index.js'),'utf8');
  const vercel=fs.readFileSync(path.join(__dirname,'..','vercel.json'),'utf8');
  assert.match(api,/'tracking-refresh'/);
  assert.match(vercel,/\/api\/tracking-refresh/);
});
