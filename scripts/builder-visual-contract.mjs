import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require=createRequire(import.meta.url);
process.env.PUBLIC_BASE_URL='http://127.0.0.1:4173';
const {renderBuilderHtml}=require('../server/api/builder-page');
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const artifactDir=path.join(root,'artifacts');
fs.mkdirSync(artifactDir,{recursive:true});

const slip={
  source:'The Sports Outpost',sportsbook:'DraftKings',combinedOddsAmerican:412,combinedOddsVerified:true,
  sportsbookLinks:{
    DraftKings:'https://sportsbook.example/betslip/draftkings-exact',
    FanDuel:'https://sportsbook.example/betslip/fanduel-exact',
    bet365:'https://sportsbook.example/betslip/bet365-exact',
    Caesars:'https://sportsbook.example/betslip/caesars-exact',
    'theScore Bet':'https://sportsbook.example/betslip/thescore-exact',
  },
  legs:[
    {id:'allen-pass',sport:'NFL',player:'Josh Allen',playerId:'3918298',playerImageUrl:'https://a.espncdn.com/i/headshots/nfl/players/full/3918298.png',team:'BUF',gameId:'buf-nyj',matchup:'BUF @ NYJ',market:'passing yards',displayMarket:'Over 249.5 Passing Yards',side:'over',line:249.5,oddsAmerican:-110,status:'PENDING',pregameProbability:.61,startTimeUTC:'2026-12-01T18:00:00Z',altLines:[{line:225.5,oddsAmerican:-165,probability:.66},{line:249.5,oddsAmerican:-110,probability:.61},{line:275.5,oddsAmerican:+135,probability:.44}]},
    {id:'cook-rush',sport:'NFL',player:'James Cook',playerId:'4379399',playerImageUrl:'https://a.espncdn.com/i/headshots/nfl/players/full/4379399.png',team:'BUF',gameId:'buf-nyj',matchup:'BUF @ NYJ',market:'rushing yards',displayMarket:'Over 69.5 Rushing Yards',side:'over',line:69.5,oddsAmerican:-105,status:'PENDING',pregameProbability:.57,startTimeUTC:'2026-12-01T18:00:00Z',altLines:[{line:60.5,oddsAmerican:-145,probability:.63},{line:69.5,oddsAmerican:-105,probability:.57}]},
    {id:'henry-rush',sport:'NFL',player:'Derrick Henry',playerId:'3043078',playerImageUrl:'https://a.espncdn.com/i/headshots/nfl/players/full/3043078.png',team:'BAL',gameId:'bal-kc',matchup:'BAL @ KC',market:'rushing yards',displayMarket:'Over 84.5 Rushing Yards',side:'over',line:84.5,oddsAmerican:-115,status:'LIVE',progressText:'62 / 85 yards',pregameProbability:.64,liveProbability:.71,startTimeUTC:'2026-12-01T21:05:00Z',altLines:[{line:75.5,oddsAmerican:-150,probability:.69},{line:84.5,oddsAmerican:-115,probability:.64}]},
  ],
};
const fixture=renderBuilderHtml({slip,token:'s1.visual.acceptance',liveDataAvailable:true});

const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.html':'text/html'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4173');
  if(url.pathname==='/visual-fixture'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(fixture);return;}
  const file=path.join(root,url.pathname.replace(/^\//,''));
  if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end('not found');return;}
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(4173,'127.0.0.1',resolve));

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
await page.goto('http://127.0.0.1:4173/visual-fixture',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>document.documentElement.dataset.ppAcceptance==='ready',{timeout:5000});
await page.waitForSelector('.pp-game-group');
await page.waitForTimeout(250);

const before=await page.evaluate(()=>{
  const rect=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}:null};
  const visible=s=>[...document.querySelectorAll(s)].filter(el=>{const style=getComputedStyle(el),r=el.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&r.width>0&&r.height>0;});
  const hero=document.querySelector('.concept-hero');
  return {
    shell:rect('main.app-shell'),brandSrc:document.querySelector('.pp-acceptance-lockup')?.getAttribute('src')||'',legacyBrand:document.querySelectorAll('.pp-brand-lockup').length,
    heroWatermarkDisplay:getComputedStyle(hero,'::before').display,heroTools:document.querySelectorAll('.concept-hero .hero-tool').length,
    groups:document.querySelectorAll('.pp-game-group').length,groupHeadings:[...document.querySelectorAll('.pp-game-copy strong')].map(el=>el.textContent.trim()),legRows:document.querySelectorAll('.pp-leg-row').length,
    photos:[...document.querySelectorAll('.pp-player-photo')].map(el=>({tag:el.tagName,src:el.getAttribute('src')||'',width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})),
    probabilities:[...document.querySelectorAll('.pp-prob-label')].map(el=>el.textContent.trim()),odds:[...document.querySelectorAll('.pp-leg-odds')].map(el=>el.textContent.trim()),
    summaryOdds:document.querySelector('#combinedOdds')?.textContent?.trim(),summaryProbability:document.querySelector('#impliedProbability')?.textContent?.trim(),
    altVisible:visible('.pp-leg-alts').length,
    books:[...document.querySelectorAll('.book-card')].map(el=>({book:el.dataset.book,url:el.dataset.exactUrl,disabled:el.disabled})),
    shares:document.querySelectorAll('.share-action').length,lower:document.querySelectorAll('.secondary-panel').length,bodyWidth:document.body.scrollWidth,viewportWidth:innerWidth,
  };
});

