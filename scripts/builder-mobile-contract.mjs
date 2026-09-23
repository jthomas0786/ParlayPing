import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require=createRequire(import.meta.url);
process.env.PUBLIC_BASE_URL='http://127.0.0.1:4174';
const {renderBuilderHtml}=require('../server/api/builder-page');
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const artifactDir=path.join(root,'artifacts');
fs.mkdirSync(artifactDir,{recursive:true});

const start=new Date(Date.now()+60*60*1000).toISOString();
const slip={
  source:'The Sports Outpost',sportsbook:'DraftKings',combinedOddsAmerican:284,combinedOddsVerified:true,
  sportsbookLinks:{
    DraftKings:'https://sportsbook.example/betslip/draftkings-mobile',
    FanDuel:'https://sportsbook.example/betslip/fanduel-mobile',
    bet365:'https://sportsbook.example/betslip/bet365-mobile',
    Caesars:'https://sportsbook.example/betslip/caesars-mobile',
    'theScore Bet':'https://sportsbook.example/betslip/thescore-mobile',
  },
  legs:[
    {id:'wilson-reb',sport:'WNBA',player:"A'ja Wilson",playerId:'3149391',playerImageUrl:'https://a.espncdn.com/i/headshots/wnba/players/full/3149391.png',team:'LVA',gameId:'game-1',matchup:'SEA @ LVA',market:'rebounds',displayMarket:'Over 8 Rebounds',side:'over',line:8,oddsAmerican:-125,status:'LIVE',progressText:'7 / 8 rebounds',startTimeUTC:start,pregameProbability:.71,liveProbability:.82,altLines:[{line:7,oddsAmerican:-165,probability:.79},{line:8,oddsAmerican:-125,probability:.71},{line:9,oddsAmerican:+105,probability:.52}]},
    {id:'young-ast',sport:'WNBA',player:'Jackie Young',playerId:'4398917',playerImageUrl:'https://a.espncdn.com/i/headshots/wnba/players/full/4398917.png',team:'LVA',gameId:'game-1',matchup:'SEA @ LVA',market:'assists',displayMarket:'Over 8 Assists',side:'over',line:8,oddsAmerican:110,status:'LIVE',progressText:'5 / 8 assists',startTimeUTC:start,pregameProbability:.58,liveProbability:.46,altLines:[{line:6,oddsAmerican:-155,probability:.68},{line:7,oddsAmerican:-110,probability:.59},{line:8,oddsAmerican:+110,probability:.48}]},
  ],
};

const fixture=renderBuilderHtml({slip,token:'s1.mobile.acceptance',liveDataAvailable:true});
const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.html':'text/html'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4174');
  if(url.pathname==='/fixture'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(fixture);return;}
  const file=path.join(root,url.pathname.replace(/^\//,''));
  if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end('not found');return;}
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(4174,'127.0.0.1',resolve));

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:1,isMobile:true,hasTouch:true});
await page.goto('http://127.0.0.1:4174/fixture',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>document.documentElement.dataset.ppAcceptance==='ready',{timeout:5000});
await page.waitForSelector('.pp-game-group');
await page.waitForTimeout(250);

const metrics=await page.evaluate(()=>{
  const rect=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}:null};
  const visible=s=>[...document.querySelectorAll(s)].filter(el=>{const style=getComputedStyle(el),r=el.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&r.width>0&&r.height>0;});
  return {
    acceptance:document.documentElement.dataset.ppAcceptance,brandSrc:document.querySelector('.pp-acceptance-lockup')?.getAttribute('src')||'',legacyBrand:document.querySelectorAll('.pp-brand-lockup').length,
    heroBeforeDisplay:getComputedStyle(document.querySelector('.concept-hero'),'::before').display,heroTools:document.querySelectorAll('.concept-hero .hero-tool').length,
    gameGroups:document.querySelectorAll('.pp-game-group').length,gameHeaders:[...document.querySelectorAll('.pp-game-copy strong')].map(el=>el.textContent.trim()),legRows:document.querySelectorAll('.pp-leg-row').length,
    players:[...document.querySelectorAll('.pp-leg-copy strong')].map(el=>el.textContent.trim()),headshots:[...document.querySelectorAll('.pp-player-photo')].map(el=>({tag:el.tagName,src:el.getAttribute('src')||'',width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})),
    probabilities:[...document.querySelectorAll('.pp-prob-label')].map(el=>el.textContent.trim()),odds:[...document.querySelectorAll('.pp-leg-odds')].map(el=>el.textContent.trim()),summaryOdds:document.querySelector('#combinedOdds')?.textContent?.trim(),summaryProbability:document.querySelector('#impliedProbability')?.textContent?.trim(),
    altVisible:visible('.pp-leg-alts').length,books:[...document.querySelectorAll('.book-card')].map(el=>({book:el.dataset.book,url:el.dataset.exactUrl,disabled:el.disabled})),
    shareActions:document.querySelectorAll('.share-action').length,bodyWidth:document.body.scrollWidth,viewportWidth:innerWidth,
  };
});

