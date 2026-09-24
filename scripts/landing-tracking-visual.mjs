import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root=path.resolve(process.cwd());
const outDir=path.join(root,'artifacts');
fs.mkdirSync(outDir,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json'};

const tracks=[
  {id:'track-live',user_id:'demo-user',source_token:'demo-live',builder_url:'/build/demo-live',title:'Sunday Night Hammer',tracking_type:'placed',sportsbook:'FanDuel',stake_amount:25,potential_payout:410,combined_odds_american:1540,leg_count:4,status:'LIVE',hit_count:1,miss_count:0,live_count:2,pending_count:1,is_public:false,last_refreshed_at:new Date().toISOString(),created_at:new Date(Date.now()-75*60000).toISOString(),updated_at:new Date().toISOString(),slip:{sportsbook:'FanDuel',legs:[
    {id:'l1',sport:'NFL',player:'CeeDee Lamb',market:'recYds',displayMarket:'OVER 109.5 · Receiving Yards',side:'over',line:109.5,status:'LIVE',current:60,target:110,progressText:'60 / 110 yards · Q2 6:42',matchup:'DAL @ NYG'},
    {id:'l2',sport:'NFL',player:'Bijan Robinson',market:'atd',displayMarket:'Anytime Touchdown',side:'yes',status:'HIT',progressText:'TOUCHDOWN · HIT',matchup:'ATL @ GB'},
    {id:'l3',sport:'NFL',player:'Travis Kelce',market:'receptions',displayMarket:'OVER 5.5 · Receptions',side:'over',line:5.5,status:'LIVE',current:3,target:6,progressText:'3 / 6 receptions · Q2 4:18',matchup:'KC @ DEN'},
    {id:'l4',sport:'NFL',player:'Saquon Barkley',market:'rushYds',displayMarket:'OVER 79.5 · Rushing Yards',side:'over',line:79.5,status:'PENDING',progressText:'Starts 7:20 PM',matchup:'PHI @ CHI'}]}},
  {id:'track-watch',user_id:'demo-user',source_token:'demo-watch',builder_url:'/build/demo-watch',title:'No Money — Just Watching',tracking_type:'watching',sportsbook:'DraftKings',stake_amount:null,potential_payout:null,combined_odds_american:825,leg_count:3,status:'UPCOMING',hit_count:0,miss_count:0,live_count:0,pending_count:3,is_public:false,last_refreshed_at:new Date().toISOString(),created_at:new Date(Date.now()-30*60000).toISOString(),updated_at:new Date().toISOString(),slip:{sportsbook:'DraftKings',legs:[
    {id:'w1',sport:'NFL',player:'Amon-Ra St. Brown',market:'recYds',displayMarket:'70+ Receiving Yards',side:'over',line:70,status:'PENDING',progressText:'Starts 12:00 PM',matchup:'DET @ MIN'},
    {id:'w2',sport:'NFL',player:'Josh Allen',market:'passTds',displayMarket:'2+ Passing TDs',side:'over',line:2,status:'PENDING',progressText:'Starts 3:25 PM',matchup:'BUF @ MIA'},
    {id:'w3',sport:'NFL',player:'Justin Jefferson',market:'receptions',displayMarket:'6+ Receptions',side:'over',line:6,status:'PENDING',progressText:'Starts 12:00 PM',matchup:'DET @ MIN'}]}},
  {id:'track-win',user_id:'demo-user',source_token:'demo-win',builder_url:'/build/demo-win',title:'Prime Time Sweep',tracking_type:'placed',sportsbook:'BetMGM',stake_amount:20,potential_payout:188,combined_odds_american:840,leg_count:3,status:'WON',hit_count:3,miss_count:0,live_count:0,pending_count:0,is_public:false,last_refreshed_at:new Date().toISOString(),created_at:new Date(Date.now()-24*3600000).toISOString(),updated_at:new Date().toISOString(),slip:{sportsbook:'BetMGM',legs:[
    {id:'x1',sport:'NFL',player:'Ja’Marr Chase',market:'recYds',displayMarket:'80+ Receiving Yards',side:'over',line:80,status:'HIT',progressText:'112 yards · HIT'},
    {id:'x2',sport:'NFL',player:'Joe Burrow',market:'passTds',displayMarket:'2+ Passing TDs',side:'over',line:2,status:'HIT',progressText:'3 TDs · HIT'},
    {id:'x3',sport:'NFL',player:'Tee Higgins',market:'receptions',displayMarket:'5+ Receptions',side:'over',line:5,status:'HIT',progressText:'7 receptions · HIT'}]}},
  {id:'track-loss',user_id:'demo-user',source_token:'demo-loss',builder_url:'/build/demo-loss',title:'One Leg Short',tracking_type:'placed',sportsbook:'Caesars',stake_amount:10,potential_payout:245,combined_odds_american:2350,leg_count:5,status:'LOST',hit_count:4,miss_count:1,live_count:0,pending_count:0,is_public:false,last_refreshed_at:new Date().toISOString(),created_at:new Date(Date.now()-48*3600000).toISOString(),updated_at:new Date().toISOString(),slip:{sportsbook:'Caesars',legs:[
    {id:'y1',sport:'NFL',player:'Puka Nacua',market:'recYds',displayMarket:'70+ Receiving Yards',status:'HIT',progressText:'94 yards · HIT'},
    {id:'y2',sport:'NFL',player:'Kyren Williams',market:'atd',displayMarket:'Anytime Touchdown',status:'HIT',progressText:'TD · HIT'},
    {id:'y3',sport:'NFL',player:'Davante Adams',market:'receptions',displayMarket:'5+ Receptions',status:'HIT',progressText:'6 receptions · HIT'},
    {id:'y4',sport:'NFL',player:'George Kittle',market:'recYds',displayMarket:'50+ Receiving Yards',status:'HIT',progressText:'63 yards · HIT'},
    {id:'y5',sport:'NFL',player:'Mike Evans',market:'recYds',displayMarket:'60+ Receiving Yards',status:'MISS',progressText:'54 / 60 yards · MISS'}]}}
];

function json(res,value,status=200){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));}
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/api/tracking-refresh'){
    let body='';req.on('data',c=>body+=c);req.on('end',()=>{let ids=[];try{ids=(JSON.parse(body).tracks||[]).map(x=>String(x.id));}catch{}const results=tracks.filter(x=>ids.includes(x.id)).map(x=>({id:x.id,slip:x.slip,status:x.status,hitCount:x.hit_count,missCount:x.miss_count,liveCount:x.live_count,pendingCount:x.pending_count,refreshedAt:new Date().toISOString()}));json(res,{ok:true,results});});return;
  }
  let rel=url.pathname==='/'?'index.html':url.pathname==='/profile'?'profile.html':decodeURIComponent(url.pathname.replace(/^\//,''));
  const file=path.resolve(root,rel);
  if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(4179,'127.0.0.1',resolve));

const browser=await chromium.launch({headless:true});
async function mockSupabase(page){
  await page.route('https://avwqjgiitxqphvmitolw.supabase.co/**',async route=>{
    const request=route.request();const url=new URL(request.url());
    if(url.pathname==='/auth/v1/user')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'demo-user',email:'jt@parlayping.net',user_metadata:{name:'JT'}})});
    if(url.pathname.includes('/functions/v1/parlayping-push-config'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,publicKey:'demo'})});
    if(url.pathname==='/rest/v1/tracked_parlays'){
      if(request.method()==='PATCH')return route.fulfill({status:204,body:''});
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(tracks)});
    }
    if(url.pathname==='/rest/v1/profiles')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{display_name:'JT',x_username:'justcallme_jt',avatar_url:null}])});
    if(url.pathname==='/rest/v1/community_parlays')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([
      {id:'c1',builder_url:'#demo',title:'Sunday TD Builder',sport:'NFL',leg_count:4,sportsbook:'FanDuel',created_at:new Date().toISOString(),is_active:true},
      {id:'c2',builder_url:'#demo',title:'Prime Time Props',sport:'NFL',leg_count:3,sportsbook:'DraftKings',created_at:new Date(Date.now()-3600000).toISOString(),is_active:true},
      {id:'c3',builder_url:'#demo',title:'NBA Scoring Mix',sport:'NBA',leg_count:5,sportsbook:'BetMGM',created_at:new Date(Date.now()-7200000).toISOString(),is_active:true}
    ])});
    return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
}

