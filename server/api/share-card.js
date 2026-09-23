const { hydrateSharedSlip } = require('./lib/share-hydrate');
const { decodeShareSlip, buildShareUrl } = require('./lib/share-slip');
const { renderShareSvg, safeAssetUrl, selectVisibleLegs } = require('./lib/share-renderer');

const imageCache = new Map();

function tokenFromRequest(req) {
  return String(req.query?.slip || req.query?.token || '').trim();
}

function requestBaseUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'parlayping.net';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

async function imageDataUri(value) {
  const url = safeAssetUrl(value);
  if (!url || url.startsWith('data:image/')) return url;
  if (imageCache.has(url)) return imageCache.get(url);
  try {
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(1600) : undefined;
    const response = await fetch(url, { signal, headers:{ accept:'image/avif,image/webp,image/png,image/jpeg,*/*' } });
    if (!response.ok) throw new Error(`image ${response.status}`);
    const type = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!['image/png','image/jpeg','image/jpg','image/webp'].includes(type)) throw new Error('unsupported image type');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 1_500_000) throw new Error('image too large');
    const uri = `data:${type};base64,${bytes.toString('base64')}`;
    if (imageCache.size > 96) imageCache.clear();
    imageCache.set(url, uri);
    return uri;
  } catch {
    imageCache.set(url, null);
    return null;
  }
}

async function embedVisibleAssets(slip, context) {
  const legs = Array.isArray(slip?.legs) ? slip.legs.map(leg => ({ ...leg })) : [];
  const visible = selectVisibleLegs(legs, context, 6);
  await Promise.all(visible.map(async leg => {
    const index = Number(leg.__index);
    if (!Number.isInteger(index) || !legs[index]) return;
    const [playerImageUrl, teamLogoUrl] = await Promise.all([
      imageDataUri(legs[index].playerImageUrl),
      imageDataUri(legs[index].teamLogoUrl),
    ]);
    legs[index].playerImageUrl = playerImageUrl;
    legs[index].teamLogoUrl = teamLogoUrl;
  }));
  return { ...slip, legs };
}

async function rasterizeEmbeddedWebp(svg) {
  const source = String(svg || '');
  const webpUris = [...new Set(source.match(/data:image\/webp;base64,[A-Za-z0-9+/=]+/g) || [])];
  if (!webpUris.length) return source;
  let sharp;
  try {
    sharp = require('sharp');
  } catch (error) {
    console.error('ParlayPing WebP converter unavailable', error);
    return source;
  }
  let output = source;
  for (const dataUri of webpUris) {
    try {
      const bytes = Buffer.from(dataUri.slice('data:image/webp;base64,'.length), 'base64');
      const png = await sharp(bytes).png({ compressionLevel:9, adaptiveFiltering:true }).toBuffer();
      output = output.split(dataUri).join(`data:image/png;base64,${png.toString('base64')}`);
    } catch (error) {
      console.error('ParlayPing WebP conversion failed', error);
    }
  }
  return output;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).send('Use GET.');
  const token = tokenFromRequest(req);
  if (!token) return res.status(400).send('Missing share token.');

  try {
    const baseUrl = requestBaseUrl(req);
    const slip = decodeShareSlip(token);
    const hydratedResult = await hydrateSharedSlip(slip, { baseUrl });
    const context = String(req.query?.context || '') === 'x_reply' ? 'x_reply' : 'share';
    const hydrated = await embedVisibleAssets(hydratedResult.slip, context);
    const pageUrl = buildShareUrl(token, baseUrl);
    const svg = await rasterizeEmbeddedWebp(renderShareSvg({ slip:hydrated, context, pageUrl }));

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
module.exports.imageDataUri = imageDataUri;
module.exports.embedVisibleAssets = embedVisibleAssets;
module.exports.rasterizeEmbeddedWebp = rasterizeEmbeddedWebp;
