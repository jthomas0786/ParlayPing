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
  sportsbook:'DraftKings',combinedOddsAmerican:-110,combinedOddsVerified:true,
  sportsbookLinks:{DraftKings:'https://sportsbook.example/dk',FanDuel:'https://sportsbook.example/fd'},
  legs:[{
    id:'runtime-leg',sport:'NFL',player:'Josh Allen',team:'BUF',gameId:'buf-nyj',matchup:'BUF @ NYJ',market:'passing yards',displayMarket:'Over 249.5 Passing Yards',side:'over',line:249.5,
    sportsbook:'DraftKings',oddsAmerican:-110,bookOffers:{DraftKings:{oddsAmerican:-110},FanDuel:{oddsAmerican:-102}},pregameProbability:.61,status:'PENDING',
    altLinesByBook:{DraftKings:[{line:249.5,oddsAmerican:-110,probability:.61,side:'over'}],FanDuel:[{line:249.5,oddsAmerican:-102,probability:.60,side:'over'}]}
  }]
};
const fixture=renderBuilderHtml({slip,token:'s1.runtime.smoke',liveDataAvailable:true});
const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.html':'text/html'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4174');
  if(url.pathname==='/fixture'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(fixture);return;}
  const file=path.join(root,url.pathname.replace(/^\//,''));
  if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end('not found');return;}
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(4174,'127.0.0.1',resolve));

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const pageErrors=[];
const failedRequests=[];
const finalResponses=[];
page.on('pageerror',error=>pageErrors.push(error.message));
page.on('requestfailed',request=>failedRequests.push(`${request.url()} :: ${request.failure()?.errorText||'failed'}`));
page.on('response',response=>{if(response.url().includes('builder-sportsbook-open-final.js'))finalResponses.push({url:response.url(),status:response.status(),contentType:response.headers()['content-type']||''});});
await page.goto('http://127.0.0.1:4174/fixture',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>document.documentElement.dataset.ppAcceptance==='ready',{timeout:5000});
await page.waitForTimeout(250);
const state=await page.evaluate(()=>({
  runtimeLoaded:Boolean(window.__PP_SPORTSBOOK_OPEN_TEST__),
  scriptSrc:[...document.scripts].map(script=>script.src).find(src=>src.includes('builder-sportsbook-open-final.js'))||null,
  cards:[...document.querySelectorAll('.book-card')].map(el=>({book:el.dataset.book,detail:el.querySelector('small')?.textContent?.trim()||''})),
  openText:document.querySelector('#openBookBtn')?.textContent?.replace(/\s+/g,' ').trim()||''
}));
console.log(JSON.stringify({state,pageErrors,failedRequests,finalResponses},null,2));
await browser.close();
await new Promise(resolve=>server.close(resolve));
if(pageErrors.length)throw new Error(`Builder page errors: ${pageErrors.join(' | ')}`);
if(failedRequests.some(value=>value.includes('builder-sportsbook-open-final.js')))throw new Error(`Final sportsbook runtime request failed: ${failedRequests.join(' | ')}`);
if(!finalResponses.some(row=>row.status===200))throw new Error(`Final sportsbook runtime was not served successfully: ${JSON.stringify(finalResponses)}`);
if(!state.runtimeLoaded)throw new Error(`Final sportsbook runtime did not initialize. Script: ${state.scriptSrc||'missing'}`);
if(!state.cards.some(row=>row.book==='FanDuel'))throw new Error('FanDuel sportsbook card is missing after final runtime initialization.');
