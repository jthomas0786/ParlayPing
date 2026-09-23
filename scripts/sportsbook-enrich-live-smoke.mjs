import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {loadSnapshot,enrichSportsbookMarkets}=require('../server/api/lib/sportsbook-enrich');

const doc=await loadSnapshot('NFL');
assert.ok(doc&&Array.isArray(doc.games)&&doc.games.length,'Live Sports Outpost NFL odds snapshot is unavailable.');
let fixture=null;
for(const game of doc.games){
  for(const player of game.players||[]){
    for(const [market,slot] of Object.entries(player.odds||{})){
      const source=Array.isArray(slot?.alternates)&&slot.alternates.length?slot.alternates:(slot?.line!=null?[{line:slot.line,over:slot.over,under:slot.under}]:[]);
      const row=source.find(item=>item?.over?.best?.book&&Number.isFinite(Number(item?.over?.best?.price)));
      if(!row)continue;
      fixture={game,player,market,line:Number(row.line)};
      break;
    }
    if(fixture)break;
  }
  if(fixture)break;
}
assert.ok(fixture,'No sportsbook-specific NFL prop with a priced line was found in the live snapshot.');
const {game,player,market,line}=fixture;
const slip={legs:[{
  id:'live-enrich-smoke',sport:'NFL',player:player.name,team:player.team||null,
  gameId:game.fixtureId||game.gameId||null,matchup:`${game.away} @ ${game.home}`,
  market,line,side:'over',startTimeUTC:game.startDateUTC||null,
}]};
const enriched=await enrichSportsbookMarkets(slip);
const leg=enriched.legs[0];
assert.ok(leg.altLinesByBook&&Object.keys(leg.altLinesByBook).length,`No sportsbook-specific alt lines enriched for ${player.name} ${market}.`);
const pricedBooks=Object.entries(leg.altLinesByBook).filter(([,rows])=>Array.isArray(rows)&&rows.some(row=>Number.isFinite(Number(row.oddsAmerican))));
assert.ok(pricedBooks.length,`Enriched alt lines for ${player.name} do not contain sportsbook odds.`);
for(const [book,rows] of pricedBooks){
  assert.ok(rows.every(row=>row.sportsbook===book||!row.sportsbook),`Book contamination detected in ${book} alt lines.`);
}
console.log(JSON.stringify({player:player.name,market,line,books:pricedBooks.map(([book,rows])=>({book,lines:rows.length}))},null,2));
console.log('Live sportsbook enrichment smoke test passed.');