async function landingShot(viewport,file,fullPage=false){
  const page=await browser.newPage({viewport});await mockSupabase(page);await page.goto('http://127.0.0.1:4179/',{waitUntil:'networkidle'});await page.waitForSelector('#betlab');await page.waitForTimeout(400);await page.screenshot({path:path.join(outDir,file),fullPage});await page.close();
}
await landingShot({width:1440,height:1200},'pending-landing-desktop.png',false);
await landingShot({width:390,height:844},'pending-landing-mobile.png',false);

async function profileShot(viewport,file){
  const page=await browser.newPage({viewport});await mockSupabase(page);await page.addInitScript(()=>{localStorage.setItem('parlayping_supabase_session_v1',JSON.stringify({access_token:'demo-token',refresh_token:'demo-refresh',expires_at:Math.floor(Date.now()/1000)+3600}));});await page.goto('http://127.0.0.1:4179/profile',{waitUntil:'networkidle'});await page.waitForSelector('.tracking-card');await page.waitForFunction(()=>document.body.innerText.includes('Sunday Night Hammer'));await page.waitForTimeout(500);await page.screenshot({path:path.join(outDir,file),fullPage:true});await page.close();
}
await profileShot({width:1440,height:1100},'pending-tracking-desktop.png');
await profileShot({width:390,height:844},'pending-tracking-mobile.png');

await browser.close();server.close();
console.log('Landing + Tracking visual preview screenshots captured.');
