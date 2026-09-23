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
const headshot='https://a.espncdn.com/i/headshots/wnba/players/full/3149391.png';
const slip={
  source:'X @ParlayPing',
  sportsbook:'DraftKings',
  combinedOddsAmerican:null,
  combinedOddsVerified:false,
  legs:[
    {id:'wilson-reb',sport:'WNBA',player:"A'ja Wilson",playerId:'3149391',playerImageUrl:headshot,team:'LVA',gameId:'game-1',matchup:'SEA @ LVA',market:'rebounds',displayMarket:'8+ REB',side:'over',line:8,oddsAmerican:-125,status:'LIVE',progressText:'7 / 8 rebounds',startTimeUTC:start,pregameProbability:.71,altLines:[{line:9},{line:10}]},
    {id:'young-ast',sport:'WNBA',player:'Jackie Young',playerId:'3918298',playerImageUrl:headshot,team:'LVA',gameId:'game-1',matchup:'SEA @ LVA',market:'assists',displayMarket:'8+ AST',side:'over',line:8,oddsAmerican:110,status:'LIVE',progressText:'5 / 8 assists',startTimeUTC:start,pregameProbability:.58,altLines:[{line:6},{line:7}]},
  ],
};

const fixture=renderBuilderHtml({slip,token:'s1.mobile.acceptance',liveDataAvailable:true});
const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.html':'text/html'};
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
await page.waitForFunction(()=>document.documentElement.dataset.ppAcceptance==='ready',{timeout:5000});
await page.waitForSelector('.pp-game-group');
await page.waitForTimeout(250);

const metrics=await page.evaluate(()=>{
  const rect=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}:null};
  const allRects=s=>[...document.querySelectorAll(s)].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}});
  const visible=s=>[...document.querySelectorAll(s)].filter(el=>{const style=getComputedStyle(el),r=el.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&r.width>0&&r.height>0;});
  return {
    acceptance:document.documentElement.dataset.ppAcceptance,
    brandSrc:document.querySelector('.pp-acceptance-lockup')?.getAttribute('src')||'',
    legacyBrand:document.querySelectorAll('.pp-brand-lockup').length,
    hero:rect('.concept-hero'),
    heroBeforeDisplay:getComputedStyle(document.querySelector('.concept-hero'),'::before').display,
    heroTools:document.querySelectorAll('.concept-hero .hero-tool').length,
    gameGroups:document.querySelectorAll('.pp-game-group').length,
    gameHeaders:[...document.querySelectorAll('.pp-game-copy strong')].map(el=>el.textContent.trim()),
    legRows:document.querySelectorAll('.pp-leg-row').length,
    players:[...document.querySelectorAll('.pp-leg-copy strong')].map(el=>el.textContent.trim()),
    markets:[...document.querySelectorAll('.pp-leg-copy span')].map(el=>el.textContent.trim()),
    headshots:[...document.querySelectorAll('.pp-player-photo')].map(el=>({tag:el.tagName,src:el.getAttribute('src')||'',width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})),
    visibleProbability:visible('.probability-meter,.pick-probability,.probability-pill').length,
    visibleOdds:visible('.pick-odds,.odds-pill').length,
    visibleLegacyAltLines:visible('.alt-lines,.alt-option').length,
    tune:rect('#tuneBtn'),
    sportsbookTiles:document.querySelectorAll('.book-card').length,
    shareActions:document.querySelectorAll('.share-action').length,
    bodyWidth:document.body.scrollWidth,
    viewportWidth:innerWidth,
    scrollHeight:document.documentElement.scrollHeight,
    svgRects:allRects('svg'),
  };
});

