const fs = require('fs');
const path = require('path');
const { decodeShareSlip, buildCardUrl } = require('./lib/share-slip');
const { hydrateSharedSlip } = require('./lib/share-hydrate');

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

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function returnControls(slip) {
  if (!slip?.returnUrl) return '';
  const label = slip.returnLabel || 'The Sports Outpost';
  return `<style>.pp-return-control{position:fixed;z-index:70;top:92px;border:1px solid #1b607b;background:#061928;color:#eef8fd;text-decoration:none;font:700 12px Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.28)}.pp-return-back{left:14px;padding:10px 13px;border-radius:999px}.pp-return-close{right:14px;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-size:24px}@media(max-width:1180px){.pp-return-control{top:auto;bottom:14px}}</style><a class="pp-return-control pp-return-back" href="${esc(slip.returnUrl)}" aria-label="Back to ${esc(label)}">← Back to ${esc(label)}</a><a class="pp-return-control pp-return-close" href="${esc(slip.returnUrl)}" aria-label="Close ParlayPing and return to ${esc(label)}">×</a>`;
}

function renderBuilderHtml({ slip, token, liveDataAvailable }) {
  const baseUrl = publicBaseUrl();
  const url = builderUrl(token, baseUrl);
  const cardUrl = buildCardUrl(token, baseUrl);
  const legs = Array.isArray(slip.legs) ? slip.legs : [];
  const title = `${legs.length}-Leg Parlay — ParlayPing`;
  const description = `Build, tweak, share, and tail this ${legs.length}-leg ParlayPing betslip.`;
  const payload = safeJson({ slip, token, builderUrl: url, cardUrl, liveDataAvailable: Boolean(liveDataAvailable) });

  let html = fs.readFileSync(path.join(process.cwd(), 'builder-template.html'), 'utf8');
  html = html
    .replace(/\.\/favicon\.svg/g, '/favicon.svg')
    .replace(/\.\/parlayping-logo\.svg/g, '/parlayping-logo.svg')
    .replace(/\.\/account\.html/g, '/account.html')
    .replace(/\.\/styles\.css/g, '/builder.css')
    .replace(/<script src="\.\/app\.js"><\/script>/, `<script>window.__PARLAYPING_BUILDER__=${payload};</script><script src="/builder-precision-runtime.js"></script><script src="/builder-concept-finish.js"></script>`)
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${description}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${title}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${description}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`)
    .replace('<body>', `<body>${returnControls(slip)}`);

  const social = `<meta property="og:image" content="${cardUrl}" /><meta property="og:image:width" content="1200" /><meta property="og:image:height" content="675" /><meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${title}" /><meta name="twitter:description" content="${description}" /><meta name="twitter:image" content="${cardUrl}" />`;
  html = html.replace('</head>', `<link rel="stylesheet" href="/builder-precision.css" />${social}</head>`);
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
    const html = renderBuilderHtml({ slip: hydrated.slip, token, liveDataAvailable: hydrated.liveDataAvailable });
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
