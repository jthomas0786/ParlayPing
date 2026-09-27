import fs from 'node:fs';

function patch(path, oldText, newText) {
  const source=fs.readFileSync(path,'utf8');
  if(source.includes(newText)) return;
  if(!source.includes(oldText)) throw new Error(`Expected block not found in ${path}`);
  fs.writeFileSync(path,source.replace(oldText,newText));
}

patch('server/api/builder-page.js',
`const { enrichSportsbookMarkets } = require('./lib/sportsbook-enrich-inclusive');`,
`const { enrichSportsbookMarkets } = require('./lib/sportsbook-enrich-inclusive');
const { enrichMissingExactSportsbooks } = require('./lib/exact-sportsbook-enrich');`
);

patch('server/api/builder-page.js',
`    const sportsbookSlip = await enrichSportsbookMarkets(hydrated.slip);
    const html = renderBuilderHtml({ slip: sportsbookSlip, token, liveDataAvailable: hydrated.liveDataAvailable });`,
`    const pricedSlip = await enrichSportsbookMarkets(hydrated.slip);
    // If the snapshot is missing even one FanDuel milestone/alternate price,
    // verify the whole slip against the exact FanDuel resolver before render.
    // This keeps partial provider coverage from hiding a bet FanDuel actually offers.
    const sportsbookSlip = await enrichMissingExactSportsbooks(pricedSlip, { books:['FanDuel'] });
    const html = renderBuilderHtml({ slip: sportsbookSlip, token, liveDataAvailable: hydrated.liveDataAvailable });`
);

patch('server/api/builder-page.js',
  '/builder-sportsbook-open-final.js?v=20260927d',
  '/builder-sportsbook-open-final.js?v=20260927e'
);

patch('builder-sportsbook-open-final.js',
`      const selectionLink=safeHttps(selection.selectionLink);
      leg.bookOffers=leg.bookOffers&&typeof leg.bookOffers==='object'?leg.bookOffers:{};
      const existing=entryForBook(leg.bookOffers,book)||{};
      leg.bookOffers[book]={...existing,...(selectionLink?{selectionLink}:{}),...(selection.selectionId?{selectionId:String(selection.selectionId)}:{}),...(selection.marketId?{marketId:String(selection.marketId)}:{})};`,
`      const selectionLink=safeHttps(selection.selectionLink);
      const selectionPrice=finiteOdds(selection.price);
      leg.bookOffers=leg.bookOffers&&typeof leg.bookOffers==='object'?leg.bookOffers:{};
      const existing=entryForBook(leg.bookOffers,book)||{};
      leg.bookOffers[book]={...existing,...(selectionPrice!=null?{oddsAmerican:selectionPrice}:{}),...(selectionLink?{selectionLink}:{}),...(selection.selectionId?{selectionId:String(selection.selectionId)}:{}),...(selection.marketId?{marketId:String(selection.marketId)}:{}),...(selection.marketKey?{marketKey:String(selection.marketKey)}:{}),...(selection.line!=null?{matchedLine:Number(selection.line)}:{})};`
);

const openTest='tests/sportsbook-open-final.test.js';
let openTests=fs.readFileSync(openTest,'utf8');
if(!openTests.includes('resolved sportsbook selections hydrate their exact prices')){
  openTests+=`\n\ntest('resolved sportsbook selections hydrate their exact prices',()=>{\n  const slip={legs:[{id:'rice',bookOffers:{}}]};\n  const api=runOpenFinal(slip);\n  const url='https://account.sportsbook.fanduel.com/sportsbook/addToBetslip?marketId%5B0%5D=42&selectionId%5B0%5D=99';\n  api.applyResolvedSelections('FanDuel',{url,selections:[{price:-340,line:29.5,marketKey:'player_reception_yds_alternate',marketId:'42',selectionId:'99',selectionLink:'https://sportsbook.fanduel.com/addToBetslip?marketId=42&selectionId=99'}]});\n  assert.equal(slip.legs[0].bookOffers.FanDuel.oddsAmerican,-340);\n  assert.equal(slip.legs[0].bookOffers.FanDuel.matchedLine,29.5);\n  assert.equal(slip.legs[0].bookOffers.FanDuel.marketKey,'player_reception_yds_alternate');\n});\n`;
  fs.writeFileSync(openTest,openTests);
}

const exactTest=`const test=require('node:test');
const assert=require('node:assert/strict');
const {hasFullBookPricing,applyExactResolution,enrichMissingExactSportsbooks}=require('../server/api/lib/exact-sportsbook-enrich');

test('exact FanDuel fallback fills every missing price and full betslip link',async()=>{
  const slip={legs:[
    {id:'mahomes',bookOffers:{FanDuel:{oddsAmerican:-154}}},
    {id:'rice',bookOffers:{Bovada:{oddsAmerican:-400}}}
  ]};
  let calls=0;
  const out=await enrichMissingExactSportsbooks(slip,{books:['FanDuel'],log:false,resolve:async({book,legs})=>{
    calls++;
    assert.equal(book,'FanDuel');
    assert.equal(legs.length,2);
    return {exact:true,url:'https://account.sportsbook.fanduel.com/sportsbook/addToBetslip?marketId%5B0%5D=1&selectionId%5B0%5D=11&marketId%5B1%5D=2&selectionId%5B1%5D=22',selections:[
      {price:-154,line:224.5,marketKey:'player_pass_yds_alternate',marketId:'1',selectionId:'11',selectionLink:'https://sportsbook.fanduel.com/addToBetslip?marketId=1&selectionId=11'},
      {price:-340,line:29.5,marketKey:'player_reception_yds_alternate',marketId:'2',selectionId:'22',selectionLink:'https://sportsbook.fanduel.com/addToBetslip?marketId=2&selectionId=22'}
    ]};
  }});
  assert.equal(calls,1);
  assert.equal(hasFullBookPricing(out,'FanDuel'),true);
  assert.equal(out.legs[1].bookOffers.FanDuel.oddsAmerican,-340);
  assert.equal(out.legs[1].bookOffers.FanDuel.matchedLine,29.5);
  assert.match(out.sportsbookLinks.FanDuel,/account\\.sportsbook\\.fanduel\\.com/);
});

test('complete FanDuel snapshot coverage does not spend a resolver request',async()=>{
  const slip={legs:[
    {bookOffers:{FanDuel:{oddsAmerican:-150}}},
    {bookOffers:{FanDuel:{oddsAmerican:-200}}}
  ]};
  let calls=0;
  const out=await enrichMissingExactSportsbooks(slip,{books:['FanDuel'],log:false,resolve:async()=>{calls++;return null;}});
  assert.equal(calls,0);
  assert.equal(out,slip);
});

test('incomplete or failed exact resolution never fabricates FanDuel coverage',async()=>{
  const slip={legs:[{bookOffers:{}},{bookOffers:{}}]};
  const result={exact:false,url:null,selections:[{price:-110},null]};
  assert.equal(applyExactResolution(slip,'FanDuel',result),slip);
  const out=await enrichMissingExactSportsbooks(slip,{books:['FanDuel'],log:false,resolve:async()=>result});
  assert.equal(out,slip);
  assert.equal(hasFullBookPricing(out,'FanDuel'),false);
});
`;
if(!fs.existsSync('tests/exact-sportsbook-enrich.test.js')) fs.writeFileSync('tests/exact-sportsbook-enrich.test.js',exactTest);

console.log('FanDuel preload fallback patch applied.');
