const { hydrateSharedSlip } = require('./lib/share-hydrate');
const { decodeShareSlip, buildShareUrl } = require('./lib/share-slip');
const { renderShareSvg } = require('./lib/share-renderer');

function tokenFromRequest(req) {
  return String(req.query?.slip || req.query?.token || '').trim();
}

function requestBaseUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'parlayping.net';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).send('Use GET.');
  const token = tokenFromRequest(req);
  if (!token) return res.status(400).send('Missing share token.');

  try {
    const baseUrl = requestBaseUrl(req);
    const slip = decodeShareSlip(token);
    const hydratedResult = await hydrateSharedSlip(slip, { baseUrl });
    const hydrated = hydratedResult.slip;
    const pageUrl = buildShareUrl(token, baseUrl);
    const context = String(req.query?.context || '') === 'x_reply' ? 'x_reply' : 'share';
    const svg = renderShareSvg({ slip:hydrated, context, pageUrl });

    res.setHeader('Cache-Control', 'public, max-age=20, s-maxage=20, stale-while-revalidate=40');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (String(req.query?.format || '').toLowerCase() === 'svg') {
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(svg);
    }

    let Resvg;
    try {
      ({ Resvg } = require('@resvg/resvg-js'));
    } catch (error) {
      console.error('ParlayPing share-card PNG renderer unavailable', error);
      return res.status(503).send('PNG renderer is unavailable.');
    }
    const rendered = new Resvg(svg, {
      fitTo:{ mode:'width', value:1200 },
      font:{ loadSystemFonts:true, defaultFontFamily:'Arial' },
    });
    const png = rendered.render().asPng();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', String(png.length));
    return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(png);
  } catch (error) {
    console.error('ParlayPing share-card error', error);
    const code = /secret|configured/i.test(error?.message || '') ? 503 : 400;
    return res.status(code).send(error?.message || 'Unable to render share card.');
  }
};

module.exports.tokenFromRequest = tokenFromRequest;
