const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function runOpenFinal(slip,{userAgent='Mozilla/5.0'}={}){
  const document={querySelector:()=>null,querySelectorAll:()=>[],addEventListener:()=>{}};
  const window={__PARLAYPING_BUILDER__:{slip},location:{assign:()=>{}},open:()=>{}};
  const context={window,document,navigator:{userAgent,maxTouchPoints:0},URL,setTimeout,console};
  vm.createContext(context);
  const source=fs.readFileSync(path.join(__dirname,'..','builder-sportsbook-open-final.js'),'utf8');
  vm.runInContext(source,context,{filename:'builder-sportsbook-open-final.js'});
  return window.__PP_SPORTSBOOK_OPEN_TEST__;
}

function runLinkPrep(slip){
  const window={__PARLAYPING_BUILDER__:{slip}};
  const context={window,URL,console};
  vm.createContext(context);
  const source=fs.readFileSync(path.join(__dirname,'..','builder-sportsbook-links-prep.js'),'utf8');
  vm.runInContext(source,context,{filename:'builder-sportsbook-links-prep.js'});
  return {slip,testApi:window.__PP_SPORTSBOOK_LINK_TEST__};
}

test('FanDuel stays openable with verified prices even when exact betslip metadata is absent',()=>{
  const slip={legs:[{id:'gray',sportsbook:'FanDuel',oddsAmerican:-295,bookOffers:{FanDuel:{oddsAmerican:-295,selectionLink:null,selectionId:null}}}]};
  const api=runOpenFinal(slip);
  assert.deepEqual([...api.orderedBooks()],['FanDuel']);
  const target=api.openTarget('FanDuel');
  assert.equal(target.exact,false);
  assert.equal(target.url,'https://sportsbook.fanduel.com/');
  assert.equal(api.legOddsForBook(slip.legs[0],'FanDuel'),-295);
});

test('verified exact FanDuel betslip link always wins over generic fallback',()=>{
  const exact='https://account.sportsbook.fanduel.com/sportsbook/addToBetslip?marketId%5B0%5D=42.1&selectionId%5B0%5D=11';
  const slip={sportsbookLinks:{FanDuel:exact},legs:[{bookOffers:{FanDuel:{oddsAmerican:-110}}}]};
  const api=runOpenFinal(slip);
  const target=api.openTarget('FanDuel');
  assert.equal(target.exact,true);
  assert.equal(target.url,exact);
});

test('FanDuel prefilled parlay is composed only when every leg supplies real market and selection IDs in its link',()=>{
  const slip={legs:[
    {bookOffers:{FanDuel:{selectionLink:'https://sportsbook.fanduel.com/addToBetslip?marketId=42.100&selectionId=111'}}},
    {bookOffers:{FanDuel:{selectionLink:'https://sportsbook.fanduel.com/addToBetslip?marketId=42.200&selectionId=222'}}}
  ]};
  runLinkPrep(slip);
  const url=new URL(slip.sportsbookLinks.FanDuel);
  assert.equal(url.hostname,'account.sportsbook.fanduel.com');
  assert.equal(url.searchParams.get('marketId[0]'),'42.100');
  assert.equal(url.searchParams.get('selectionId[0]'),'111');
  assert.equal(url.searchParams.get('marketId[1]'),'42.200');
  assert.equal(url.searchParams.get('selectionId[1]'),'222');
});

test('FanDuel prefilled parlay is not fabricated when any leg is missing exact selection metadata',()=>{
  const slip={legs:[
    {bookOffers:{FanDuel:{selectionLink:'https://sportsbook.fanduel.com/addToBetslip?marketId=42.100&selectionId=111'}}},
    {bookOffers:{FanDuel:{oddsAmerican:-110,selectionLink:null,selectionId:null}}}
  ]};
  runLinkPrep(slip);
  assert.equal(slip.sportsbookLinks.FanDuel,undefined);
});

test('iPhone runtime is detected for direct app-friendly navigation',()=>{
  const api=runOpenFinal({legs:[]},{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)'});
  assert.equal(api.mobileLike(),true);
});
