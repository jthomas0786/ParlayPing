const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const worker=require('../server/api/discovery-worker');
const scheduler=require('../server/api/lib/scheduler-auth');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('sports insight classifier focuses on team and player developments',()=>{
  assert.equal(worker.categoryForHeadline('Chiefs rule WR out with hamstring injury'),'Injury / availability');
  assert.equal(worker.categoryForHeadline('Team names new starting quarterback'),'Role / lineup');
  assert.equal(worker.categoryForHeadline('Star traded before deadline'),'Roster move');
  assert.equal(worker.categoryForHeadline('Guard extends scoring streak to 12 games'),'Trend / milestone');
});

test('Google News parsing keeps source, URL, freshness and sport',()=>{
  const xml=`<rss><channel><item><title><![CDATA[Star receiver questionable for Sunday - Example Sports]]></title><link>https://example.com/story</link><pubDate>Fri, 25 Sep 2026 20:00:00 GMT</pubDate><source>Example Sports</source></item></channel></rss>`;
  const rows=worker.parseGoogleNews(xml,'NFL');
  assert.equal(rows.length,1);
  assert.equal(rows[0].sport,'NFL');
  assert.equal(rows[0].source_name,'Example Sports');
  assert.equal(rows[0].source_url,'https://example.com/story');
  assert.equal(rows[0].category,'Injury / availability');
  assert.match(rows[0].source_key,/^[a-f0-9]{64}$/);
});

test('ESPN parsing produces sourced sports insight rows',()=>{
  const rows=worker.parseEspnNews({articles:[{headline:'Team changes starting lineup',description:'A player is moving into the starting five.',published:'2026-09-25T20:00:00Z',links:{web:{href:'https://espn.example/story'}}}]},'NBA');
  assert.equal(rows.length,1);
  assert.equal(rows[0].sport,'NBA');
  assert.equal(rows[0].source_name,'ESPN');
  assert.equal(rows[0].category,'Role / lineup');
  assert.match(rows[0].summary,/starting five/);
});

test('X betslip filter requires public media and betting context',()=>{
  const media=new Map([['m1',{media_key:'m1'}]]);
  assert.equal(worker.looksLikeBetslip({text:'My FanDuel parlay +1200',attachments:{media_keys:['m1']}},media),true);
  assert.equal(worker.looksLikeBetslip({text:'My FanDuel parlay +1200',attachments:{media_keys:[]}},media),false);
  assert.equal(worker.looksLikeBetslip({text:'Vacation photo',attachments:{media_keys:['m1']}},media),false);
});

test('X attention score rewards more engagement at equal freshness',()=>{
  const created_at=new Date().toISOString();
  const quiet=worker.attentionScore({created_at,public_metrics:{like_count:2,retweet_count:0,reply_count:0,quote_count:0,bookmark_count:0,impression_count:100}});
  const busy=worker.attentionScore({created_at,public_metrics:{like_count:200,retweet_count:40,reply_count:25,quote_count:10,bookmark_count:20,impression_count:50000}});
  assert.ok(busy>quiet);
});

test('sport detection covers core ParlayPing sports',()=>{
  assert.equal(worker.detectSport('NFL anytime TD parlay'),'NFL');
  assert.equal(worker.detectSport('NBA 3PT same game parlay'),'NBA');
  assert.equal(worker.detectSport('MLB home run betslip'),'MLB');
  assert.equal(worker.detectSport('NHL shots on goal parlay'),'NHL');
});

test('Home discovery UI is independent from Community and bet history',()=>{
  const hub=read('landing-hub.js');
  assert.match(hub,/sports_insights/);
  assert.match(hub,/x_trending_betslips/);
  assert.doesNotMatch(hub,/community_parlays/);
  assert.match(hub,/never your bet history or Community activity/);
  assert.match(hub,/High-attention public betslips on X/);
  assert.match(hub,/source_url/);
  assert.match(hub,/tweet_url/);
});

test('discovery worker is routed through the one-function Vercel dispatcher',()=>{
  const api=read('api/index.js');
  const config=JSON.parse(read('vercel.json'));
  assert.match(api,/'discovery-worker':\(\)=>require\('\.\.\/server\/api\/discovery-worker'\)/);
  assert.ok(config.rewrites.some(item=>item.source==='/api/discovery-worker'&&item.destination==='/api/index?__pp_route=discovery-worker'));
});

test('shared scheduler authorization remains timing-safe and reusable',()=>{
  const expected=scheduler.hashSecret('test-hourly-secret');
  assert.equal(scheduler.schedulerAuthorized({headers:{'x-parlayping-scheduler-secret':'test-hourly-secret'}},expected),true);
  assert.equal(scheduler.schedulerAuthorized({headers:{'x-parlayping-scheduler-secret':'wrong'}},expected),false);
});
