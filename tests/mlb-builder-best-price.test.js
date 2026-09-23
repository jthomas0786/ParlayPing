const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../builder-summary-odds-hotfix.js'),'utf8');

test('MLB builder exposes best-available verified prices and labels synthetic combined odds as calculated',()=>{
  assert.match(source,/Best Available/);
  assert.match(source,/Calc \$\{fmtOdds/);
  assert.match(source,/picks priced/);
  assert.match(source,/not a sportsbook-quoted parlay price/);
  assert.match(source,/Exact one-tap betslip link unavailable/);
  assert.match(source,/bookCoverage/);
});
