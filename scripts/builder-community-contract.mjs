import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require=createRequire(import.meta.url);
process.env.PUBLIC_BASE_URL='http://127.0.0.1:4181';
const {renderBuilderHtml}=require('../server/api/builder-page');
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const artifactDir=path.join(root,'artifacts');
fs.mkdirSync(artifactDir,{recursive:true});

const slip={
  source:'The Sports Outpost',
  sportsbook:'DraftKings',
  sportsbookLinks:{
    DraftKings:'https://sportsbook.example/betslip/draftkings-exact',
    FanDuel:'https://sportsbook.example/betslip/fanduel-exact',
    Caesars:'https://sportsbook.example/betslip/caesars-exact',
  },
  legs:[
    {id:'allen-pass',sport:'NFL',player:'Josh Allen',playerId:'3918298',playerImageUrl:'https://a.espncdn.com/i/headshots/nfl/players/full/3918298.png',gameId:'buf-nyj',matchup:'BUF @ NYJ',market:'passing yards',displayMarket:'Over 249.5 Passing Yards',side:'over',line:249.5,sportsbook:'DraftKings',oddsAmerican:-110,pregameProbability:.61,status:'PENDING',bookOffers:{DraftKings:{oddsAmerican:-110},FanDuel:{oddsAmerican:-102}},altLinesByBook:{DraftKings:[{line:225.5,oddsAmerican:-165,probability:.66,side:'over'},{line:249.5,oddsAmerican:-110,probability:.61,side:'over'},{line:275.5,oddsAmerican:135,probability:.44,side:'over'}],FanDuel:[{line:230.5,oddsAmerican:-150,probability:.65,side:'over'},{line:249.5,oddsAmerican:-102,probability:.60,side:'over'},{line:270.5,oddsAmerican:120,probability:.47,side:'over'}]}},
    {id:'cook-rush',sport:'NFL',player:'James Cook',playerId:'4379399',playerImageUrl:'https://a.espncdn.com/i/headshots/nfl/players/full/4379399.png',gameId:'buf-nyj',matchup:'BUF @ NYJ',market:'rushing yards',displayMarket:'Over 69.5 Rushing Yards',side:'over',line:69.5,sportsbook:'DraftKings',oddsAmerican:-105,pregameProbability:.57,status:'PENDING',bookOffers:{FanDuel:{oddsAmerican:105}},altLinesByBook:{DraftKings:[{line:60.5,oddsAmerican:-145,probability:.63,side:'over'},{line:69.5,oddsAmerican:-105,probability:.57,side:'over'}],FanDuel:[{line:59.5,oddsAmerican:-135,probability:.64,side:'over'},{line:69.5,oddsAmerican:105,probability:.55,side:'over'}]}},
    {id:'henry-rush',sport:'NFL',player:'Derrick Henry',playerId:'3043078',playerImageUrl:'https://a.espncdn.com/i/headshots/nfl/players/full/3043078.png',gameId:'bal-kc',matchup:'BAL @ KC',market:'rushing yards',displayMarket:'Over 84.5 Rushing Yards',side:'over',line:84.5,sportsbook:'DraftKings',oddsAmerican:-115,pregameProbability:.64,liveProbability:.71,status:'LIVE',bookOffers:{DraftKings:{oddsAmerican:-115},FanDuel:{oddsAmerican:-108}},altLinesByBook:{DraftKings:[{line:75.5,oddsAmerican:-150,probability:.69,side:'over'},{line:84.5,oddsAmerican:-115,probability:.64,side:'over'}],FanDuel:[{line:74.5,oddsAmerican:-145,probability:.70,side:'over'},{line:84.5,oddsAmerican:-108,probability:.63,side:'over'}]}},
  ],
};

const fixture=renderBuilderHtml({slip,token:'community.contract.token',liveDataAvailable:true});
const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.html':'text/html'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4181');
  if(url.pathname==='/community-fixture'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(fixture);return;}
  const file=path.join(root,url.pathname.replace(/^\//,''));
  if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end('not found');return;}
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(4181,'127.0.0.1',resolve));

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1200},deviceScaleFactor:1});
let communityPayload=[];
const feedRequests=[];
const transparentPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=','base64');

await page.route('https://avwqjgiitxqphvmitolw.supabase.co/rest/v1/community_parlays**',async route=>{
  feedRequests.push(route.request().url());
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(communityPayload)});
});
await page.route('https://www.google.com/s2/favicons**',route=>route.fulfill({status:200,contentType:'image/png',body:transparentPng}));
await page.route('https://a.espncdn.com/**',route=>route.fulfill({status:200,contentType:'image/png',body:transparentPng}));

async function openFixture(){
  await page.goto('http://127.0.0.1:4181/community-fixture',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.dataset.ppCommunityFeatures==='ready',{timeout:5000});
  await page.waitForSelector('#ppCommunity');
  await page.waitForTimeout(180);
}

await openFixture();

