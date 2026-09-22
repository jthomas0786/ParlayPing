const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderBuilderHtml, builderUrl } = require('../server/api/builder-page');

function read(file){return fs.readFileSync(path.join(__dirname,'..',file),'utf8');}

test('marketing homepage is restored and does not contain the builder concept',()=>{
  const html=read('index.html');
  assert.match(html,/See the bet\./);
  assert.match(html,/Tag it\. Track it\. Tail what's left\./);
  assert.doesNotMatch(html,/BUILD\. TWEAK\. SHARE\./);
});

test('social builder template matches the approved concept surface',()=>{
  const html=read('builder-template.html');
  const css=read('builder.css');
  const precision=read('builder-precision.css');
  const js=read('builder-precision-runtime.js');
  assert.match(html,/BUILD\. TWEAK\. SHARE\./);
  assert.match(html,/My Parlay/);
  assert.match(html,/Parlay Tune/);
  assert.match(html,/Open This Parlay on Your Sportsbook/);
  assert.match(html,/Share Your Betslip/);
  assert.match(html,/Similar Parlays/);
  assert.match(html,/Insights/);
  assert.doesNotMatch(html,/Gambly/i);
  assert.match(css,/\.tune-open \.alt-lines/);
  assert.match(precision,/\.app-shell\{width:min\(940px/);
  assert.match(precision,/\.pick-main\{min-height:78px/);
  assert.match(precision,/\.sportsbook-grid/);
  assert.match(js,/__PARLAYPING_BUILDER__/);
  assert.match(js,/pp-brand-name/);
  assert.match(js,/sport-shield/);
  assert.match(js,/teamPair\(leg\)/);
  assert.match(js,/setTuneState/);
  assert.match(js,/navigator\.share/);
});

test('signed builder renderer injects real slip state into the approved concept',()=>{
  const token='s1.example.signature';
  const html=renderBuilderHtml({
    token,
    liveDataAvailable:true,
    slip:{
      sportsbook:'DraftKings',
      combinedOddsAmerican:412,
      combinedOddsVerified:true,
      legs:[{id:'leg-1',sport:'NFL',player:'Derrick Henry',team:'BAL',matchup:'BAL @ KC',gameId:'game-1',market:'Anytime TD Scorer',displayMarket:'Anytime TD Scorer',oddsAmerican:-235,status:'PENDING',pregameProbability:.937}],
    },
  });
  assert.equal(builderUrl(token),'https://parlayping.net/build/s1.example.signature');
  assert.match(html,/\/builder\.css/);
  assert.match(html,/\/builder-precision\.css/);
  assert.match(html,/\/builder-precision-runtime\.js/);
  assert.match(html,/window\.__PARLAYPING_BUILDER__/);
  assert.match(html,/Derrick Henry/);
  assert.match(html,/BAL @ KC/);
  assert.match(html,/https:\/\/parlayping\.net\/build\/s1\.example\.signature/);
  assert.match(html,/https:\/\/parlayping\.net\/share\/s1\.example\.signature\.png/);
  assert.doesNotMatch(html,/src="\.\/app\.js"/);
});

test('Sports Outpost signed builder preserves signed return metadata without rendering Back or close controls',()=>{
  const html=renderBuilderHtml({
    token:'s1.example.signature',
    liveDataAvailable:true,
    slip:{
      returnUrl:'https://thesportsoutpost.com/nfl.html?view=props#betslip',
      returnLabel:'The Sports Outpost',
      legs:[{id:'leg-1',sport:'NFL',player:'Player 1',market:'Rushing Yards',status:'PENDING'}],
    },
  });
  assert.match(html,/https:\/\/thesportsoutpost\.com\/nfl\.html\?view=props#betslip/);
  assert.match(html,/The Sports Outpost/);
  assert.doesNotMatch(html,/Back to The Sports Outpost/);
  assert.doesNotMatch(html,/Close ParlayPing and return to The Sports Outpost/);
  assert.doesNotMatch(html,/pp-return-back/);
  assert.doesNotMatch(html,/pp-return-close/);
});

test('build route is separate from the signed shared-slip route',()=>{
  const vercel=read('vercel.json');
  const dispatcher=read('api/index.js');
  const shared=read('server/api/share-page.js');
  const builder=read('server/api/builder-page.js');
  assert.match(vercel,/\/build\/:token/);
  assert.match(vercel,/builder-page/);
  assert.match(vercel,/\/slip\/:token/);
  assert.match(dispatcher,/builder-page/);
  assert.match(builder,/decodeShareSlip/);
  assert.match(builder,/builder-template\.html/);
  assert.match(shared,/Best Book for This Parlay/);
});