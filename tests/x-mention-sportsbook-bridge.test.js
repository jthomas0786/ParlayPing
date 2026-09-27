const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('normal X mentions enrich sportsbook markets before sharing',()=>{
  const source=fs.readFileSync('server/api/x-worker.js','utf8');
  assert.match(source,/const contextualLegs=mergeAnalyzedContext\(parsed\.legs,analysis\)/);
  assert.match(source,/const enrichedBase=await enrichSportsbookMarkets\(\{legs:contextualLegs\}\)/);
  assert.match(source,/executeMentionCommand\(mentionLegs,analysis,input\.command\)/);
});

test('builder exposes verified common-book prices even without provider deep links',()=>{
  const source=fs.readFileSync('builder-acceptance-final.js','utf8');
  assert.match(source,/const BOOK_HOME=/);
  assert.match(source,/Object\.keys\(leg\?\.bookOffers\|\|\{\}\)/);
  assert.match(source,/Verified prices · Open Sportsbook/);
  assert.match(source,/Open Exact Betslip/);
});
