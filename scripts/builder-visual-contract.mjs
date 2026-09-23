import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require=createRequire(import.meta.url);
process.env.PUBLIC_BASE_URL='http://127.0.0.1:4173';
const {renderBuilderHtml}=require('../server/api/builder-page');
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');

const slip={
  sportsbook:'DraftKings',combinedOddsAmerican:412,combinedOddsVerified:true,
  legs:[
    {id:'henry',sport:'NFL',player:'Derrick Henry',playerId:'3043078',team:'BAL',matchup:'BAL @ KC',market:'ATD',displayMarket:'Anytime TD Scorer',oddsAmerican:-235,status:'PENDING',pregameProbability:.937,startTimeUTC:'2026-12-01T18:00:00Z'},
    {id:'mccaffrey',sport:'NFL',player:'Christian McCaffrey',playerId:'3117251',team:'SF',matchup:'TEN @ HOU',market:'ATD',displayMarket:'Anytime TD Scorer',oddsAmerican:-240,status:'PENDING',pregameProbability:.94,startTimeUTC:'2026-12-01T21:05:00Z'},
    {id:'allen',sport:'NFL',player:'Josh Allen',playerId:'3918298',team:'BUF',matchup:'BUF @ JAX',market:'ATD',displayMarket:'Anytime TD Scorer',oddsAmerican:-185,status:'PENDING',pregameProbability:.911,startTimeUTC:'2026-12-01T18:00:00Z'},
  ],
};
const fixture=renderBuilderHtml({slip,token:'s1.visual.contract',liveDataAvailable:true});

const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webp':'image/webp','.html':'text/html'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4173');
  if(url.pathname==='/visual-fixture'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(fixture);return;}
  const file=path.join(root,url.pathname.replace(/^\//,''));
  if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end('not found');return;}
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(4173,'127.0.0.1',resolve));

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1024,height:1900},deviceScaleFactor:1});
await page.goto('http://127.0.0.1:4173/visual-fixture',{waitUntil:'domcontentloaded'});
await page.waitForSelector('.pick-card');
await page.waitForFunction(()=>document.documentElement.dataset.ppApprovedAssets==='ready',{timeout:5000});
await page.waitForTimeout(180);

const before=await page.evaluate(()=>{
  const rect=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null};
  const hero=document.querySelector('.concept-hero');
  return {
    shell:rect('main.app-shell'),header:rect('.app-header'),hero:rect('.concept-hero'),panel:rect('.parlay-panel'),
    card:rect('.pick-card'),game:rect('.pick-card .game-bar'),photo:rect('.pick-card .player-photo'),meter:rect('.pick-card .meter-track'),
    alt:rect('.pick-card .alt-lines'),books:[...document.querySelectorAll('.book-card')].map(x=>x.getBoundingClientRect()).map(r=>({x:r.x,y:r.y,width:r.width,height:r.height})),
    shares:[...document.querySelectorAll('.share-action')].map(x=>x.getBoundingClientRect()).map(r=>({x:r.x,y:r.y,width:r.width,height:r.height})),
    lower:[...document.querySelectorAll('.secondary-panel')].map(x=>x.getBoundingClientRect()).map(r=>({x:r.x,y:r.y,width:r.width,height:r.height})),
    cards:document.querySelectorAll('.pick-card').length,
    brand:document.querySelector('.pp-brand-name')?.textContent,
    brandSrc:document.querySelector('.pp-brand-lockup')?.getAttribute('src')||'',
    heroWatermark:getComputedStyle(hero,'::before').backgroundImage,
    rankNumbers:[...document.querySelectorAll('.pick-card')].some(c=>/^\s*[123]\s*$/.test(c.firstElementChild?.textContent||'')),
  };
});

const near=(actual,expected,tol=2,label='value')=>{if(Math.abs(actual-expected)>tol)throw new Error(`${label}: expected ${expected}±${tol}, got ${actual}`);};
near(before.shell.width,940,1,'shell width');
near(before.header.height,84,1,'header height');
near(before.hero.height,228,1,'hero height');
near(before.panel.width,940,1,'parlay panel width');
near(before.game.height,42,1,'game bar height');
near(before.photo.width,54,1,'player photo width');
near(before.photo.height,54,1,'player photo height');
near(before.meter.width,116,1,'probability bar width');
near(before.meter.height,11,1,'probability bar height');
if(before.cards!==3)throw new Error(`expected 3 pick cards, got ${before.cards}`);
if(before.books.length!==6)throw new Error(`expected 6 sportsbook tiles, got ${before.books.length}`);
if(before.shares.length!==4)throw new Error(`expected 4 share actions, got ${before.shares.length}`);
if(before.lower.length!==2)throw new Error(`expected 2 lower panels, got ${before.lower.length}`);
if(before.brand!=='ParlayPing')throw new Error(`brand lockup mismatch: ${before.brand}`);
if(!/parlayping-approved-wordmark\.webp$/i.test(before.brandSrc))throw new Error(`approved header wordmark missing: ${before.brandSrc}`);
if(!/parlayping-approved-hero\.webp/i.test(before.heroWatermark))throw new Error(`approved hero mark missing: ${before.heroWatermark}`);
if(before.rankNumbers)throw new Error('rank numbers were reintroduced beside players');
if(before.alt.height>1)throw new Error(`Alt Lines must be collapsed initially, got ${before.alt.height}px`);
const bookY=before.books[0].y;if(before.books.some(b=>Math.abs(b.y-bookY)>1))throw new Error('sportsbook tiles are not one horizontal row');
const shareY=before.shares[0].y;if(before.shares.some(b=>Math.abs(b.y-shareY)>1))throw new Error('share actions are not one horizontal row');
if(Math.abs(before.lower[0].y-before.lower[1].y)>1)throw new Error('lower panels are not aligned side by side');

await page.click('#tuneBtn');
await page.waitForTimeout(280);
const after=await page.evaluate(()=>({
  open:document.querySelector('.parlay-panel')?.classList.contains('tune-open'),
  active:document.querySelector('#tuneBtn')?.classList.contains('active'),
  alts:[...document.querySelectorAll('.alt-lines')].map(x=>x.getBoundingClientRect().height),
  labels:[...document.querySelectorAll('.alt-title')].map(x=>x.textContent.trim()),
}));
if(!after.open||!after.active)throw new Error('Parlay Tune did not enter selected/open state');
if(after.alts.some(h=>h<30))throw new Error(`Alt Lines did not expand under every player: ${after.alts.join(', ')}`);
if(after.labels.some(x=>!x.startsWith('Alt Lines')))throw new Error('Alt Lines label missing under a player');

console.log(JSON.stringify({before,after},null,2));
await browser.close();
await new Promise(resolve=>server.close(resolve));
