const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const featureJs = fs.readFileSync(path.join(root, 'builder-community-features.js'), 'utf8');
const featureCss = fs.readFileSync(path.join(root, 'builder-community-features.css'), 'utf8');
const builderPageSource = fs.readFileSync(path.join(root, 'server/api/builder-page.js'), 'utf8');
const { renderBuilderHtml } = require('../server/api/builder-page');

test('community feature runtime uses publishable Supabase access with owner-scoped posting', () => {
  assert.match(featureJs, /community_parlays/);
  assert.match(featureJs, /parlayping_supabase_session_v1/);
  assert.match(featureJs, /sb_publishable_/);
  assert.match(featureJs, /user_id:userId/);
  assert.match(featureJs, /Post This Parlay/);
  assert.doesNotMatch(featureJs, /service[_-]?role/i);
  assert.doesNotMatch(featureJs, /SUPABASE_SERVICE/i);
});

test('similar parlays and insights are driven by the current slip instead of hard-coded picks', () => {
  assert.match(featureJs, /function similarityScore\(/);
  assert.match(featureJs, /function dynamicInsights\(/);
  assert.match(featureJs, /function selectedBookCoverage\(/);
  assert.match(featureJs, /applyLineVariant/);
  assert.match(featureJs, /Best Book Coverage/);
  assert.match(featureJs, /communityRows/);
});

test('sportsbook marks replace letter badges with image logos and keep fallback text', () => {
  assert.match(featureJs, /function applyBookLogos\(/);
  assert.match(featureJs, /google\.com\/s2\/favicons/);
  assert.match(featureJs, /ppLogoFallback/);
  assert.match(featureCss, /\.sportsbook-grid \.book-logo img/);
});

test('builder page loads community CSS and runtime after the final sportsbook runtime', () => {
  const slip = {
    sportsbook: 'FanDuel',
    legs: [
      {
        id: 'leg-1',
        sport: 'NFL',
        player: 'Example Player',
        market: 'receiving_yards',
        side: 'over',
        line: 49.5,
        matchup: 'CHI @ GB',
        bookOffers: { FanDuel: { oddsAmerican: -110 } },
      },
    ],
  };
  const html = renderBuilderHtml({ slip, token: 'test-token', liveDataAvailable: true });

  assert.match(html, /builder-community-features\.css\?v=/);
  assert.match(html, /builder-community-features\.js\?v=/);

  const sportsbookRuntime = html.indexOf('/builder-sportsbook-open-final.js');
  const communityRuntime = html.indexOf('/builder-community-features.js');
  const brandingCss = html.indexOf('/builder-branding-final.css');
  const communityCss = html.indexOf('/builder-community-features.css');

  assert.ok(sportsbookRuntime >= 0, 'sportsbook runtime should be present');
  assert.ok(communityRuntime > sportsbookRuntime, 'community runtime must load after sportsbook runtime');
  assert.ok(brandingCss >= 0, 'branding CSS should be present');
  assert.ok(communityCss > brandingCss, 'community CSS must load after existing final branding CSS');
});

test('community layer exposes a readiness marker for browser QA', () => {
  assert.match(featureJs, /dataset\.ppCommunityFeatures='ready'/);
});

test('builder page source contains only public browser assets for community features', () => {
  assert.match(builderPageSource, /builder-community-features\.js/);
  assert.match(builderPageSource, /builder-community-features\.css/);
  assert.doesNotMatch(builderPageSource, /service[_-]?role/i);
});
