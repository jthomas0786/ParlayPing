const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../builder-summary-odds-hotfix.js'),'utf8');

test('MLB builder exposes best-available verified prices with concise tappable sportsbook UX',()=>{
  assert.match(source,/Best Available/);
  assert.match(source,/Calc \$\{fmtOdds/);
  assert.match(source,/Tap a sportsbook below/);
  assert.match(source,/grid\.onclick/);
  assert.match(source,/pp-price-grid/);
  assert.match(source,/One-tap betslip is not available/);
  assert.match(source,/impliedFromAmerican/);
  assert.doesNotMatch(source,/new MutationObserver/);
  assert.doesNotMatch(source,/ParlayPing labels combined numbers as calculated because they are not a sportsbook-quoted parlay/);
});