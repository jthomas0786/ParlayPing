const test=require('node:test');
const assert=require('node:assert/strict');
const {preserveDisplayProbabilities}=require('../api/lib/share-hydrate');
const {parseMlbPublicSlate}=require('../api/lib/sportsbook-enrich');
const {renderShareSvg}=require('../api/lib/share-renderer');
const shareCard=require('../api/share-card');
const builderPage=require('../api/builder-page');

test('live MLB model probability survives hydration as a pregame fallback',()=>{
  const slip={legs:[{id:'mlb-1',sport:'MLB',player:'Riley Greene',market:'homeRun',status:'LIVE',pregameProbability:null,liveProbability:null}]};
  const analysis={results:[{id:'mlb-1',sport:'MLB',player:'Riley Greene',market:'homeRun',status:'LIVE',probability:0.151,probabilityMethod:'sports-outpost-mlb-model-10000-sim'}]};
  const out=preserveDisplayProbabilities(slip,analysis);
  assert.equal(out.legs[0].pregameProbability,0.151);
  assert.equal(out.legs[0].liveProbability,null);
  assert.equal(out.legs[0].probabilitySource,'sports-outpost-mlb-model-10000-sim');
});

test('explicit live probability stays live rather than being relabeled pregame',()=>{
  const slip={legs:[{id:'mlb-1',sport:'MLB',player:'Riley Greene',market:'homeRun',status:'LIVE',pregameProbability:null,liveProbability:null}]};
  const analysis={results:[{id:'mlb-1',sport:'MLB',status:'LIVE',probability:0.22,probabilitySource:'live-rest-of-game-model'}]};
  const out=preserveDisplayProbabilities(slip,analysis);
  assert.equal(out.legs[0].liveProbability,0.22);
  assert.equal(out.legs[0].pregameProbability,null);
});

test('MLB public slate hydrates HR odds and exact selection links for builder composition',()=>{
  const doc={sport:'mlb',games:[{gamePk:824223,startTimeUTC:'2026-09-23T17:10:00Z',away:{name:'Washington Nationals',abbr:'WSH',lineup:[]},home:{name:'Detroit Tigers',abbr:'DET',lineup:[{id:682985,name:'Riley Greene',odds:{hr:{line:0.5,best:{book:'fanduel',bookTitle:'FanDuel',price:520,link:'https://sportsbook.fanduel.com/addToBetslip?marketId=111&selectionId=222'},all:[{book:'fanduel',bookTitle:'FanDuel',price:520,link:'https://sportsbook.fanduel.com/addToBetslip?marketId=111&selectionId=222'},{book:'draftkings',bookTitle:'DraftKings',price:500,link:'https://sportsbook.draftkings.com/?outcomes=333'}]}}}]}}]};
  const parsed=parseMlbPublicSlate(doc,{sport:'MLB',player:'Riley Greene',team:'DET',gameId:'824223',market:'homeRun',side:'yes',line:null});
  assert.ok(parsed);
  assert.equal(parsed.preferred.oddsAmerican,520);
  assert.equal(parsed.preferred.sportsbook,'FanDuel');
  assert.equal(parsed.bookOffers.FanDuel.oddsAmerican,520);
  assert.match(parsed.bookOffers.FanDuel.selectionLink,/marketId=111/);
  assert.equal(parsed.bookOffers.DraftKings.oddsAmerican,500);
  assert.match(parsed.bookOffers.DraftKings.selectionLink,/outcomes=333/);
  assert.equal(parsed.altLinesByBook.FanDuel[0].line,0.5);
});

test('share card renderer shows MLB headshot, odds and live pregame probability fallback',()=>{
  const svg=renderShareSvg({context:'x_reply',slip:{legs:[{id:'mlb-1',sport:'MLB',player:'Riley Greene',market:'homeRun',displayMarket:'HR',status:'LIVE',playerImageUrl:'https://img.mlbstatic.com/mlb-photos/image/upload/v1/people/682985/headshot/silo/current',teamLogoUrl:'https://a.espncdn.com/i/teamlogos/mlb/500/det.png',oddsAmerican:520,pregameProbability:0.151,current:0,target:1,progressText:'0 / 1'}]}});
  assert.match(svg,/img\.mlbstatic\.com/);
  assert.match(svg,/\+520/);
  assert.match(svg,/PG 15\.1%/);
  assert.doesNotMatch(svg,/>RG<\/text>/);
});

test('share-card image fetch no longer advertises AVIF to MLB CDN',async t=>{
  const original=global.fetch;
  let accept='';
  global.fetch=async(_url,options={})=>{accept=String(options?.headers?.accept||'');return {ok:true,headers:{get:key=>String(key).toLowerCase()==='content-type'?'image/png':null},arrayBuffer:async()=>Buffer.from('png-test')};};
  t.after(()=>{global.fetch=original;});
  const uri=await shareCard.imageDataUri('https://img.mlbstatic.com/mlb-photos/image/upload/v1/people/999999/headshot/silo/current');
  assert.doesNotMatch(accept,/avif/i);
  assert.match(uri,/^data:image\/png;base64,/);
});

test('builder HTML installs sportsbook composition before summary odds hotfix',()=>{
  const html=builderPage.renderBuilderHtml({slip:{source:'ParlayPing',legs:[{sport:'MLB',player:'Riley Greene',market:'homeRun'}]},token:'test-token',liveDataAvailable:true});
  const prep=html.indexOf('/builder-sportsbook-links-prep.js');
  const summary=html.indexOf('/builder-summary-odds-hotfix.js');
  assert.ok(prep>=0);
  assert.ok(summary>prep);
});
