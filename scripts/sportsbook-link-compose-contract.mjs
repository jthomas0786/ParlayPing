import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('builder-sportsbook-links-prep.js','utf8');
const slip={
  sportsbookLinks:{bet365:'https://sportsbook.example/betslip/bet365-exact'},
  legs:[1,2,3].map(index=>({
    id:`leg-${index}`,
    sportsbook:'DraftKings',
    bookOffers:{
      DraftKings:{selectionLink:`https://sportsbook.draftkings.com/?outcomes=0OU${index}574188${index}O${index}00_1`},
      FanDuel:{selectionLink:`https://sportsbook.fanduel.com/addToBetslip?marketId=42.50000000${index}&selectionId=7000000${index}`},
      Caesars:{selectionLink:`https://caesars.example/selection/${index}`},
    },
  })),
};
const context={window:{__PARLAYPING_BUILDER__:{slip}},URL,console,Set,Map,Object,String,Array,encodeURIComponent};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(source,context,{filename:'builder-sportsbook-links-prep.js'});

const links=context.window.__PARLAYPING_BUILDER__.slip.sportsbookLinks;
assert.equal(links.bet365,'https://sportsbook.example/betslip/bet365-exact');
assert.match(links.FanDuel,/^https:\/\/account\.sportsbook\.fanduel\.com\/sportsbook\/addToBetslip\?/);
for(let i=0;i<3;i++){
  assert.ok(links.FanDuel.includes(`marketId%5B${i}%5D=42.50000000${i+1}`),`FanDuel market ${i} missing`);
  assert.ok(links.FanDuel.includes(`selectionId%5B${i}%5D=7000000${i+1}`),`FanDuel selection ${i} missing`);
}
assert.equal(links.DraftKings,'https://sportsbook.draftkings.com/?outcomes=0OU15741881O100_1+0OU25741882O200_1+0OU35741883O300_1');
assert.equal(links.Caesars,undefined,'Caesars single-selection links must not masquerade as one exact parlay link');
console.log(JSON.stringify(links,null,2));
console.log('Sportsbook exact-link composition contract passed.');
