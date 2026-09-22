const { decodeShareSlip, buildCardUrl } = require('./lib/share-slip');
const { buildBuilderUrl } = require('./lib/builder-url');
const { hydrateSharedSlip } = require('./lib/share-hydrate');
const fs = require('node:fs');

const TEMPLATE_PATH = require.resolve('../templates/builder-template.html');
const TEMPLATE = fs.readFileSync(TEMPLATE_PATH, 'utf8');

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tokenFromRequest(req) {
  return String(req.query?.slip || req.query?.token || '').trim();
}

function canonicalBaseUrl() {
  return String(process.env.PUBLIC_BASE_URL || 'https://parlayping.net').replace(/\/+$/, '');
}

function bootstrapJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function builderHtml({ token, slip, shareUrl, cardUrl, liveDataAvailable }) {
  const legs = Array.isArray(slip?.legs) ? slip.legs : [];
  const title = `${legs.length}-Bet Parlay — ParlayPing`;
  const description = `Build, tune, compare, and share this ${legs.length}-bet ParlayPing slip.`;
  const bootstrap = bootstrapJson({ ok:true, token, slip, shareUrl, cardUrl, liveDataAvailable:Boolean(liveDataAvailable) });

  let html = TEMPLATE;
  html = html.replace('<head>', `<head>\n  <base href="/builder-assets/" />`);
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${esc(title)}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*"\s*\/>/i, `<meta name="description" content="${esc(description)}" />`);
  html = html.replace(/<meta property="og:title" content="[^"]*"\s*\/>/i, `<meta property="og:title" content="${esc(title)}" />`);
  html = html.replace(/<meta property="og:description" content="[^"]*"\s*\/>/i, `<meta property="og:description" content="${esc(description)}" />`);
  html = html.replace(/<meta property="og:url" content="[^"]*"\s*\/>/i, `<meta property="og:url" content="${esc(shareUrl)}" />`);
  html = html.replace('</head>', `  <meta property="og:image" content="${esc(cardUrl)}" />\n  <meta name="twitter:card" content="summary_large_image" />\n  <meta name="twitter:title" content="${esc(title)}" />\n  <meta name="twitter:description" content="${esc(description)}" />\n  <meta name="twitter:image" content="${esc(cardUrl)}" />\n  <style>body.pp-hydrating .parlay-panel,body.pp-hydrating .lower-grid{visibility:hidden}</style>\n</head>`);
  html = html.replace('<body>', '<body class="pp-hydrating">');
  html = html.replace('<script src="./app.js"></script>', `<script id="pp-builder-data" type="application/json">${bootstrap}</script>\n  <script src="./app.js"></script>`);
  return html;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, noarchive');
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(405).send('Use GET.');
  }

  try {
    const token = tokenFromRequest(req);
    if (!token) throw new Error('Missing ParlayPing builder token.');
    const decoded = decodeShareSlip(token);
    const baseUrl = canonicalBaseUrl();
    const hydrated = await hydrateSharedSlip(decoded, { baseUrl });
    const shareUrl = buildBuilderUrl(token, baseUrl);
    const cardUrl = buildCardUrl(token, baseUrl);
    const html = builderHtml({
      token,
      slip: hydrated.slip,
      shareUrl,
      cardUrl,
      liveDataAvailable: hydrated.liveDataAvailable,
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.method === 'HEAD') return res.status(200).send('');
    return res.status(200).send(html);
  } catch (error) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const message = esc(error?.message || 'Unable to open this ParlayPing betslip.');
    return res.status(400).send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ParlayPing</title></head><body style="margin:0;background:#020e19;color:#f7fbff;font-family:system-ui;padding:40px"><main style="max-width:720px;margin:auto"><img src="/parlayping-logo.svg" alt="ParlayPing" style="width:220px;max-width:70vw"><h1>Unable to open this betslip</h1><p>${message}</p><a href="/" style="color:#20e9e0">Back to ParlayPing</a></main></body></html>`);
  }
};

module.exports.tokenFromRequest = tokenFromRequest;
module.exports.builderHtml = builderHtml;
