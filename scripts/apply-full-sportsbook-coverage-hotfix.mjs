import fs from 'node:fs';

function patch(path, oldText, newText) {
  const source=fs.readFileSync(path,'utf8');
  if(source.includes(newText)) return;
  if(!source.includes(oldText)) throw new Error(`Expected block not found in ${path}`);
  fs.writeFileSync(path,source.replace(oldText,newText));
}

patch('builder-sportsbook-open-final.js',
`  function pricedSportsbooks(){
    const books=new Set(Object.keys(exactSportsbookLinks()));
    for(const leg of legs){
      for(const [raw,offer] of Object.entries(leg?.bookOffers||{})){
        if(finiteOdds(offer?.oddsAmerican)!=null){const book=sportsbookName(raw);if(book)books.add(book);}
      }
      if(finiteOdds(leg?.oddsAmerican)!=null){const book=sportsbookName(leg?.sportsbook);if(book)books.add(book);}
    }
    return [...books];
  }`,
`  function pricedSportsbooks(){
    const exactLinks=exactSportsbookLinks();
    const candidates=new Set(Object.keys(exactLinks).map(sportsbookName).filter(Boolean));
    for(const leg of legs){
      for(const [raw,offer] of Object.entries(leg?.bookOffers||{})){
        if(finiteOdds(offer?.oddsAmerican)!=null){const book=sportsbookName(raw);if(book)candidates.add(book);}
      }
      if(finiteOdds(leg?.oddsAmerican)!=null){const book=sportsbookName(leg?.sportsbook);if(book)candidates.add(book);}
    }
    const books=[];
    for(const book of candidates){
      if(exactLinks[book]){books.push(book);continue;}
      if(legs.length&&legs.every(leg=>legOddsForBook(leg,book)!=null))books.push(book);
    }
    return books;
  }`
);

patch('server/api/builder-page.js',
  '<script src="/builder-sportsbook-open-final.js?v=20260927c"></script>',
  '<script src="/builder-sportsbook-open-final.js?v=20260927d"></script>'
);

const testPath='tests/sportsbook-open-final.test.js';
let tests=fs.readFileSync(testPath,'utf8');
if(!tests.includes('partial sportsbook coverage is excluded from the parlay sportsbook section')){
  tests+=`\n\ntest('partial sportsbook coverage is excluded from the parlay sportsbook section',()=>{\n  const slip={legs:[\n    {id:'one',bookOffers:{Bovada:{oddsAmerican:-475},FanDuel:{oddsAmerican:-500}}},\n    {id:'two',bookOffers:{FanDuel:{oddsAmerican:-300}}},\n    {id:'three',bookOffers:{FanDuel:{oddsAmerican:-250}}}\n  ]};\n  const api=runOpenFinal(slip);\n  assert.deepEqual([...api.orderedBooks()],['FanDuel']);\n  assert.equal(api.legOddsForBook(slip.legs[0],'Bovada'),-475);\n  assert.equal(api.legOddsForBook(slip.legs[1],'Bovada'),null);\n});\n`;
  fs.writeFileSync(testPath,tests);
}

console.log('Full sportsbook coverage hotfix applied.');
