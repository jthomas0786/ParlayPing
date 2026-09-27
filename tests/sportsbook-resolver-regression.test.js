const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {finalizeResolution}=require('../server/api/sportsbook-link');
const {applyExactResolution}=require('../server/api/lib/exact-sportsbook-enrich');
const {renderBuilderHtml}=require('../server/api/builder-page');

function runOpenFinal(slip){
  const document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener:()=>{}};
  const window={__PARLAYPING_BUILDER__:{slip},location:{assign:()=>{}},open:()=>{},fetch:()=>Promise.resolve({ok:false,json:async()=>({})})};
  const context={window,document,navigator:{userAgent:'Mozilla/5.0',maxTouchPoints:0},URL,setTimeout,console};
  vm.createContext(context);
  const source=fs.readFileSync(path.join(__dirname,'..','builder-sportsbook-open-final.js'),'utf8');
  vm.runInContext(source,context,{filename:'builder-sportsbook-open-final.js'});
  return window.__PP_SPORTSBOOK_OPEN_TEST__;
}

test('whole-number plus threshold resolves only to its exact half-line equivalent',()=>{
  const legs=[{sport:'NFL',player:'Patrick Mahomes',market:'passYds',side:'over',line:225,inclusive:true}];
  const raw={exact:false,url:null,selections:[{price:-154,line:224.5,marketKey:'player_pass_yds_alternate'}]};
  const resolved=finalizeResolution(legs,raw);
  assert.equal(resolved.exact,true);
  assert.equal(resolved.selections[0].line,224.5);
  assert.equal(resolved.url,null);
});

test('nearby half-line is rejected when the original threshold is not inclusive',()=>{
  const legs=[{sport:'NFL',player:'Patrick Mahomes',market:'passYds',side:'over',line:225,inclusive:false}];
  const raw={exact:true,url:'https://example.com/not-used',selections:[{price:-154,line:224.5}]};
  const resolved=finalizeResolution(legs,raw);
  assert.equal(resolved.exact,false);
  assert.equal(resolved.selections[0],null);
  assert.equal(resolved.url,null);
});

test('FanDuel appears in Builder after full exact resolution even when snapshot had no FanDuel offers',()=>{
  const slip={legs:[
    {id:'mahomes',sport:'NFL',player:'Patrick Mahomes',market:'passYds',side:'over',line:225,inclusive:true,bookOffers:{}},
    {id:'rice',sport:'NFL',player:'Rashee Rice',market:'recYds',side:'over',line:30,inclusive:true,bookOffers:{}}
  ]};
  const before=runOpenFinal(slip);
  assert.deepEqual([...before.orderedBooks()],[]);

  const enriched=applyExactResolution(slip,'FanDuel',{exact:false,url:null,selections:[
    {price:-154,line:224.5,marketKey:'player_pass_yds_alternate'},
    {price:-340,line:29.5,marketKey:'player_reception_yds_alternate'}
  ]});
  const after=runOpenFinal(enriched);
  assert.deepEqual([...after.orderedBooks()],['FanDuel']);
  assert.equal(after.legOddsForBook(enriched.legs[0],'FanDuel'),-154);
  assert.equal(after.legOddsForBook(enriched.legs[1],'FanDuel'),-340);
  assert.equal(after.openTarget('FanDuel').url,'https://sportsbook.fanduel.com/');
  assert.equal(after.openTarget('FanDuel').exact,false);
});

test('verified provider IDs preserve the exact FanDuel prefilled target',()=>{
  const slip={legs:[{sport:'NFL',player:'Rashee Rice',market:'recYds',side:'over',line:30,inclusive:true,bookOffers:{}}]};
  const url='https://account.sportsbook.fanduel.com/sportsbook/addToBetslip?marketId%5B0%5D=42&selectionId%5B0%5D=99';
  const enriched=applyExactResolution(slip,'FanDuel',{exact:true,url,selections:[{
    price:-340,line:29.5,marketId:'42',selectionId:'99',selectionLink:'https://sportsbook.fanduel.com/addToBetslip?marketId=42&selectionId=99'
  }]});
  const api=runOpenFinal(enriched);
  assert.equal(api.openTarget('FanDuel').exact,true);
  assert.equal(api.openTarget('FanDuel').url,url);
});

test('non-sportsbook source brands stay hidden and missing odds never become zero',()=>{
  const slip={sportsbook:'Playbook',source:'Playbook',legs:[{sportsbook:'Playbook',oddsAmerican:null,bookOffers:{}}]};
  const api=runOpenFinal(slip);
  assert.deepEqual([...api.orderedBooks()],[]);
  assert.equal(api.sportsbookName('Playbook'),null);
  assert.equal(api.fmtOdds(null),'—');
  assert.equal(api.finiteOdds(0),null);
});

test('Builder HTML no longer loads the partial-coverage override runtime',()=>{
  const html=renderBuilderHtml({slip:{legs:[]},token:'test-token',liveDataAvailable:false});
  assert.doesNotMatch(html,/builder-sportsbook-partial-coverage\.js/);
  assert.match(html,/builder-sportsbook-open-final\.js\?v=20260927f/);
});
