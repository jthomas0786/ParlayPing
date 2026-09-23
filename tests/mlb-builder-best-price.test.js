const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../builder-summary-odds-hotfix.js'),'utf8');

test('MLB builder exposes verified prices with an always-available sportsbook fallback link',()=>{
  assert.match(source,/Best Available/);
  assert.match(source,/Calc \$\{fmtOdds/);
  assert.match(source,/Choose a sportsbook/);
  assert.match(source,/Exact slip when available; sportsbook page otherwise/);
  assert.match(source,/BOOK_HOME/);
  assert.match(source,/sportsbook\.fanduel\.com/);
  assert.match(source,/sportsbook\.draftkings\.com/);
  assert.match(source,/syncOpenButton/);
  assert.match(source,/Open \$\{esc\(book\|\|'Sportsbook'\)\}/);
  assert.match(source,/window\.open\(url,'_blank','noopener,noreferrer'\)/);
  assert.match(source,/grid\.onclick/);
  assert.match(source,/pp-price-grid/);
  assert.match(source,/impliedFromAmerican/);
  assert.doesNotMatch(source,/#openBookBtn\.pp-hidden-one-tap\{display:none!important\}/);
  assert.doesNotMatch(source,/new MutationObserver/);
});