if(metrics.acceptance!=='ready')throw new Error(`acceptance layer not ready: ${metrics.acceptance}`);
if(metrics.brandSrc!=='/parlayping-approved-lockup.svg'||metrics.legacyBrand!==0)throw new Error('approved lockup is not authoritative');
if(metrics.heroBeforeDisplay!=='none'||metrics.heroTools!==3)throw new Error('hero regressed');
if(metrics.gameGroups!==1||metrics.legRows!==2||metrics.gameHeaders.join('|')!=='SEA @ LVA')throw new Error(`same-game grouping failed: ${JSON.stringify(metrics.gameHeaders)}`);
if(!metrics.players.includes("A'ja Wilson")||!metrics.players.includes('Jackie Young'))throw new Error(`player names missing: ${metrics.players.join(', ')}`);
if(metrics.headshots.length!==2||metrics.headshots.some(row=>row.tag!=='IMG'||!row.src||row.width<38||row.height<38))throw new Error(`player headshots are not rendered correctly: ${JSON.stringify(metrics.headshots)}`);
if(metrics.probabilities.length!==2||metrics.probabilities.some(value=>!/%/.test(value)))throw new Error(`probability UI missing: ${metrics.probabilities.join(', ')}`);
if(metrics.odds.join('|')!=='-125|+110')throw new Error(`odds UI missing: ${metrics.odds.join(', ')}`);
if(metrics.summaryOdds!=='+284'||metrics.summaryProbability!=='26.0%')throw new Error(`summary metrics wrong: ${metrics.summaryOdds}/${metrics.summaryProbability}`);
if(metrics.altVisible!==0)throw new Error(`alt lines visible before tune: ${metrics.altVisible}`);
if(metrics.books.length!==5||metrics.books.some(row=>!row.url||row.disabled||!row.url.includes('/betslip/')))throw new Error(`exact sportsbook links are not functional: ${JSON.stringify(metrics.books)}`);
if(metrics.shareActions!==4)throw new Error(`share actions regressed: ${metrics.shareActions}`);
if(metrics.bodyWidth>metrics.viewportWidth+2)throw new Error(`horizontal overflow: body ${metrics.bodyWidth}, viewport ${metrics.viewportWidth}`);

await page.screenshot({path:path.join(artifactDir,'builder-mobile-default.png'),fullPage:true});
await page.click('#tuneBtn');
await page.waitForFunction(()=>[...document.querySelectorAll('.pp-leg-alts')].some(el=>!el.hidden));
await page.waitForTimeout(120);

const tune=await page.evaluate(()=>({
  active:document.querySelector('#tuneBtn')?.classList.contains('active')||false,
  expanded:document.querySelector('#tuneBtn')?.getAttribute('aria-expanded'),
  visible:[...document.querySelectorAll('.pp-leg-alts')].filter(el=>!el.hidden).length,
  lines:[...document.querySelectorAll('.pp-alt-option span')].map(el=>el.textContent.trim()),
  odds:[...document.querySelectorAll('.pp-alt-option strong')].map(el=>el.textContent.trim()),
}));
if(!tune.active||tune.expanded!=='true'||tune.visible!==2)throw new Error(`Parlay Tune did not open cleanly: ${JSON.stringify(tune)}`);
if(!tune.lines.includes('Over 7')||!tune.lines.includes('Over 9')||!tune.lines.includes('Over 6'))throw new Error(`verified line chips missing: ${tune.lines.join(', ')}`);
if(!tune.odds.includes('-165')||!tune.odds.includes('+105')||!tune.odds.includes('-155'))throw new Error(`alt odds missing: ${tune.odds.join(', ')}`);

await page.screenshot({path:path.join(artifactDir,'builder-mobile-tune.png'),fullPage:true});
console.log(JSON.stringify({metrics,tune},null,2));
await browser.close();
await new Promise(resolve=>server.close(resolve));
