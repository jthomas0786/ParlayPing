import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const {enrichShareAssets}=require('../server/api/lib/share-assets');

const slip={legs:[{
  id:'wilson-reb',
  sport:'WNBA',
  player:"A'ja Wilson",
  team:'LVA',
  gameId:'21f2c8f7d3e27baa',
  matchup:'Los Angeles Sparks @ Las Vegas Aces',
  market:'rebounds',
  side:'over',
  line:8,
  startTimeUTC:'2026-09-23T02:00:00.000Z',
}]};

const enriched=await enrichShareAssets(slip);
const leg=enriched?.legs?.[0];
assert.ok(leg,'enriched leg missing');
assert.match(String(leg.espnGameId||''),/^\d{6,}$/,'ParlayAPI event was not resolved to an ESPN event');
assert.match(String(leg.playerId||''),/^\d+$/,'ESPN player id missing');
assert.match(String(leg.playerImageUrl||''),/^https:\/\//,'player headshot URL missing');
assert.ok(/espn/i.test(String(leg.playerImageUrl)),'headshot is not an ESPN player asset');
console.log(JSON.stringify({ok:true,espnGameId:leg.espnGameId,playerId:leg.playerId,playerImageUrl:leg.playerImageUrl,team:leg.team},null,2));
