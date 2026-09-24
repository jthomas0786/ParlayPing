const test=require('node:test');
const assert=require('node:assert/strict');
const {hasExplicitMention,leadingMentionHandles}=require('../server/api/lib/x-explicit-mention');

test('ignores ParlayPing when it is only an inherited reply participant',()=>{
  const raw='@justcallmejt_ @ParlayPing @Playbook';
  assert.deepEqual(leadingMentionHandles(raw),['justcallmejt_','ParlayPing','Playbook']);
  assert.equal(hasExplicitMention(raw,'ParlayPing'),false);
});

test('accepts ParlayPing when the user explicitly adds it as the final reply mention',()=>{
  assert.equal(hasExplicitMention('@justcallmejt_ @ParlayPing','ParlayPing'),true);
  assert.equal(hasExplicitMention('@justcallmejt_ @ParlayPing analyze this','ParlayPing'),true);
});

test('accepts visible in-body and direct ParlayPing mentions',()=>{
  assert.equal(hasExplicitMention('Can you check this @ParlayPing?','ParlayPing'),true);
  assert.equal(hasExplicitMention('@ParlayPing check this slip','ParlayPing'),true);
});

test('does not match similarly named accounts',()=>{
  assert.equal(hasExplicitMention('@ParlayPingHelp check this','ParlayPing'),false);
});
