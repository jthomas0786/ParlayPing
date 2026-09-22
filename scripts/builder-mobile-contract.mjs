import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require=createRequire(import.meta.url);
process.env.PUBLIC_BASE_URL='http://127.0.0.1:4174';
const {renderBuilderHtml}=require('../server/api/builder-page');
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');

const slip={
  source:'The Sports Outpost',
  returnUrl:'https://thesportsoutpost.com/mlb.html#betslip',
  returnLabel:'The Sports Outpost',
  sportsbook:'DraftKings',
  combinedOddsAmerican:null,
  combinedOddsVerified:false,
  legs:[
    {id:'okamoto',sport:'MLB',player:'Kazuma Okamoto',playerId:'848550',team:'TOR',matchup:'Blue Jays @ Orioles',market:'HR',displayMarket:'O0.5 HR',oddsAmerican:null,status:'UNRESOLVED',pregameProbability:null},
    {id:'abrams',sport:'MLB',player:'CJ Abrams',playerId:'682928',team:'WSH',matchup:'Nationals @ Tigers',market:'HR',displayMarket:'O0.5 HR',oddsAmerican:null,status:'UNRESOLVED',pregameProbability:null},
  ],
};
const fixture=renderBuilderHtml({slip,token:'s1.mobile.contract',liveDataAvailable:false});
const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.html':'text/html'};
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
await page.waitForTimeout(550);

const metrics=await page.evaluate(()=>{
  const rect=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}:null};
  const allRects=s=>[...document.querySelectorAll(s)].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}});
  return {
    header:rect('.app-header'),returnBar:rect('.pp-mobile-return-bar'),hero:rect('.concept-hero'),panel:rect('.parlay-panel'),
    clearSvg:rect('#clearAllBtn svg'),cta:rect('#openBookBtn'),ctaText:document.querySelector('#openBookBtn')?.innerText.trim(),
    cards:allRects('.pick-card'),gameBars:allRects('.game-bar'),photos:allRects('.player-photo'),
    odds:[...document.querySelectorAll('.pick-odds')].map(x=>x.textContent.trim()),
    teamImgs:[...document.querySelectorAll('.pick-card .team-pair img')].map(x=>x.getAttribute('src')),
    teamFallbacks:[...document.querySelectorAll('.pick-card .team-pair .team-token')].filter(x=>getComputedStyle(x).display!=='none').map(x=>x.textContent.trim()),
    books:allRects('.book-card'),bookGrid:rect('.sportsbook-grid'),share:rect('.share-section'),shares:allRects('.share-action'),
    secondaryIcons:allRects('.secondary-icon svg,.pin-icon svg'),lower:allRects('.secondary-panel'),footer:rect('.app-footer'),
    returnBackPosition:getComputedStyle(document.querySelector('.pp-return-back')).position,
    returnClosePosition:getComputedStyle(document.querySelector('.pp-return-close')).position,
    svgRects:allRects('svg'),
    scrollHeight:document.documentElement.scrollHeight,
    bodyWidth:document.body.scrollWidth,
    viewportWidth:innerWidth,
  };
});