const initial=await page.evaluate(()=>({
  community:document.querySelector('#ppCommunity')?.textContent||'',
  insights:[...document.querySelectorAll('#insights .insights-list li')].map(el=>el.textContent.trim()),
  variants:[...document.querySelectorAll('[data-pp-variant]')].map(el=>el.dataset.ppVariant),
  logoImages:document.querySelectorAll('.sportsbook-grid .book-logo img').length,
  selectedBook:document.querySelector('.book-card.active')?.dataset.book||'',
  postLabel:document.querySelector('#ppPostCommunity')?.textContent?.trim()||'',
}));

if(!initial.community.includes('Community'))throw new Error('Community panel did not render.');
if(!initial.insights.some(text=>text.includes('3 legs across 2 games')))throw new Error(`Dynamic game insight missing: ${initial.insights.join(' | ')}`);
if(!initial.insights.some(text=>text.includes('live right now')))throw new Error(`Live insight missing: ${initial.insights.join(' | ')}`);
if(initial.variants.join('|')!=='safer|payout|coverage')throw new Error(`Similar fallback actions missing: ${initial.variants.join(',')}`);
if(initial.logoImages<3)throw new Error(`Sportsbook logo images missing: ${initial.logoImages}`);
if(initial.postLabel!=='Sign In to Post')throw new Error(`Signed-out community CTA is wrong: ${initial.postLabel}`);
if(feedRequests.some(url=>/[?&]select=[^&]*user_id/.test(url)))throw new Error(`Public community query exposed user_id: ${feedRequests.join(' | ')}`);

await page.click('#analysisBtn');
await page.waitForFunction(()=>{const el=document.querySelector('#ppAnalysisDetail');return el&&!el.hidden;},{timeout:5000});
const analysisText=await page.locator('#ppAnalysisDetail').innerText();
if(!analysisText.includes('Games')||!analysisText.includes('Alt-line coverage'))throw new Error(`Analysis detail did not expand: ${analysisText}`);

await page.click('.book-card[data-book="Caesars"]');
await page.waitForFunction(()=>document.querySelector('.book-card.active')?.dataset.book==='Caesars',{timeout:5000});
await page.click('[data-pp-variant="coverage"]');
await page.waitForFunction(()=>document.querySelector('.book-card.active')?.dataset.book==='DraftKings',{timeout:5000});

await page.click('.book-card[data-book="FanDuel"]');
await page.waitForFunction(()=>document.querySelector('.book-card.active')?.dataset.book==='FanDuel',{timeout:5000});
await page.click('[data-pp-variant="safer"]');
await page.waitForTimeout(120);
const saferLines=await page.evaluate(()=>[...document.querySelectorAll('.pp-alt-option.selected span')].map(el=>el.textContent.trim()));
if(!saferLines.includes('Over 230.5')||!saferLines.includes('Over 59.5')||!saferLines.includes('Over 74.5'))throw new Error(`Safer variant did not apply FanDuel verified lines: ${saferLines.join(', ')}`);

await page.screenshot({path:path.join(artifactDir,'builder-desktop-community-empty.png'),fullPage:true});

communityPayload=[{
  id:'11111111-1111-1111-1111-111111111111',
  share_token:'other-community-token',
  builder_url:'https://parlayping.net/build/other-community-token',
  title:'Community Match',
  author_name:'Tail Tester',
  x_username:'tailtester',
  sport:'NFL',
  leg_count:3,
  sportsbook:'FanDuel',
  created_at:new Date().toISOString(),
  legs:[{sport:'NFL',player:'Josh Allen',market:'passing yards',matchup:'BUF @ NYJ',line:249.5,side:'over'}],
}];
feedRequests.length=0;
await openFixture();
await page.waitForFunction(()=>document.querySelector('#ppCommunityGrid')?.textContent?.includes('Community Match'),{timeout:5000});
await page.waitForFunction(()=>document.querySelector('#similar .similar-list')?.textContent?.includes('Community Match'),{timeout:5000});

const communityMatch=await page.evaluate(()=>({
  cardText:document.querySelector('#ppCommunityGrid')?.textContent||'',
  similarText:document.querySelector('#similar .similar-list')?.textContent||'',
  tailHref:document.querySelector('#similar .pp-tail-small')?.getAttribute('href')||'',
}));
if(!communityMatch.cardText.includes('Tail Tester'))throw new Error('Community author did not render.');
if(!communityMatch.similarText.includes('Josh Allen'))throw new Error('Similar community match did not render player overlap.');
if(communityMatch.tailHref!=='https://parlayping.net/build/other-community-token')throw new Error(`Community tail link wrong: ${communityMatch.tailHref}`);
if(feedRequests.some(url=>/[?&]select=[^&]*user_id/.test(url)))throw new Error(`Reloaded public query exposed user_id: ${feedRequests.join(' | ')}`);

await page.screenshot({path:path.join(artifactDir,'builder-desktop-community-match.png'),fullPage:true});
console.log(JSON.stringify({initial,analysisText,saferLines,communityMatch,feedRequests},null,2));

await browser.close();
await new Promise(resolve=>server.close(resolve));
