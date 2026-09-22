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
    {id:'okamoto',sport:'MLB',player:'Kazuma Okamoto',playerId:'672960',team:'TOR',matchup:'Blue Jays @ Orioles',market:'HR',displayMarket:'O0.5 HR',oddsAmerican:null,sportsbook:'DraftKings',status:'UNRESOLVED',pregameProbability:.18,startTimeUTC:todayStart.toISOString()},
    {id:'abrams',sport:'MLB',player:'CJ Abrams',playerId:'682928',team:'WSH',matchup:'Nationals @ Tigers',market:'HR',displayMarket:'O0.5 HR',oddsAmerican:null,sportsbook:'DraftKings',status:'UNRESOLVED',pregameProbability:.162,startTimeUTC:tomorrowStart.toISOString()},
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
  visibleHeroTools:[...document.querySelectorAll('.hero-tool')].filter(el=>getComputedStyle(el).display!=='none').map(el=>el.querySelector('strong')?.textContent?.trim()),
  heroHeight:document.querySelector('.concept-hero')?.getBoundingClientRect().height,
  probabilityLabels:[...document.querySelectorAll('.pick-probability')].map(el=>el.textContent.trim()),
  probabilityTracks:[...document.querySelectorAll('.meter-track')].map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})),
  probabilityFills:[...document.querySelectorAll('.meter-track i')].map(el=>el.getBoundingClientRect().width),
}));
if(visual.visibleHeroTools.join('|')!=='Adjust Alt Lines|Share & Get Tails|Track & Compare')throw new Error(`hero tools mismatch: ${visual.visibleHeroTools.join(', ')}`);
if(visual.heroHeight>270)throw new Error(`hero is still too tall: ${visual.heroHeight}`);
if(visual.probabilityLabels.join('|')!=='18.0%|16.2%')throw new Error(`probability labels missing: ${visual.probabilityLabels.join(', ')}`);
if(visual.probabilityTracks.some(x=>x.width<65||x.height<9))throw new Error(`probability tracks too small: ${JSON.stringify(visual.probabilityTracks)}`);
if(visual.probabilityFills.some(x=>x<=0))throw new Error(`probability fills missing: ${visual.probabilityFills.join(', ')}`);

await page.screenshot({path:path.join(artifactDir,'builder-preview-default.png'),fullPage:true});
await page.click('#tuneBtn');
await page.waitForTimeout(250);
await page.screenshot({path:path.join(artifactDir,'builder-preview-tune.png'),fullPage:true});
console.log(JSON.stringify(visual,null,2));
await browser.close();
await new Promise(resolve=>server.close(resolve));
