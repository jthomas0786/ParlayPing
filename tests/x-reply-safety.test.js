const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPublicReply,xWeightedLength}=require('../api/lib/analysis-safety');

test('X weighted length counts URLs as 23 and non-ASCII status emoji at double weight',()=>{
  assert.equal(xWeightedLength('abc'),3);
  assert.equal(xWeightedLength('✅'),2);
  assert.equal(xWeightedLength('https://example.com/a/really/long/path?with=query'),23);
  assert.equal(xWeightedLength('A✅ https://example.com'),1+2+1+23);
});

test('public reply compacts under X weighted limit without truncating Tail URL or leaking internal reasons',()=>{
  const tailUrl='https://parlayping.net/tail?slip=abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789';
  const analysis={
    counts:{hit:1,live:2,pending:1,miss:0},
    combinedTailProbability:0.427,
    correlation:{hasRisk:false},
    tailUrl,
    results:[
      {status:'LIVE',player:'Very Long Player Name',displayMarket:'測試'.repeat(90),current:4,target:8,probability:0.6,resolutionReason:'INTERNAL_SECRET_DO_NOT_SHOW'},
      {status:'LIVE',player:'Another Extremely Long Name',displayMarket:'🎯'.repeat(80),current:2,target:5,probability:0.55,resolutionReason:'PRIVATE_SOURCE_ERROR'},
      {status:'PENDING',player:'Third Long Name',displayMarket:'Long market description '.repeat(12),probability:0.51,resolutionReason:'HIDDEN_DIAGNOSTIC'},
      {status:'HIT',player:'Winner Name',displayMarket:'already hit',resolutionReason:'SENSITIVE_INTERNAL_NOTE'}
    ]
  };
  const reply=buildPublicReply(analysis,{maxLegs:3});
  assert.ok(reply);
  assert.match(reply,/^🔔 ParlayPing Live/);
  assert.ok(xWeightedLength(reply)<=280,`weighted reply length ${xWeightedLength(reply)} exceeds 280`);
  assert.ok(reply.includes(tailUrl),'Tail URL must remain intact');
  assert.equal(reply.includes('INTERNAL_SECRET_DO_NOT_SHOW'),false);
  assert.equal(reply.includes('PRIVATE_SOURCE_ERROR'),false);
  assert.equal(reply.includes('HIDDEN_DIAGNOSTIC'),false);
  assert.equal(/\bSTOP\b/i.test(reply),false);
});