if(metrics.acceptance!=='ready')throw new Error(`acceptance layer not ready: ${metrics.acceptance}`);
if(metrics.brandSrc!=='/parlayping-approved-lockup.svg')throw new Error(`approved lockup is not authoritative: ${metrics.brandSrc}`);
if(metrics.legacyBrand!==0)throw new Error(`legacy brand lockup survived: ${metrics.legacyBrand}`);
if(metrics.heroBeforeDisplay!=='none')throw new Error(`legacy hero watermark is still visible: ${metrics.heroBeforeDisplay}`);
if(metrics.heroTools!==3)throw new Error(`expected 3 clean hero actions, got ${metrics.heroTools}`);
if(metrics.gameGroups!==1)throw new Error(`same-game legs were not grouped: ${metrics.gameGroups} groups`);
if(metrics.legRows!==2)throw new Error(`expected 2 nested legs, got ${metrics.legRows}`);
if(metrics.gameHeaders.join('|')!=='SEA @ LVA')throw new Error(`game heading mismatch: ${metrics.gameHeaders.join(', ')}`);
if(!metrics.players.includes("A'ja Wilson")||!metrics.players.includes('Jackie Young'))throw new Error(`player names missing: ${metrics.players.join(', ')}`);
if(!metrics.markets.includes('8+ REB')||!metrics.markets.includes('8+ AST'))throw new Error(`market labels missing: ${metrics.markets.join(', ')}`);
if(metrics.headshots.length!==2||metrics.headshots.some(row=>row.tag!=='IMG'||!row.src||row.width<38||row.height<38))throw new Error(`player headshots are not rendered correctly: ${JSON.stringify(metrics.headshots)}`);
if(metrics.visibleProbability!==0)throw new Error(`probability UI is still visible: ${metrics.visibleProbability}`);
if(metrics.visibleOdds!==0)throw new Error(`odds UI is still visible: ${metrics.visibleOdds}`);
if(metrics.visibleLegacyAltLines!==0)throw new Error(`legacy alt-line clutter is still visible: ${metrics.visibleLegacyAltLines}`);
if(metrics.sportsbookTiles!==6)throw new Error(`sportsbook section regressed: ${metrics.sportsbookTiles} tiles`);
if(metrics.shareActions!==4)throw new Error(`share actions regressed: ${metrics.shareActions}`);
if(metrics.bodyWidth>metrics.viewportWidth+2)throw new Error(`horizontal overflow: body ${metrics.bodyWidth}, viewport ${metrics.viewportWidth}`);
if(metrics.svgRects.some(r=>r.width>90||r.height>90))throw new Error(`oversized inline SVG remains: ${JSON.stringify(metrics.svgRects.filter(r=>r.width>90||r.height>90))}`);

await page.screenshot({path:path.join(artifactDir,'builder-mobile-default.png'),fullPage:true});
await page.click('#tuneBtn');
await page.waitForSelector('#ppAcceptanceTune:not([hidden])');
await page.waitForTimeout(120);

const tune=await page.evaluate(()=>({
  active:document.querySelector('#tuneBtn')?.classList.contains('active')||false,
  expanded:document.querySelector('#tuneBtn')?.getAttribute('aria-expanded'),
  visible:!document.querySelector('#ppAcceptanceTune')?.hidden,
  lineText:[...document.querySelectorAll('#ppAcceptanceTune .pp-tune-line')].map(el=>el.textContent.trim()),
  text:document.querySelector('#ppAcceptanceTune')?.innerText||'',
  oddsCount:[...document.querySelectorAll('#ppAcceptanceTune *')].filter(el=>/[+-]\d{2,4}\b/.test(el.textContent||'')).length,
  percentCount:[...document.querySelectorAll('#ppAcceptanceTune *')].filter(el=>/\d+(?:\.\d+)?%/.test(el.textContent||'')).length,
}));
if(!tune.active||tune.expanded!=='true'||!tune.visible)throw new Error(`Parlay Tune did not open cleanly: ${JSON.stringify(tune)}`);
if(tune.lineText.join('|')!=='9|10|6|7')throw new Error(`verified line chips missing: ${tune.lineText.join(', ')}`);
if(tune.oddsCount!==0)throw new Error(`Parlay Tune still exposes odds: ${tune.oddsCount}`);
if(tune.percentCount!==0)throw new Error(`Parlay Tune still exposes probabilities: ${tune.percentCount}`);

await page.screenshot({path:path.join(artifactDir,'builder-mobile-tune.png'),fullPage:true});

console.log(JSON.stringify({metrics,tune},null,2));
await browser.close();
await new Promise(resolve=>server.close(resolve));