if(before.shell.width<900||before.shell.width>1200)throw new Error(`desktop shell width drift: ${before.shell.width}`);
if(before.brandSrc!=='/parlayping-approved-lockup.svg')throw new Error(`approved header lockup missing: ${before.brandSrc}`);
if(before.legacyBrand!==0)throw new Error(`legacy header wordmark survived: ${before.legacyBrand}`);
if(before.heroWatermarkDisplay!=='none')throw new Error(`legacy hero watermark still visible: ${before.heroWatermarkDisplay}`);
if(before.heroTools!==3)throw new Error(`expected 3 clean hero actions, got ${before.heroTools}`);
if(before.groups!==2)throw new Error(`expected 2 grouped games, got ${before.groups}`);
if(before.legRows!==3)throw new Error(`expected 3 nested legs, got ${before.legRows}`);
if(!before.groupHeadings.includes('BUF @ NYJ')||!before.groupHeadings.includes('BAL @ KC'))throw new Error(`game grouping headings wrong: ${before.groupHeadings.join(', ')}`);
if(before.photos.length!==3||before.photos.some(row=>row.tag!=='IMG'||!row.src||row.width<40||row.height<40))throw new Error(`player headshots missing: ${JSON.stringify(before.photos)}`);
if(before.probabilities.length!==3||before.probabilities.some(value=>!/%|HIT|MISS|PUSH|VOID/.test(value)))throw new Error(`probability labels missing: ${before.probabilities.join(', ')}`);
if(before.odds.join('|')!=='-110|-105|-115')throw new Error(`leg odds missing: ${before.odds.join(', ')}`);
if(before.summaryOdds!=='+412'||before.summaryProbability!=='19.5%')throw new Error(`summary metrics wrong: ${before.summaryOdds} / ${before.summaryProbability}`);
if(before.altVisible!==0)throw new Error(`alt lines visible before tune: ${before.altVisible}`);
if(before.books.length!==5||before.books.some(row=>!row.url||row.disabled||!row.url.includes('/betslip/')))throw new Error(`exact sportsbook links not wired: ${JSON.stringify(before.books)}`);
if(before.shares!==4||before.lower!==2)throw new Error('share/lower sections regressed');
if(before.bodyWidth>before.viewportWidth+2)throw new Error(`desktop horizontal overflow: body ${before.bodyWidth}, viewport ${before.viewportWidth}`);

await page.screenshot({path:path.join(artifactDir,'builder-desktop-default.png'),fullPage:true});
await page.click('#tuneBtn');
await page.waitForFunction(()=>[...document.querySelectorAll('.pp-leg-alts')].some(el=>!el.hidden));
await page.waitForTimeout(120);

const after=await page.evaluate(()=>({
  active:document.querySelector('#tuneBtn')?.classList.contains('active')||false,
  expanded:document.querySelector('#tuneBtn')?.getAttribute('aria-expanded'),
  visible:[...document.querySelectorAll('.pp-leg-alts')].filter(el=>!el.hidden).length,
  lineText:[...document.querySelectorAll('.pp-alt-option span')].map(el=>el.textContent.trim()),
  oddsText:[...document.querySelectorAll('.pp-alt-option strong')].map(el=>el.textContent.trim()),
}));
if(!after.active||after.expanded!=='true'||after.visible!==3)throw new Error(`Parlay Tune did not open: ${JSON.stringify(after)}`);
if(!after.lineText.includes('Over 225.5')||!after.lineText.includes('Over 84.5'))throw new Error(`verified alternate lines missing: ${after.lineText.join(', ')}`);
if(!after.oddsText.includes('-165')||!after.oddsText.includes('+135')||!after.oddsText.includes('-150'))throw new Error(`alternate odds missing: ${after.oddsText.join(', ')}`);

await page.screenshot({path:path.join(artifactDir,'builder-desktop-tune.png'),fullPage:true});
console.log(JSON.stringify({before,after},null,2));
await browser.close();
await new Promise(resolve=>server.close(resolve));
