const fs = require('fs');
const path = require('path');
const { decodeShareSlip, buildCardUrl } = require('./lib/share-slip');
const { hydrateSharedSlip } = require('./lib/share-hydrate');
const { enrichSportsbookMarkets } = require('./lib/sportsbook-enrich');

const SHARE_CARD_VERSION = '20260924g';

function tokenFromRequest(req) {
  return String(req.query?.slip || req.query?.token || '').trim();
}

function publicBaseUrl() {
  return String(process.env.PUBLIC_BASE_URL || 'https://parlayping.net').replace(/\/$/, '');
}

function builderUrl(token, baseUrl = publicBaseUrl()) {
  return `${String(baseUrl).replace(/\/$/, '')}/build/${encodeURIComponent(token)}`;
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function versionedCardUrl(token, slip, baseUrl = publicBaseUrl()) {
  const base = buildCardUrl(token, baseUrl);
  const xReply = /^X\s+@ParlayPing$/i.test(String(slip?.source || '').trim());
  const query = new URLSearchParams({ v:SHARE_CARD_VERSION });
  if (xReply) query.set('context','x_reply');
  return `${base}?${query.toString()}`;
}

function renderBuilderHtml({ slip, token, liveDataAvailable }) {
  const baseUrl = publicBaseUrl();
  const url = builderUrl(token, baseUrl);
  const cardUrl = versionedCardUrl(token, slip, baseUrl);
  const legs = Array.isArray(slip.legs) ? slip.legs : [];
  const title = `${legs.length}-Leg Parlay — ParlayPing`;
  const description = `Build, organize, tune verified lines, share, and tail this ${legs.length}-leg ParlayPing betslip.`;
  const payload = safeJson({ slip, token, builderUrl: url, cardUrl, liveDataAvailable: Boolean(liveDataAvailable) });

  let html = fs.readFileSync(path.join(process.cwd(), 'builder-template.html'), 'utf8');
  html = html
    .replace(/\.\/favicon\.svg/g, '/favicon.svg')
    .replace(/\.\/parlayping-logo\.svg/g, '/parlayping-logo.svg')
    .replace(/\.\/account\.html/g, '/account.html')
    .replace(/\.\/styles\.css/g, '/builder.css')
    .replace(/<script src="\.\/app\.js"><\/script>/, `<script>window.__PARLAYPING_BUILDER__=${payload};</script><script src="/builder-sportsbook-links-prep.js"></script><script src="/builder-precision-runtime.js"></script><script src="/builder-concept-finish.js"></script><script src="/builder-mobile-fix.js"></script><script src="/builder-mobile-final.js"></script><script src="/builder-acceptance-final.js"></script><script src="/builder-summary-odds-hotfix.js"></script><script src="/builder-acceptance-icons.js"></script><script src="/builder-branding-final.js"></script><script src="/builder-sportsbook-open-final.js?v=20260924b"></script><script src="/builder-community-features.js?v=20260924a"></script><script src="/push-client.js?v=20260924a"></script><script src="/builder-tracking.js?v=20260924a"></script><script src="/builder-title-notifications.js?v=20260924a"></script><script src="/app-nav.js?v=20260925b" data-pp-app-nav></script>`)
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${description}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${title}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${description}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`);

  const social = `<meta property="og:image" content="${cardUrl}" /><meta property="og:image:width" content="1200" /><meta property="og:image:height" content="675" /><meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${title}" /><meta name="twitter:description" content="${description}" /><meta name="twitter:image" content="${cardUrl}" />`;
  html = html.replace('</head>', `<link rel="manifest" href="/manifest.webmanifest" /><meta name="apple-mobile-web-app-capable" content="yes" /><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" /><link rel="stylesheet" href="/builder-precision.css" /><link rel="stylesheet" href="/builder-mobile-fix.css" /><link rel="stylesheet" href="/builder-mobile-final.css" /><link rel="stylesheet" href="/builder-acceptance-final.css" /><link rel="stylesheet" href="/builder-branding-final.css" /><link rel="stylesheet" href="/builder-community-features.css?v=20260924a" /><link rel="stylesheet" href="/builder-tracking.css?v=20260924a" /><link rel="stylesheet" href="/app-nav.css?v=20260925b" data-pp-app-nav-css />${social}</head>`);
  return html;
}

module.exports = async function handler(req, res) {
  if (!['GET', 'HEAD'].includes(String(req.method || 'GET').toUpperCase())) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('Method not allowed');
  }

  try {
    const token = tokenFromRequest(req);
    if (!token) throw new Error('Missing ParlayPing builder token.');
    const saved = decodeShareSlip(token);
    const hydrated = await hydrateSharedSlip(saved, { baseUrl: publicBaseUrl() });
    const sportsbookSlip = await enrichSportsbookMarkets(hydrated.slip);
    const html = renderBuilderHtml({ slip: sportsbookSlip, token, liveDataAvailable: hydrated.liveDataAvailable });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.method === 'HEAD') return res.status(200).send('');
    return res.status(200).send(html);
  } catch (error) {
    console.error('ParlayPing builder page error', error);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(400).send(error?.message || 'Invalid ParlayPing builder link.');
  }
};

module.exports.builderUrl = builderUrl;
module.exports.renderBuilderHtml = renderBuilderHtml;
module.exports.tokenFromRequest = tokenFromRequest;
module.exports.versionedCardUrl = versionedCardUrl;
module.exports.SHARE_CARD_VERSION = SHARE_CARD_VERSION;
