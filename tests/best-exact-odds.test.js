const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {renderBuilderHtml}=require('../server/api/builder-page');

function runBestExact(slip){
  const document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener:()=>{},createElement:()=>null};
  const window={__PARLAYPING_BUILDER__:{slip},location:{assign:()=>{}},open:()=>{},fetch:()=>Promise.resolve({ok:false,json:async()=>({})})};
  const context={window,document,navigator:{userAgent:'Mozilla/5.0',maxTouchPoints:0},URL,setTimeout,console};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(process.cwd(),'builder-sportsbook-open-final.js'),'utf8'),context,{filename:'builder-sportsbook-open-final.js'});
  vm.runInContext(fs.readFileSync(path.join(process.cwd(),'builder-best-exact-odds.js'),'utf8'),context,{filename:'builder-best-exact-odds.js'});
  return window.__PP_BEST_EXACT_TEST__;
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('Best Exact Odds picks the highest verified American price for each exact leg',()=>{
  const slip={legs:[{
    sportsbook:'FanDuel',oddsAmerican:-110,
    bookOffers:{FanDuel:{oddsAmerican:-110},DraftKings:{oddsAmerican:-105},Caesars:{oddsAmerican:105},BetMGM:{oddsAmerican:120}}
  }]};
  const api=runBestExact(slip);
  assert.deepEqual(plain(api.bestOffersForLeg(slip.legs[0])),[{book:'BetMGM',price:120}]);
});

test('full-slip coverage requires a verified exact price on every leg',()=>{
  const slip={legs:[
    {bookOffers:{FanDuel:{oddsAmerican:-110},DraftKings:{oddsAmerican:-105},Caesars:{oddsAmerican:105},BetMGM:{oddsAmerican:130}}},
    {bookOffers:{FanDuel:{oddsAmerican:120},DraftKings:{oddsAmerican:125},Caesars:{oddsAmerican:110}}}
  ]};
  const api=runBestExact(slip);
  assert.deepEqual([...api.fullCoverageBooks()].sort(),['Caesars','DraftKings','FanDuel']);
  assert.equal(api.fullCoverageBooks().includes('BetMGM'),false);
  assert.equal(api.bestOffersForLeg(slip.legs[0])[0].book,'BetMGM');
  assert.equal(api.bestOffersForLeg(slip.legs[1])[0].book,'DraftKings');
});

test('full-slip books are ordered by transparent per-leg best-price count',()=>{
  const slip={legs:[
    {bookOffers:{FanDuel:{oddsAmerican:-105},DraftKings:{oddsAmerican:-110},Caesars:{oddsAmerican:-115}}},
    {bookOffers:{FanDuel:{oddsAmerican:115},DraftKings:{oddsAmerican:125},Caesars:{oddsAmerican:110}}},
    {bookOffers:{FanDuel:{oddsAmerican:100},DraftKings:{oddsAmerican:100},Caesars:{oddsAmerican:105}}},
    {bookOffers:{FanDuel:{oddsAmerican:-108},DraftKings:{oddsAmerican:-110},Caesars:{oddsAmerican:-112}}}
  ]};
  const api=runBestExact(slip);
  assert.deepEqual(plain(api.rankedFullCoverageBooks()),['FanDuel','Caesars','DraftKings']);
  assert.deepEqual(plain(api.summaryForSlip().fullCoverageBooks),[
    {book:'FanDuel',bestLegs:2},
    {book:'Caesars',bestLegs:1},
    {book:'DraftKings',bestLegs:1}
  ]);
});

test('full-slip comparison counts best exact legs without fabricating combined parlay odds',()=>{
  const slip={legs:[
    {bookOffers:{FanDuel:{oddsAmerican:-105},DraftKings:{oddsAmerican:-110}}},
    {bookOffers:{FanDuel:{oddsAmerican:115},DraftKings:{oddsAmerican:125}}},
    {bookOffers:{FanDuel:{oddsAmerican:100},DraftKings:{oddsAmerican:100}}}
  ]};
  const api=runBestExact(slip);
  assert.equal(api.bestLegCount('FanDuel'),2);
  assert.equal(api.bestLegCount('DraftKings'),2);
  assert.deepEqual(plain(api.rankedFullCoverageBooks()),['DraftKings','FanDuel']);
  const source=fs.readFileSync(path.join(process.cwd(),'builder-best-exact-odds.js'),'utf8');
  assert.match(source,/does not infer a combined parlay price/);
  assert.match(source,/ordered by how many legs they tie for the best verified price/);
  assert.doesNotMatch(source,/combinedOdds|impliedProbability/);
});

test('Exact Slip Coverage Matrix shows every discovered book, preserves missing cells, and ranks full coverage first',()=>{
  const slip={legs:[
    {player:'Player One',market:'receivingYards',side:'over',threshold:50,inclusive:true,bookOffers:{FanDuel:{oddsAmerican:-105},DraftKings:{oddsAmerican:-110},Caesars:{oddsAmerican:115},BetMGM:{oddsAmerican:120}}},
    {player:'Player Two',market:'receptions',side:'over',threshold:4,inclusive:true,bookOffers:{FanDuel:{oddsAmerican:110},DraftKings:{oddsAmerican:125},Caesars:{oddsAmerican:115}}},
    {player:'Player Three',market:'atd',bookOffers:{FanDuel:{oddsAmerican:160},DraftKings:{oddsAmerican:155}}}
  ]};
  const api=runBestExact(slip);
  const matrix=plain(api.coverageMatrixForSlip());
  assert.deepEqual(matrix.rows.map(row=>row.book),['DraftKings','FanDuel','Caesars','BetMGM']);
  assert.deepEqual(matrix.rows.map(row=>({book:row.book,covered:row.covered,total:row.total,full:row.full})),[
    {book:'DraftKings',covered:3,total:3,full:true},
    {book:'FanDuel',covered:3,total:3,full:true},
    {book:'Caesars',covered:2,total:3,full:false},
    {book:'BetMGM',covered:1,total:3,full:false}
  ]);
  assert.equal(matrix.rows.find(row=>row.book==='Caesars').cells[2].price,null);
  assert.equal(matrix.rows.find(row=>row.book==='BetMGM').cells[0].best,true);
  assert.equal(matrix.rows.find(row=>row.book==='DraftKings').cells[1].best,true);
  assert.match(matrix.legs[0].detail,/Player One/);
});

test('Builder loads Best Exact Odds after the verified sportsbook runtime',()=>{
  const html=renderBuilderHtml({slip:{legs:[]},token:'test-token',liveDataAvailable:false});
  const sportsbookIndex=html.indexOf('/builder-sportsbook-open-final.js?v=20260929a');
  const bestIndex=html.indexOf('/builder-best-exact-odds.js?v=20260930b');
  assert.ok(sportsbookIndex>=0);
  assert.ok(bestIndex>sportsbookIndex);
  assert.match(html,/builder-best-exact-odds\.css\?v=20260930a/);
});
