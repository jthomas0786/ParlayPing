const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

process.env.PARLAYPING_SHARE_SECRET = 'test-only-parlayping-share-secret-0123456789abcdef';
process.env.PUBLIC_BASE_URL = 'https://parlayping.net';

const { renderBuilderHtml, SHARE_CARD_VERSION } = require('../server/api/builder-page');
const { parseSummaryPlayers, headshotUrl } = require('../server/api/lib/share-assets');
const { renderPng } = require('../server/api/share-card');

function sampleSlip() {
  return {
    v:1,
    createdAt:'2026-09-23T00:00:00.000Z',
    source:'X @ParlayPing',
    combinedOddsVerified:false,
    legs:[
      {
        id:'a', sport:'WNBA', player:'A\'ja Wilson', playerId:'3149391', team:'LVA', gameId:'401810360',
        matchup:'SEA @ LVA', market:'rebounds', displayMarket:'8+ REB', side:'over', line:8, status:'LIVE',
        progressText:'7 / 8 rebounds', playerImageUrl:'https://a.espncdn.com/i/headshots/wnba/players/full/3149391.png'
      },
      {
        id:'b', sport:'WNBA', player:'Jackie Young', team:'LVA', gameId:'401810360',
        matchup:'SEA @ LVA', market:'assists', displayMarket:'8+ AST', side:'over', line:8, status:'LIVE',
        progressText:'5 / 8 assists'
      }
    ]
  };
}

test('builder loads final acceptance assets last and legacy branding override is disabled', () => {
  const html = renderBuilderHtml({ slip:sampleSlip(), token:'test-token', liveDataAvailable:true });
  assert.equal(SHARE_CARD_VERSION, '20260923d');
  assert.match(html, /builder-acceptance-final\.css/);
  assert.match(html, /builder-acceptance-final\.js/);
  assert.doesNotMatch(html, /builder-approved-assets\.js/);
  assert.match(html, /\/share\/test-token\.png\?context=x_reply&amp;v=20260923d|\/share\/test-token\.png\?v=20260923d&amp;context=x_reply/);
});

test('ESPN summary asset parser returns stable player ids, headshots, and team logos', () => {
  const summary = {
    header:{ competitions:[{ competitors:[{
      id:'17', team:{ id:'17', abbreviation:'LVA', displayName:'Las Vegas Aces', logo:'https://a.espncdn.com/i/teamlogos/wnba/500/lv.png' }
    }] }] },
    boxscore:{ players:[{
      team:{ abbreviation:'LVA', logo:'https://a.espncdn.com/i/teamlogos/wnba/500/lv.png' },
      statistics:[{ athletes:[{
        athlete:{ id:'3149391', displayName:"A'ja Wilson", headshot:{ href:'https://a.espncdn.com/i/headshots/wnba/players/full/3149391.png' } },
        stats:[]
      }] }]
    }] }
  };
  const parsed = parseSummaryPlayers(summary, 'WNBA');
  assert.equal(parsed.players.length, 1);
  assert.equal(parsed.players[0].id, '3149391');
  assert.equal(parsed.players[0].name, "A'ja Wilson");
  assert.equal(parsed.players[0].team, 'LVA');
  assert.match(parsed.players[0].headshot, /3149391\.png$/);
  assert.match(parsed.players[0].teamLogo, /lv\.png$/);
  assert.equal(headshotUrl('WNBA','3149391'), 'https://a.espncdn.com/i/headshots/wnba/players/full/3149391.png');
});

test('production share-card rasterizer preserves SVG text in a PNG', async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><rect width="1200" height="675" fill="#03111e"/><text x="80" y="180" font-family="Arial,sans-serif" font-size="72" font-weight="700" fill="#ffffff">PARLAYPING TEXT CHECK</text></svg>`;
  const png = await renderPng(svg);
  assert.ok(Buffer.isBuffer(png));
  assert.equal(png[0], 0x89);
  assert.equal(png[1], 0x50);
  const image = sharp(png);
  const metadata = await image.metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 675);
  const stats = await image.stats();
  assert.ok(stats.channels.some(channel => channel.max > channel.min), 'expected rendered PNG to contain visible non-background content');
});
