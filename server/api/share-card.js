const fs = require('fs');
const path = require('path');
const { hydrateSharedSlip } = require('./lib/share-hydrate');
const { enrichSportsbookMarkets } = require('./lib/sportsbook-enrich');
const { decodeShareSlip, buildShareUrl } = require('./lib/share-slip');
const { renderShareSvg, safeAssetUrl, selectVisibleLegs } = require('./lib/share-renderer');
const APPROVED_WORDMARK_DATA_URI = require('./lib/approved-wordmark-data');

const imageCache = new Map();
let approvedShareWordmark = null;
let shareFontPromise = null;
const SHARE_FONT_PATH = '/tmp/parlayping-inter.ttf';
const SHARE_FONT_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf';

function tokenFromRequest(req) {
  return String(req.query?.slip || req.query?.token || '').trim();
}

function requestBaseUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'parlayping.net';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

async function ensureShareFontFile() {
  if (fs.existsSync(SHARE_FONT_PATH)) return SHARE_FONT_PATH;
  if (shareFontPromise) return shareFontPromise;
  shareFontPromise = (async () => {
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined;
    const response = await fetch(SHARE_FONT_URL, {
      signal,
      headers: {
        accept: 'font/ttf,application/octet-stream,*/*',
        'user-agent': 'ParlayPing/1.0 (+https://parlayping.net)',
      },
      cache: 'force-cache',
    });
    if (!response.ok) throw new Error(`share font request failed (${response.status})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 50_000 || bytes.length > 2_000_000) throw new Error('share font payload is invalid');
    fs.writeFileSync(SHARE_FONT_PATH, bytes);
    return SHARE_FONT_PATH;
  })().catch(error => {
    shareFontPromise = null;
    throw error;
  });
  return shareFontPromise;
}

function forceShareFont(svg) {
  return String(svg || '')
    .replace(/font-family="[^"]*"/gi, 'font-family="Inter"')
    .replace(/font-family='[^']*'/gi, "font-family='Inter'");
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
        accept:'image/webp,image/png,image/jpeg,*/*;q=0.8',
        'user-agent':'Mozilla/5.0 (compatible; ParlayPing/1.0; +https://parlayping.net)',
        referer:'https://www.espn.com/',
      },
    });
    if (!response.ok) throw new Error(`image ${response.status}`);
    const type = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    let bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 1_500_000) throw new Error('image too large');
    let outputType = type;
    if (type === 'image/avif') {
      const sharp = require('sharp');
      bytes = await sharp(bytes).png({ compressionLevel:9, adaptiveFiltering:true }).toBuffer();
      outputType = 'image/png';
    }
    if (!['image/png','image/jpeg','image/jpg','image/webp'].includes(outputType)) throw new Error('unsupported image type');
    const uri = `data:${outputType};base64,${bytes.toString('base64')}`;
    if (imageCache.size > 96) imageCache.clear();
    imageCache.set(url, uri);
    return uri;
  } catch (error) {
    console.error('ParlayPing share-card asset embed failed', url, error?.message || error);
    imageCache.set(url, null);
    return null;
  }
}

function mlbOfficialPngHeadshot(leg = {}) {
  if (String(leg.sport || '').toUpperCase() !== 'MLB') return null;
  const id = String(leg.playerId || leg.mlbPlayerId || leg.officialPlayerId || '').trim();
  if (!/^\d+$/.test(id)) return null;
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_426,d_people:generic:headshot:silo:current.png,q_auto:best,f_png/v1/people/${encodeURIComponent(id)}/headshot/silo/current`;
}

function espnHeadshot(leg = {}) {
  const id = String(leg.espnPlayerId || '').trim();
  if (!/^\d+$/.test(id)) return null;
  const sport = String(leg.sport || '').toUpperCase();
  const slugs = { NFL:'nfl', NCAAF:'college-football', NBA:'nba', WNBA:'wnba', NCAAB:'mens-college-basketball', MLB:'mlb', NHL:'nhl' };
  const slug = slugs[sport];
  return slug ? `https://a.espncdn.com/i/headshots/${slug}/players/full/${encodeURIComponent(id)}.png` : null;
}

async function embeddedPlayerImage(leg = {}) {
  const candidates = [leg.playerImageUrl, leg.headshotUrl, mlbOfficialPngHeadshot(leg), espnHeadshot(leg)].filter(Boolean);
  for (const candidate of [...new Set(candidates)]) {
    const embedded = await imageDataUri(candidate);
    if (embedded) return embedded;
  }
  return null;
}

async function embedVisibleAssets(slip, context) {
  const legs = Array.isArray(slip?.legs) ? slip.legs.map(leg => ({ ...leg })) : [];
  const visible = selectVisibleLegs(legs, context, 6);
  await Promise.all(visible.map(async leg => {
    const index = Number(leg.__index);
    if (!Number.isInteger(index) || !legs[index]) return;
    const [playerImageUrl, teamLogoUrl] = await Promise.all([
      embeddedPlayerImage(legs[index]),
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
      return `<g class="pp-approved-lockup"><image href="${href}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMinYMid meet"/><text x="${x+4}" y="${taglineY}" font-family="Inter" font-size="11.5" font-weight="900" letter-spacing="3.05" fill="#a9bfcd">COMPARE • TAIL • WIN TOGETHER</text></g>`;
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
  const rasterSafe = await rasterizeEmbeddedWebp(withLockup);
  return forceShareFont(rasterSafe);
}

async function renderPng(svg) {
  const source = forceShareFont(svg);
  try {
    const fontFile = await ensureShareFontFile();
    const { Resvg } = require('@resvg/resvg-js');
    return Buffer.from(new Resvg(source, {
      fitTo:{ mode:'width', value:1200 },
      font:{
        loadSystemFonts:false,
        fontFiles:[fontFile],
        defaultFontFamily:'Inter',
        sansSerifFamily:'Inter',
        serifFamily:'Inter',
      },
    }).render().asPng());
  } catch (resvgError) {
    console.error('ParlayPing deterministic Resvg renderer failed; falling back to sharp', resvgError);
    const sharp = require('sharp');
    return await sharp(Buffer.from(source, 'utf8'), { density:144 })
      .resize({ width:1200, height:675, fit:'fill' })
      .png({ compressionLevel:9, adaptiveFiltering:true })
      .toBuffer();
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
    let displaySlip = hydratedResult.slip;
    try { displaySlip = await enrichSportsbookMarkets(displaySlip); } catch (_) {}
    const context = String(req.query?.context || '') === 'x_reply' ? 'x_reply' : 'share';
    const pageUrl = buildShareUrl(token, baseUrl);
    const svg = await prepareShareSvg({ slip:displaySlip, context, pageUrl });

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
module.exports.mlbOfficialPngHeadshot = mlbOfficialPngHeadshot;
module.exports.espnHeadshot = espnHeadshot;
module.exports.embeddedPlayerImage = embeddedPlayerImage;
module.exports.embedVisibleAssets = embedVisibleAssets;
module.exports.inlineApprovedLockup = inlineApprovedLockup;
module.exports.prepareShareSvg = prepareShareSvg;
module.exports.rasterizeEmbeddedWebp = rasterizeEmbeddedWebp;
module.exports.renderPng = renderPng;
module.exports.ensureShareFontFile = ensureShareFontFile;
module.exports.forceShareFont = forceShareFont;
