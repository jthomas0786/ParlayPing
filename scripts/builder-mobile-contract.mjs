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

const today=new Date();
const todayStart=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate(),19,5));
const tomorrowStart=new Date(todayStart.getTime()+24*60*60*1000);
const slip={
  source:'The Sports Outpost',
  returnUrl:'https://thesportsoutpost.com/mlb.html#betslip',
  returnLabel:'The Sports Outpost',
  sportsbook:'DraftKings',
  combinedOddsAmerican:null,
  combinedOddsVerified:false,
  legs:[
    {id:'okamoto',sport:'MLB',player:'Kazuma Okamoto',playerId:'672960',team:'TOR',matchup:'Blue Jays @ Orioles',market:'HR',displayMarket:'O0.5 HR',oddsAmerican:-120,sportsbook:'DraftKings',status:'UNRESOLVED',pregameProbability:.642,startTimeUTC:todayStart.toISOString(),originalText:'PP_BOOK_ODDS:{"DraftKings":-120,"FanDuel":-115,"bet365":-118}'},
    {id:'abrams',sport:'MLB',player:'CJ Abrams',playerId:'682928',team:'WSH',matchup:'Nationals @ Tigers',market:'HR',displayMarket:'O0.5 HR',oddsAmerican:105,sportsbook:'DraftKings',status:'UNRESOLVED',pregameProbability:.587,startTimeUTC:tomorrowStart.toISOString(),originalText:'PP_BOOK_ODDS:{"DraftKings":105,"FanDuel":110,"Caesars":108}'},
  ],
};
const fixture=renderBuilderHtml({slip,token:'s1.mobile.contract',liveDataAvailable:false});
const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.html':'text/html'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4174');
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
await new Promise(resolve=>server.listen(4174,'127.0.0.1',resolve));

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:1,isMobile:true,hasTouch:true});
await page.goto('http://127.0.0.1:4174/fixture',{waitUntil:'domcontentloaded'});
await page.waitForSelector('.pick-card');
await page.waitForTimeout(650);

const metrics=await page.evaluate(()=>{
  const rect=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}:null};
  const allRects=s=>[...document.querySelectorAll(s)].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}});
  const contentCenterDelta=s=>{
    const el=document.querySelector(s);if(!el)return null;
    const b=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);const c=range.getBoundingClientRect();
    return Math.abs((c.x+c.width/2)-(b.x+b.width/2));
  };
  const hero=document.querySelector('.concept-hero');
  return {
    header:rect('.app-header'),hero:rect('.concept-hero'),panel:rect('.parlay-panel'),
    brandSrc:document.querySelector('.pp-brand-lockup')?.getAttribute('src')||'',
    heroWatermark:getComputedStyle(hero,'::before').backgroundImage,
    heroWatermarkOpacity:getComputedStyle(hero,'::before').opacity,
    heroWatermarkTransform:getComputedStyle(hero,'::before').transform,
    returnControls:document.querySelectorAll('.pp-return-control,.pp-mobile-return-bar,.pp-mobile-origin-controls').length,
    clearSvg:rect('#clearAllBtn svg'),cta:rect('#openBookBtn'),ctaText:document.querySelector('#openBookBtn')?.innerText.trim(),
    cards:allRects('.pick-card'),gameBars:allRects('.game-bar'),photos:allRects('.player-photo'),
    teamPairs:allRects('.team-pair'),gameHeadings:allRects('.game-bar strong'),gameTimes:allRects('.game-time:not([hidden])'),gameTimeText:[...document.querySelectorAll('.game-time:not([hidden])')].map(x=>x.textContent.replace(/\s+/g,' ').trim()),
    playerNames:[...document.querySelectorAll('.player-copy strong')].map(x=>x.textContent.trim()),
    markets:[...document.querySelectorAll('.player-copy span')].map(x=>x.textContent.trim()),
    probabilityLabels:[...document.querySelectorAll('.pick-probability')].map(x=>x.textContent.trim()),
    probabilityFillWidths:allRects('.meter-track i').map(x=>x.width),
    odds:[...document.querySelectorAll('.pick-odds')].map(x=>x.textContent.trim()),
    oddsBooks:[...document.querySelectorAll('.pick-odds')].map(x=>x.dataset.book||''),
    teamImgs:[...document.querySelectorAll('.pick-card .team-pair img')].map(x=>x.getAttribute('src')),
    teamFallbacks:[...document.querySelectorAll('.pick-card .team-pair .team-token')].filter(x=>getComputedStyle(x).display!=='none').map(x=>x.textContent.trim()),
    sportShields:document.querySelectorAll('.sport-shield').length,
    tuneCenterDelta:contentCenterDelta('#tuneBtn'),saveCenterDelta:contentCenterDelta('#saveBtn'),
    books:allRects('.book-card'),bookGrid:rect('.sportsbook-grid'),share:rect('.share-section'),shares:allRects('.share-action'),
    secondaryIcons:allRects('.secondary-icon svg,.pin-icon svg'),lower:allRects('.secondary-panel'),footer:rect('.app-footer'),
    toastDisplay:getComputedStyle(document.querySelector('#toast')).display,
    svgRects:allRects('svg'),
    scrollHeight:document.documentElement.scrollHeight,
    bodyWidth:document.body.scrollWidth,
    viewportWidth:innerWidth,
  };
});

