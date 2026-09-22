const test = require('node:test');
const assert = require('node:assert/strict');

process.env.PARLAYPING_SHARE_SECRET = 'test-only-x-share-bundle-secret-0123456789abcdef';
process.env.PUBLIC_BASE_URL = 'https://parlayping.net';

const { buildXShareBundle, tryBuildXShareBundle } = require('../api/lib/x-share-bundle');

function parsedLeg(index, extra = {}) {
  return {
    id:`leg-${index}`,
    sport:'NFL',
    player:`Player ${index}`,
    team:'SF',
    gameId:`game-${index}`,
    market:'Rushing Yards',
    side:'over',
    line:59.5,
    oddsAmerican:140,
    ...extra,
  };
}

function result(index, extra = {}) {
  return {
    ...parsedLeg(index),
    displayMarket:'O59.5 RUSH YDS',
    status:'PENDING',
    probability:.417,
    target:59.5,
    ...extra,
  };
}

test('X share bundle creates signed builder and x-reply card URL without posting', () => {
  const bundle = buildXShareBundle({
    parsedLegs:[parsedLeg(1),parsedLeg(2),parsedLeg(3)],
    analysis:{
      results:[result(1),result(2),result(3)],
      counts:{hit:0,live:0,pending:3,miss:0},
      correlation:{hasRisk:false},
      combinedTailProbability:.0725,
    },
    sourceReference:'x:12345',
    baseUrl:'https://parlayping.net',
  });
  assert.equal(bundle.ready,true);
  assert.match(bundle.shareUrl,/^https:\/\/parlayping\.net\/build\/s\/s1\./);
  assert.match(bundle.cardUrl,/^https:\/\/parlayping\.net\/share\/s1\..+\.png$/);
  assert.match(bundle.xReplyCardUrl,/\.png\?context=x_reply$/);
  assert.match(bundle.replyText,/^🔔 ParlayPing Live/);
  assert.match(bundle.replyText,/Open betslip → https:\/\/parlayping\.net\/build\/s\//);
  assert.doesNotMatch(bundle.replyText,/Tail what's left/);
});

test('X share bundle preserves mixed live progress and current probability in signed slip', () => {
  const bundle = buildXShareBundle({
    parsedLegs:[parsedLeg(1),parsedLeg(2),parsedLeg(3)],
    analysis:{
      results:[
        result(1,{status:'HIT',probability:1,current:64,target:60,gameState:'in'}),
        result(2,{status:'LIVE',probability:.684,current:47,target:60,gameState:'in'}),
        result(3),
      ],
      counts:{hit:1,live:1,pending:1,miss:0},
      correlation:{hasRisk:false},
      combinedTailProbability:.285,
    },
    baseUrl:'https://parlayping.net',
  });
  assert.equal(bundle.slip.legs[0].status,'HIT');
  assert.equal(bundle.slip.legs[1].status,'LIVE');
  assert.equal(bundle.slip.legs[1].liveProbability,.684);
  assert.equal(bundle.slip.legs[1].progressText,'47 / 60 yards');
  assert.equal(bundle.slip.legs[2].status,'PENDING');
  assert.equal(bundle.slip.legs[2].pregameProbability,.417);
});

test('X share bundle refuses unresolved legs', () => {
  const bundle = buildXShareBundle({
    parsedLegs:[parsedLeg(1)],
    analysis:{results:[result(1,{status:'UNRESOLVED',probability:null})],counts:{unresolved:1}},
  });
  assert.equal(bundle.ready,false);
  assert.equal(bundle.reason,'unresolved-legs');
  assert.equal(bundle.shareUrl,null);
});

test('safe builder fails closed when signing secret is unavailable', () => {
  const previous=process.env.PARLAYPING_SHARE_SECRET;
  delete process.env.PARLAYPING_SHARE_SECRET;
  try {
    const bundle=tryBuildXShareBundle({parsedLegs:[parsedLeg(1)],analysis:{results:[result(1)],counts:{pending:1},correlation:{hasRisk:false}}});
    assert.equal(bundle.ready,false);
    assert.equal(bundle.reason,'share-bundle-unavailable');
    assert.equal(bundle.shareUrl,null);
  } finally {
    process.env.PARLAYPING_SHARE_SECRET=previous;
  }
});