const near=(actual,expected,tol,label)=>{if(Math.abs(actual-expected)>tol)throw new Error(`${label}: expected ${expected}±${tol}, got ${actual}`);};
near(metrics.header.height,148,2,'mobile header height');
near(metrics.hero.height,326,2,'mobile hero height');
if(!metrics.returnBar||metrics.returnBar.y<metrics.header.bottom-2)throw new Error('return bar is not in normal flow below the header');
if(metrics.returnBackPosition==='fixed'||metrics.returnClosePosition==='fixed')throw new Error('Sports Outpost return controls still overlay mobile content');
if(metrics.cards.length!==2)throw new Error(`expected 2 player cards, got ${metrics.cards.length}`);
if(metrics.cards.some(r=>r.height>125))throw new Error(`mobile player card too tall: ${metrics.cards.map(x=>x.height).join(', ')}`);
if(metrics.gameBars.some(r=>Math.abs(r.height-38)>2))throw new Error(`mobile game bar height drift: ${metrics.gameBars.map(x=>x.height).join(', ')}`);
if(metrics.photos.some(r=>Math.abs(r.width-44)>2||Math.abs(r.height-44)>2))throw new Error('mobile player photo geometry drifted');
if(metrics.odds.some(x=>x!=='—'))throw new Error(`missing odds rendered incorrectly: ${metrics.odds.join(', ')}`);
if(!metrics.teamImgs.some(x=>/\/mlb\/500\/tor\.png/.test(x||''))||!metrics.teamImgs.some(x=>/\/mlb\/500\/bal\.png/.test(x||'')))throw new Error(`Blue Jays/Orioles logos not resolved: ${metrics.teamImgs.join(', ')}`);
if(!metrics.teamImgs.some(x=>/\/mlb\/500\/wsh\.png/.test(x||''))||!metrics.teamImgs.some(x=>/\/mlb\/500\/det\.png/.test(x||'')))throw new Error(`Nationals/Tigers logos not resolved: ${metrics.teamImgs.join(', ')}`);
if(metrics.teamFallbacks.some(x=>x==='MLB'))throw new Error('generic MLB tokens are still visible when teams are known');
if(metrics.books.length!==6)throw new Error(`expected 6 sportsbook tiles, got ${metrics.books.length}`);
const bookY=metrics.books[0].y;if(metrics.books.some(x=>Math.abs(x.y-bookY)>2))throw new Error('sportsbook strip wrapped instead of staying one horizontal row');
if(metrics.bookGrid.width>370)throw new Error(`sportsbook viewport is too wide for phone: ${metrics.bookGrid.width}`);
near(metrics.cta.height,43,2,'sportsbook CTA height');
if(!/Open Parlay on DraftKings/i.test(metrics.ctaText||''))throw new Error(`sportsbook CTA text missing: ${metrics.ctaText}`);
if(metrics.shares.length!==4)throw new Error(`expected 4 share actions, got ${metrics.shares.length}`);
const shareY=metrics.shares[0].y;if(metrics.shares.some(x=>Math.abs(x.y-shareY)>2))throw new Error('share actions are not one row');
if(metrics.clearSvg&&Math.max(metrics.clearSvg.width,metrics.clearSvg.height)>20)throw new Error(`trash icon oversized: ${JSON.stringify(metrics.clearSvg)}`);
if(metrics.secondaryIcons.some(r=>Math.max(r.width,r.height)>24))throw new Error(`lower-panel SVG oversized: ${JSON.stringify(metrics.secondaryIcons)}`);
if(metrics.svgRects.some(r=>r.width>80||r.height>80))throw new Error(`oversized inline SVG remains: ${JSON.stringify(metrics.svgRects.filter(r=>r.width>80||r.height>80))}`);
if(metrics.bodyWidth>metrics.viewportWidth+2)throw new Error(`horizontal page overflow: body ${metrics.bodyWidth}, viewport ${metrics.viewportWidth}`);
if(metrics.scrollHeight>2450)throw new Error(`mobile page is still excessively tall: ${metrics.scrollHeight}px`);
if(metrics.share.y-metrics.cta.bottom>40)throw new Error(`excess whitespace before Share Your Betslip: ${metrics.share.y-metrics.cta.bottom}px`);

await page.click('#tuneBtn');
await page.waitForTimeout(300);
const tune=await page.evaluate(()=>({
  active:document.querySelector('#tuneBtn')?.classList.contains('active'),
  alts:[...document.querySelectorAll('.alt-lines')].map(x=>x.getBoundingClientRect().height),
  cards:[...document.querySelectorAll('.pick-card')].map(x=>x.getBoundingClientRect().height),
}));
if(!tune.active)throw new Error('Parlay Tune did not enter selected state');
if(tune.alts.some(h=>h<38||h>78))throw new Error(`Alt Lines mobile expansion drift: ${tune.alts.join(', ')}`);
if(tune.cards.some(h=>h>200))throw new Error(`Tune-expanded card too tall: ${tune.cards.join(', ')}`);

console.log(JSON.stringify({metrics,tune},null,2));
await browser.close();
await new Promise(resolve=>server.close(resolve));
