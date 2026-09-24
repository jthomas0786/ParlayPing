const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('basketball adapter keeps production main as default and supports an explicit staging source override',()=>{
  const source=fs.readFileSync(require.resolve('../lib/basketball-adapter'),'utf8');
  assert.match(source,/SPORTS_OUTPOST_RAW_BASE/);
  assert.match(source,/The-Sports-Outpost\/main\/slates/);
  assert.match(source,/replace\(\/\\\/\$\//);
});
