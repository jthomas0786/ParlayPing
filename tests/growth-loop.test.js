const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Founding 100 and referral schema are committed with protected counters',()=>{
  const sql=read('sql/community-growth-loop.sql');
  const indexes=read('sql/community-growth-indexes.sql');
  assert.match(sql,/create table if not exists public\.member_badges/i);
  assert.match(sql,/founding_number smallint unique/i);
  assert.match(sql,/counter_value < 100/i);
  assert.match(sql,/community_parlays_award_contributor/i);
  assert.match(sql,/referral_code='JT'/i);
  assert.match(sql,/revoke insert, update, delete on public\.member_badges from anon, authenticated/i);
  assert.match(sql,/users can claim one referral for themselves/i);
  assert.match(indexes,/member_referrals_referrer_user_id_idx/i);
});

test('join page captures referral attribution without requiring X API reads',()=>{
  const join=read('join.js');
  const account=read('account.html');
  assert.match(join,/parlayping_referral_code_v1/);
  assert.match(join,/member_badges/);
  assert.match(join,/URLSearchParams/);
  assert.match(account,/referral-capture\.js\?v=20260926a/);
  assert.match(read('referral-capture.js'),/member_referrals/);
});

test('profiles expose founding badge, invite count and personal referral link',()=>{
  const html=read('profile.html');
  const growth=read('profile-growth.js');
  assert.match(html,/profile-growth\.css\?v=20260926a/);
  assert.match(html,/profile-growth\.js\?v=20260926a/);
  assert.match(growth,/FOUNDING MEMBER/);
  assert.match(growth,/invite_count/);
  assert.match(growth,/\/join\?ref=/);
  assert.match(growth,/Submit another betslip/);
});

test('submitted and shared slips carry the contributor referral loop and Discord copy',()=>{
  const submit=read('submit.html');
  const submitGrowth=read('submit-growth.js');
  const share=read('server/api/share-page-with-nav.js');
  assert.match(submit,/submit-growth\.js\?v=20260927b/);
  assert.match(submitGrowth,/searchParams\.set\('ref',referralCode\)/);
  assert.match(submitGrowth,/\/join\?ref=/);
  assert.match(submitGrowth,/Submit yours free/);
  assert.match(submitGrowth,/Copy for Discord/);
  assert.match(submitGrowth,/ParlayPing Verified Pregame/);
  assert.match(share,/Got a slip of your own\?/);
  assert.match(share,/Join & submit yours/);
  assert.match(share,/\/join\?ref=/);
  assert.match(share,/safeReferral/);
});

test('Explore decorates verified community cards with Founding badges and engagement actions',()=>{
  const html=read('trending.html');
  const growth=read('trending-growth.js');
  assert.match(html,/trending-growth\.js\?v=20260927b/);
  assert.match(growth,/member_badges/);
  assert.match(growth,/COMMUNITY/);
  assert.match(growth,/FOUNDING #/);
  assert.match(growth,/parlayping_record_community_engagement/);
  assert.match(growth,/data-pp-community-action/);
  assert.match(growth,/tail_count/);
  assert.match(growth,/modify_count/);
});

test('Community engagement SQL deduplicates Tail and Modify counts per browser client',()=>{
  const sql=read('sql/community-engagement-counters.sql');
  assert.match(sql,/community_engagement_events/i);
  assert.match(sql,/action in \('tail','modify'\)/i);
  assert.match(sql,/unique \(community_parlay_id, action, client_key\)/i);
  assert.match(sql,/parlayping_record_community_engagement/i);
  assert.match(sql,/security definer/i);
  assert.match(sql,/revoke all on public\.community_engagement_events from anon, authenticated/i);
});
