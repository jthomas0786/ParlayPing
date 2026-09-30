const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(process.cwd(), 'builder-sportsbook-open-final.js'), 'utf8');

test('every verified priced sportsbook has a safe generic destination when native selection links are absent', () => {
  const expected = {
    'Hard Rock Bet': 'https://www.hardrock.bet/sportsbook',
    Pinnacle: 'https://www.pinnacle.com/en/',
    'Parx Casino': 'https://www.betparx.com/',
    Fliff: 'https://www.getfliff.com/',
  };
  for (const [book, url] of Object.entries(expected)) {
    assert.match(source, new RegExp(`${book.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}['\"]?:['\"]${url.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`));
  }
});

test('native exact links continue to take precedence over generic sportsbook destinations', () => {
  assert.match(source, /const exact=exactSportsbookLinks\(\)\[book\];\s*if\(exact\)return \{url:exact,exact:true\};/);
  assert.match(source, /return generic\?\{url:generic,exact:false\}:null;/);
});
