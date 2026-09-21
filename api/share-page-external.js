const { decodeShareSlip, buildShareUrl, buildCardUrl } = require('./lib/share-slip');
const { hydrateSharedSlip } = require('./lib/share-hydrate');
const { pageHtml, tokenFromRequest } = require('./share-page');

function requestBaseUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'parlayping.net';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

function allowedReturnOrigins() {
  return new Set(
    String(process.env.PARLAYPING_RETURN_ORIGINS || 'https://thesportsoutpost.com,https://www.thesportsoutpost.com')
      .split(',')
      .map(value => value.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );
}

function safeReturnUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:') return null;
    if (!allowedReturnOrigins().has(url.origin)) return null;
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return null;
  }
}

function injectReturnControls(html, returnUrl) {
  if (!returnUrl) return html;
  const href = String(returnUrl)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const css = `.pp-return-controls{position:fixed;z-index:30;top:max(14px,env(safe-area-inset-top));left:max(14px,env(safe-area-inset-left));right:max(14px,env(safe-area-inset-right));display:flex;align-items:center;justify-content:space-between;gap:12px;pointer-events:none}.pp-return-controls a{pointer-events:auto;text-decoration:none;color:#eefbff;background:rgba(5,24,43,.96);border:1px solid #1b6172;box-shadow:0 10px 30px rgba(0,0,0,.28);backdrop-filter:blur(10px)}.pp-return-back{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:10px 15px;font-size:13px;font-weight:850}.pp-return-close{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-size:27px;line-height:1}.with-return .shell{padding-top:86px}@media(max-width:760px){.pp-return-back{padding:9px 12px;font-size:12px}.pp-return-close{width:40px;height:40px}.with-return .shell{padding-top:78px}}`;
  const controls = `<nav class="pp-return-controls" aria-label="Return to The Sports Outpost"><a class="pp-return-back" href="${href}">← Back to The Sports Outpost</a><a class="pp-return-close" href="${href}" aria-label="Close ParlayPing and return to The Sports Outpost">×</a></nav>`;

  return html
    .replace('</style>', `${css}</style>`)
    .replace('<body>', `<body class="with-return">${controls}`);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).send('Use GET.');
  const token = tokenFromRequest(req);
  if (!token) return res.status(400).send('Missing share token.');

  try {
    const baseUrl = requestBaseUrl(req);
    const slip = decodeShareSlip(token);
    const hydrated = await hydrateSharedSlip(slip, { baseUrl });
    const shareUrl = buildShareUrl(token, baseUrl);
    const cardUrl = buildCardUrl(token, baseUrl);
    const returnUrl = safeReturnUrl(req.query?.return || req.query?.returnUrl);
    const html = injectReturnControls(
      pageHtml({ slip:hydrated.slip, shareUrl, cardUrl, baseUrl, liveDataAvailable:hydrated.liveDataAvailable }),
      returnUrl,
    );

    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','private, no-store');
    return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(html);
  } catch (error) {
    console.error('ParlayPing external share-page error', error);
    const code = /secret|configured/i.test(error?.message || '') ? 503 : 400;
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    return res.status(code).send(error?.message || 'Unable to open this ParlayPing slip.');
  }
};

module.exports.safeReturnUrl = safeReturnUrl;
module.exports.injectReturnControls = injectReturnControls;
