const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('community schema accepts canonical ParlayPing build URLs', () => {
  const sql = read('database/community_parlays.sql');
  assert.ok(sql.includes("builder_url ~ '^https://parlayping\\.net/build/'"));
  assert.doesNotMatch(sql, /parlayping\\\\\.net\/build/);
});

test('authenticated community writes can resolve owner upserts without exposing user_id to anon', () => {
  const sql = read('database/community_parlays.sql');
  assert.match(sql, /grant select \(user_id\) on table public\.community_parlays to authenticated;/i);
  assert.doesNotMatch(sql, /grant select \(user_id\) on table public\.community_parlays to anon/i);
});

test('production persistence hotfix covers both tracked and community builder URL constraints', () => {
  const sql = read('database/fix_tracking_community_persistence.sql');
  assert.match(sql, /tracked_parlays_builder_url_check/);
  assert.match(sql, /community_parlays_builder_url/);
  const matches = sql.match(/parlayping\\\.net\/build\//g) || [];
  assert.equal(matches.length, 2);
});
