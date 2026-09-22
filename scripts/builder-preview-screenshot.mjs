import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require=createRequire(import.meta.url);
process.env.PUBLIC_BASE_URL='http://127.0.0.1:4176';
const {renderBuilderHtml}=require('../server/api/builder-page');
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const artifactDir=path.join(root,'artifacts','preview');
fs.mkdirSync(artifactDir,{recursive:true});

const today=new Date();
const todayStart=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate(),23,5));
const tomorrowStart=new Date(todayStart.getTime()+24*60*60*1000);
const slip={
  source:'Preview fixture',
  sportsbook:'DraftKings',
  combinedOddsAmerican:null,
  combinedOddsVerified:false,
  legs:[
    {id:'okamoto',sport:'MLB',player:'Kazuma Okamoto',playerId:'672960',team:'TOR',matchup:'TOR @ BAL',market:'HR',displayMarket:'O0.5 HR',oddsAmerican:470,sportsbook:'DraftKings',status:'UNRESOLVED',pregameProbability:.18,startTimeUTC:todayStart.toISOString(),originalText:'PP_BOOK_ODDS:{"DraftKings":470,"FanDuel":520}'},
    {id:'abrams',sport:'MLB',player:'CJ Abrams',playerId:'682928',team:'WSH',matchup:'WSH @ DET',market:'HR',displayMarket:'O0.5 HR',oddsAmerican:550,sportsbook:'DraftKings',status:'UNRESOLVED',pregameProbability:.162,startTimeUTC:tomorrowStart.toISOString(),originalText:'PP_BOOK_ODDS:{"DraftKings":550}'},
    {id:'missing-prob',sport:'MLB',player:'Preview Player',team:'CHC',matchup:'CHC @ NYM',market:'HR',displayMarket:'O0.5 HR',oddsAmerican:610,sportsbook:'DraftKings',status:'UNRESOLVED',pregameProbability:null,startTimeUTC:tomorrowStart.toISOString(),originalText:'PP_BOOK_ODDS:{"DraftKings":610,"FanDuel":650}'},
  ],
};
const fixture=renderBuilderHtml({slip,token:'s1.preview.fixture',liveDataAvailable:false});
const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.html':'text/html'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4176');
  if(url.pathname==='/fixture'){
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(fixture);return;
  }
  const file=path.join(root,url.pathname.replace(/^\//,''));
  if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){
    res.writeHead(404);res.end('not found');return;
  }
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(4176,'127.0.0.1',resolve));

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:1,isMobile:true,hasTouch:true});
await page.goto('http://127.0.0.1:4176/fixture',{waitUntil:'domcontentloaded'});
await page.waitForSelector('.pick-card');
await page.waitForTimeout(700);

const visual=await page.evaluate(()=>({
  heroTools:[...document.querySelectorAll('.hero-tool')].map(el=>el.querySelector('strong')?.textContent?.trim()),
  heroHeight:document.querySelector('.concept-hero')?.getBoundingClientRect().height,
  probabilityLabels:[...document.querySelectorAll('.pick-probability')].map(el=>el.textContent.trim()),
  probabilityTracks:[...document.querySelectorAll('.meter-track')].map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})),
  probabilityFills:[...document.querySelectorAll('.meter-track i')].map(el=>el.getBoundingClientRect().width),
  draftKingsOdds:[...document.querySelectorAll('.pick-odds')].map(el=>el.textContent.trim()),
  heroCopy:document.querySelector('.hero-copy p')?.textContent?.trim(),
}));
if(visual.heroTools.join('|')!=='Adjust Alt Lines|Share & Get Tails|Track & Compare')throw new Error(`hero tools mismatch: ${visual.heroTools.join(', ')}`);
if(document.body.textContent.includes('Link to Sportsbooks'))throw new Error('Link to Sportsbooks still exists in the rendered builder.');
if(visual.heroHeight>270)throw new Error(`hero is still too tall: ${visual.heroHeight}`);
if(visual.probabilityLabels.join('|')!=='18.0%|16.2%|—%')throw new Error(`probability labels mismatch: ${visual.probabilityLabels.join(', ')}`);
if(visual.probabilityTracks.some(x=>x.width<65||x.height<9))throw new Error(`probability tracks too small: ${JSON.stringify(visual.probabilityTracks)}`);
if(visual.probabilityFills[0]<=0||visual.probabilityFills[1]<=0||visual.probabilityFills[2]!==0)throw new Error(`probability fills mismatch: ${visual.probabilityFills.join(', ')}`);
if(visual.draftKingsOdds.join('|')!=='+470|+550|+610')throw new Error(`DraftKings HR odds mismatch: ${visual.draftKingsOdds.join(', ')}`);

await page.click('.book-card[data-book="FanDuel"]');
await page.waitForTimeout(80);
const fanDuelOdds=await page.locator('.pick-odds').allTextContents();
if(fanDuelOdds.map(x=>x.trim()).join('|')!=='+520|—|+650')throw new Error(`FanDuel exact-leg odds mismatch: ${fanDuelOdds.join(', ')}`);
await page.click('.book-card[data-book="DraftKings"]');
await page.waitForTimeout(80);

await page.evaluate(()=>window.scrollTo(0,0));
await page.waitForTimeout(120);
await page.screenshot({path:path.join(artifactDir,'builder-preview-default.png')});

await page.click('#tuneBtn');
await page.waitForTimeout(200);
await page.evaluate(()=>{
  const panel=document.querySelector('.parlay-panel');
  const header=document.querySelector('.app-header');
  const top=(panel?.getBoundingClientRect().top||0)+window.scrollY-(header?.getBoundingClientRect().height||0)-6;
  window.scrollTo(0,Math.max(0,top));
});
await page.waitForTimeout(120);
const tuneVisible=await page.locator('.parlay-panel').evaluate(el=>el.classList.contains('tune-open'));
if(!tuneVisible)throw new Error('Parlay Tune did not open.');
await page.screenshot({path:path.join(artifactDir,'builder-preview-tune.png')});

console.log(JSON.stringify({...visual,fanDuelOdds:fanDuelOdds.map(x=>x.trim())},null,2));
await browser.close();
await new Promise(resolve=>server.close(resolve));