const near=(actual,expected,tol,label)=>{if(Math.abs(actual-expected)>tol)throw new Error(`${label}: expected ${expected}±${tol}, got ${actual}`);};
near(metrics.header.height,148,2,'mobile header height');
near(metrics.hero.height,326,2,'mobile hero height');
if(metrics.returnControls!==0)throw new Error(`source Back/X controls still render: ${metrics.returnControls}`);
if(!/parlayping-approved-logo\.png$/i.test(metrics.brandSrc))throw new Error(`exact approved logo asset is not in the header: ${metrics.brandSrc}`);
if(!/parlayping-approved-logo\.png/i.test(metrics.heroWatermark))throw new Error(`approved-logo hero watermark is missing: ${metrics.heroWatermark}`);
if(!(Number(metrics.heroWatermarkOpacity)>0&&Number(metrics.heroWatermarkOpacity)<.2))throw new Error(`hero watermark opacity is wrong: ${metrics.heroWatermarkOpacity}`);
if(!metrics.heroWatermarkTransform||metrics.heroWatermarkTransform==='none')throw new Error('hero watermark is not tilted');
if(metrics.sportShields!==0)throw new Error(`league shields were reintroduced ahead of team logos: ${metrics.sportShields}`);
if(metrics.cards.length!==2)throw new Error(`expected 2 player cards, got ${metrics.cards.length}`);
if(metrics.cards.some(r=>r.height>125))throw new Error(`mobile player card too tall: ${metrics.cards.map(x=>x.height).join(', ')}`);
if(metrics.gameBars.some(r=>Math.abs(r.height-38)>2))throw new Error(`mobile game bar height drift: ${metrics.gameBars.map(x=>x.height).join(', ')}`);
if(metrics.photos.some(r=>Math.abs(r.width-44)>2||Math.abs(r.height-44)>2))throw new Error('mobile player photo geometry drifted');
if(!metrics.playerNames.includes('Kazuma Okamoto'))throw new Error(`full player name missing: ${metrics.playerNames.join(', ')}`);
if(!metrics.markets.some(x=>/^Over 0\.5 HR$/i.test(x)))throw new Error(`market label was not normalized to concept copy: ${metrics.markets.join(', ')}`);
if(metrics.probabilityLabels.join('|')!=='64.2%|58.7%')throw new Error(`UNRESOLVED replaced probability text: ${metrics.probabilityLabels.join(', ')}`);
if(metrics.probabilityFillWidths.some(x=>x<=0))throw new Error(`probability meter did not fill from real percentages: ${metrics.probabilityFillWidths.join(', ')}`);
if(metrics.gameTimes.length!==2||metrics.gameTimeText.some(x=>!x))throw new Error(`game times are missing: ${metrics.gameTimeText.join(', ')}`);
if(metrics.gameTimeText[0].includes('•'))throw new Error(`today's game should show time only: ${metrics.gameTimeText[0]}`);
if(!metrics.gameTimeText[1].includes('•'))throw new Error(`non-current-date game must show date and time: ${metrics.gameTimeText[1]}`);
metrics.gameTimes.forEach((time,i)=>{const heading=metrics.gameHeadings[i];if(!heading||time.x<heading.right-2||time.x-heading.right>14)throw new Error(`game date/time is not next to game information on row ${i+1}`);});
if(metrics.tuneCenterDelta==null||metrics.tuneCenterDelta>5)throw new Error(`Parlay Tune contents are not centered: ${metrics.tuneCenterDelta}`);
if(metrics.saveCenterDelta==null||metrics.saveCenterDelta>5)throw new Error(`Save contents are not centered: ${metrics.saveCenterDelta}`);
if(metrics.odds.join('|')!=='-120|+105')throw new Error(`DraftKings odds not shown initially: ${metrics.odds.join(', ')}`);
if(metrics.oddsBooks.some(x=>x!=='DraftKings'))throw new Error(`initial odds are not labeled DraftKings: ${metrics.oddsBooks.join(', ')}`);
if(!metrics.teamImgs.some(x=>/\/mlb\/500\/tor\.png/.test(x||''))||!metrics.teamImgs.some(x=>/\/mlb\/500\/bal\.png/.test(x||'')))throw new Error(`Blue Jays/Orioles logos not resolved: ${metrics.teamImgs.join(', ')}`);
if(!metrics.teamImgs.some(x=>/\/mlb\/500\/wsh\.png/.test(x||''))||!metrics.teamImgs.some(x=>/\/mlb\/500\/det\.png/.test(x||'')))throw new Error(`Nationals/Tigers logos not resolved: ${metrics.teamImgs.join(', ')}`);
if(metrics.teamFallbacks.some(x=>x==='MLB'))throw new Error('generic MLB tokens are still visible when teams are known');
if(metrics.books.length!==6)throw new Error(`expected 6 sportsbook tiles, got ${metrics.books.length}`);
const bookY=metrics.books[0].y;if(metrics.books.some(x=>Math.abs(x.y-bookY)>2))throw new Error('sportsbook strip wrapped instead of staying one horizontal row');
if(metrics.bookGrid.width>370)throw new Error(`sportsbook viewport is too wide for phone: ${metrics.bookGrid.width}`);
near(metrics.cta.height,43,2,'sportsbook CTA height');
const normalizedCta=String(metrics.ctaText||'').replace(/\s+/g,' ').trim();
if(!/Open Parlay on DraftKings/i.test(normalizedCta))throw new Error(`sportsbook CTA text missing: ${normalizedCta}`);
if(metrics.shares.length!==4)throw new Error(`expected 4 share actions, got ${metrics.shares.length}`);
const shareY=metrics.shares[0].y;if(metrics.shares.some(x=>Math.abs(x.y-shareY)>2))throw new Error('share actions are not one row');
if(metrics.clearSvg&&Math.max(metrics.clearSvg.width,metrics.clearSvg.height)>20)throw new Error(`trash icon oversized: ${JSON.stringify(metrics.clearSvg)}`);
if(metrics.secondaryIcons.some(r=>Math.max(r.width,r.height)>24))throw new Error(`lower-panel SVG oversized: ${JSON.stringify(metrics.secondaryIcons)}`);
if(metrics.svgRects.some(r=>r.width>80||r.height>80))throw new Error(`oversized inline SVG remains: ${JSON.stringify(metrics.svgRects.filter(r=>r.width>80||r.height>80))}`);
if(metrics.toastDisplay!=='none')throw new Error('interaction toast is still visible over the approved mobile concept');
if(metrics.bodyWidth>metrics.viewportWidth+2)throw new Error(`horizontal page overflow: body ${metrics.bodyWidth}, viewport ${metrics.viewportWidth}`);
if(metrics.scrollHeight>2380)throw new Error(`mobile page is still excessively tall: ${metrics.scrollHeight}px`);
if(metrics.share.y-metrics.cta.bottom>40)throw new Error(`excess whitespace before Share Your Betslip: ${metrics.share.y-metrics.cta.bottom}px`);

