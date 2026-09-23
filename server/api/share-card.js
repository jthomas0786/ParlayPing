const fs = require('fs');
const path = require('path');
const { hydrateSharedSlip } = require('./lib/share-hydrate');
const { decodeShareSlip, buildShareUrl } = require('./lib/share-slip');
const { renderShareSvg, safeAssetUrl, selectVisibleLegs } = require('./lib/share-renderer');
const APPROVED_WORDMARK_DATA_URI = require('./lib/approved-wordmark-data');

const imageCache = new Map();
let approvedShareWordmark = null;

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
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(3500) : undefined;
    const response = await fetch(url, {
      signal,
      headers:{
        accept:'image/avif,image/webp,image/png,image/jpeg,*/*',
        'user-agent':'Mozilla/5.0 (compatible; ParlayPing/1.0; +https://parlayping.net)',
        referer:'https://www.espn.com/',
      },
    });
    if (!response.ok) throw new Error(`image ${response.status}`);
    const type = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!['image/png','image/jpeg','image/jpg','image/webp'].includes(type)) throw new Error('unsupported image type');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 1_500_000) throw new Error('image too large');
    const uri = `data:${type};base64,${bytes.toString('base64')}`;
    if (imageCache.size > 96) imageCache.clear();
    imageCache.set(url, uri);
    return uri;
  } catch (error) {
    console.error('ParlayPing share-card asset embed failed', url, error?.message || error);
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

function approvedShareWordmarkDataUri() {
  if (approvedShareWordmark != null) return approvedShareWordmark;
  try {
    const bytes = fs.readFileSync(path.join(process.cwd(), 'parlayping-approved-wordmark.webp'));
    approvedShareWordmark = `data:image/webp;base64,${bytes.toString('base64')}`;
  } catch (error) {
    console.error('ParlayPing approved share wordmark read failed', error);
    approvedShareWordmark = null;
  }
  return approvedShareWordmark;
}

function inlineApprovedLockup(svg) {
  const source = String(svg || '');
  const href = approvedShareWordmarkDataUri();
  if (!href) return source;
  return source.replace(
    /<image\s+href="data:image\/svg\+xml;base64,[^"]+"\s+x="([^"]+)"\s+y="([^"]+)"\s+width="([^"]+)"\s+height="([^"]+)"[^>]*\/>/gi,
    (_match, rawX, rawY, rawWidth) => {
      const x = Number(rawX);
      const y = Number(rawY) - 3;
      const width = Math.min(302, Math.max(286, Number(rawWidth) * 0.95));
      const height = width * (54 / 220);
      const taglineY = y + height + 12;
      return `<g class="pp-approved-lockup"><image href="${href}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMinYMid meet"/><text x="${x+4}" y="${taglineY}" font-family="Arial,sans-serif" font-size="11.5" font-weight="900" letter-spacing="3.05" fill="#a9bfcd">COMPARE • TAIL • WIN TOGETHER</text></g>`;
    },
  );
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
      const image = sharp(bytes);
      const metadata = await image.metadata();
      const aspect = metadata.width && metadata.height ? metadata.width / metadata.height : 0;
      if (aspect >= 2.5) {
        output = output.split(dataUri).join(APPROVED_WORDMARK_DATA_URI);
        continue;
      }
      const png = await image.png({ compressionLevel:9, adaptiveFiltering:true }).toBuffer();
      output = output.split(dataUri).join(`data:image/png;base64,${png.toString('base64')}`);
    } catch (error) {
      console.error('ParlayPing WebP conversion failed', error);
    }
  }
  return output;
}

async function prepareShareSvg({ slip, context, pageUrl }) {
  const embedded = await embedVisibleAssets(slip, context);
  const raw = renderShareSvg({ slip:embedded, context, pageUrl });
  const withLockup = inlineApprovedLockup(raw);
  return rasterizeEmbeddedWebp(withLockup);
}

async function renderPng(svg) {
  try {
    const sharp = require('sharp');
    return await sharp(Buffer.from(String(svg), 'utf8'), { density:144 })
      .resize({ width:1200, height:675, fit:'fill' })
      .png({ compressionLevel:9, adaptiveFiltering:true })
      .toBuffer();
  } catch (sharpError) {
    console.error('ParlayPing sharp SVG renderer failed; falling back to Resvg', sharpError);
    const { Resvg } = require('@resvg/resvg-js');
    return Buffer.from(new Resvg(svg, {
      fitTo:{ mode:'width', value:1200 },
      font:{ loadSystemFonts:true },
    }).render().asPng());
  }
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
    const pageUrl = buildShareUrl(token, baseUrl);
    const svg = await prepareShareSvg({ slip:hydratedResult.slip, context, pageUrl });

    res.setHeader('Cache-Control', 'public, max-age=20, s-maxage=20, stale-while-revalidate=40');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (String(req.query?.format || '').toLowerCase() === 'svg') {
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(svg);
    }

    const png = await renderPng(svg);
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
module.exports.inlineApprovedLockup = inlineApprovedLockup;
module.exports.prepareShareSvg = prepareShareSvg;
module.exports.rasterizeEmbeddedWebp = rasterizeEmbeddedWebp;
module.exports.renderPng = renderPng;
