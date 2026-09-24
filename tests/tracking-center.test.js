const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {summarizeTrackingSlip}=require('../server/api/tracking-refresh');

function slip(statuses){return{legs:statuses.map((status,index)=>({id:`leg-${index+1}`,status}))};}
function read(name){return fs.readFileSync(path.join(__dirname,'..',name),'utf8');}

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
  const builder=read('server/api/builder-page.js');
  const tracking=read('builder-tracking.js');
  const profile=read('profile.html');
  const profileJs=read('profile.js');
  assert.match(builder,/builder-tracking\.js/);
  assert.match(builder,/builder-tracking\.css/);
  assert.match(tracking,/tracked_parlays/);
  assert.match(tracking,/Placed Bet/);
  assert.match(tracking,/Watching/);
  assert.match(profile,/>Tracking</);
  assert.match(profileJs,/Share Progress/);
});

test('My Parlay pencil supports a custom name that becomes the tracked title',()=>{
  const builder=read('server/api/builder-page.js');
  const rename=read('builder-title-notifications.js');
  const tracking=read('builder-tracking.js');
  assert.match(builder,/builder-title-notifications\.js/);
  assert.match(rename,/\.edit-title/);
  assert.match(rename,/pp-parlay-title-input/);
  assert.match(rename,/parlayping_custom_title_/);
  assert.match(rename,/localStorage\.setItem/);
  assert.match(tracking,/title:currentTitle\(\)/);
  assert.match(tracking,/currentTitle\(\)/);
});

test('closed-app Web Push assets are wired to Tracking',()=>{
  const builder=read('server/api/builder-page.js');
  const profile=read('profile.html');
  const pushClient=read('push-client.js');
  const worker=read('sw.js');
  const manifest=JSON.parse(read('manifest.webmanifest'));
  const profilePush=read('profile-push.js');
  assert.match(builder,/push-client\.js/);
  assert.match(builder,/manifest\.webmanifest/);
  assert.match(profile,/push-client\.js/);
  assert.match(profile,/profile-push\.js/);
  assert.match(pushClient,/Notification\.requestPermission/);
  assert.match(pushClient,/PushManager/);
  assert.match(pushClient,/push_subscriptions/);
  assert.match(worker,/addEventListener\('push'/);
  assert.match(worker,/showNotification/);
  assert.match(worker,/addEventListener\('notificationclick'/);
  assert.match(profilePush,/Enable Alerts/);
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.scope,'/');
});

test('tracking refresh route is wired through the API router and Vercel',()=>{
  const api=read('api/index.js');
  const vercel=read('vercel.json');
  assert.match(api,/'tracking-refresh'/);
  assert.match(vercel,/\/api\/tracking-refresh/);
});