await page.click('.book-card[data-book="FanDuel"]');
await page.waitForTimeout(80);
const fanDuel=await page.evaluate(()=>({
  odds:[...document.querySelectorAll('.pick-odds')].map(x=>x.textContent.trim()),
  books:[...document.querySelectorAll('.pick-odds')].map(x=>x.dataset.book||''),
  selected:document.querySelector('.book-card.active')?.dataset.book||'',
}));
if(fanDuel.selected!=='FanDuel')throw new Error(`FanDuel did not become selected: ${fanDuel.selected}`);
if(fanDuel.odds.join('|')!=='-115|+110')throw new Error(`FanDuel leg odds did not replace DraftKings prices: ${fanDuel.odds.join(', ')}`);
if(fanDuel.books.some(x=>x!=='FanDuel'))throw new Error(`leg odds are not labeled FanDuel: ${fanDuel.books.join(', ')}`);

await page.screenshot({path:path.join(artifactDir,'builder-mobile-default.png'),fullPage:true});
await page.click('#tuneBtn');
await page.waitForTimeout(300);
const tune=await page.evaluate(()=>({
  active:document.querySelector('#tuneBtn')?.classList.contains('active'),
  alts:[...document.querySelectorAll('.alt-lines')].map(x=>x.getBoundingClientRect().height),
  cards:[...document.querySelectorAll('.pick-card')].map(x=>x.getBoundingClientRect().height),
  toastDisplay:getComputedStyle(document.querySelector('#toast')).display,
}));
if(!tune.active)throw new Error('Parlay Tune did not enter selected state');
if(tune.alts.some(h=>h<38||h>78))throw new Error(`Alt Lines mobile expansion drift: ${tune.alts.join(', ')}`);
if(tune.cards.some(h=>h>200))throw new Error(`Tune-expanded card too tall: ${tune.cards.join(', ')}`);
if(tune.toastDisplay!=='none')throw new Error('Parlay Tune toast is covering the alt-line concept state');
await page.screenshot({path:path.join(artifactDir,'builder-mobile-tune.png'),fullPage:true});

console.log(JSON.stringify({metrics,fanDuel,tune},null,2));
await browser.close();
await new Promise(resolve=>server.close(resolve));
