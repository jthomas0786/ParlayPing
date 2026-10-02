const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const vercelHandler = require('./api/index');

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';
const MAX_BODY_BYTES = 25 * 1024 * 1024;

const apiRoutes = new Map([
  ['/api/analyze', 'analyze'],
  ['/api/parse', 'parse'],
  ['/api/status', 'status'],
  ['/api/account', 'account'],
  ['/api/api-keys', 'api-keys'],
  ['/api/plans', 'plans'],
  ['/api/billing-checkout', 'billing-checkout'],
  ['/api/billing-portal', 'billing-portal'],
  ['/api/share-card', 'share-card'],
  ['/api/share-page', 'share-page'],
  ['/api/sportsbook-link', 'sportsbook-link'],
  ['/api/tracking-refresh', 'tracking-refresh'],
  ['/api/landing-create', 'landing-create'],
  ['/api/trending-build', 'trending-build'],
  ['/api/community-submit', 'community-submit'],
  ['/api/community-grade-worker', 'community-grade-worker'],
  ['/api/v1/analyze', 'v1-analyze'],
  ['/api/v1/build', 'v1-build'],
  ['/api/v1/share', 'v1-share'],
  ['/api/x-dry-run', 'x-dry-run'],
  ['/api/x-scheduler', 'x-scheduler'],
  ['/api/x-worker', 'x-worker'],
  ['/api/x-pulse-worker', 'x-pulse-worker'],
  ['/api/x-prop-observation-worker', 'x-prop-observation-worker'],
  ['/api/discovery-worker', 'discovery-worker']
]);

const redirects = new Map([
  ['/parlayping-approved-wordmark.webp', ['/brand/parlayping-wordmark.png', 307]],
  ['/parlayping-approved-lockup.svg', ['/brand/parlayping-wordmark.png', 307]],
  ['/parlayping-logo.svg', ['/brand/parlayping-wordmark.png', 307]],
  ['/parlayping-approved-logo.png', ['/brand/parlayping-wordmark.png', 307]],
  ['/parlayping-approved-builder-header.webp', ['/brand/parlayping-wordmark.png', 307]],
  ['/parlayping-mark.svg', ['/parlayping-approved-hero.webp', 308]],
  ['/favicon.svg', ['/parlayping-approved-hero.webp', 308]]
]);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4'
};

const blockedTopLevel = new Set([
  '.git', '.github', 'api', 'server', 'scripts', 'tests', 'sql', 'node_modules'
]);

const blockedFiles = new Set([
  '.env', '.env.example', '.gitignore', 'package.json', 'package-lock.json',
  'render.yaml', 'vercel.json', 'README.md', 'DEVELOPER_API.md', 'SHARE_CARD_SPEC.md'
]);

function secureHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function attachResponseHelpers(res) {
  res.status = function status(code) {
    res.statusCode = code;
    return res;
  };
  res.json = function json(value) {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(value));
    return res;
  };
  res.send = function send(value) {
    if (Buffer.isBuffer(value) || typeof value === 'string') {
      res.end(value);
    } else if (value == null) {
      res.end();
    } else {
      res.json(value);
    }
    return res;
  };
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  }
  return out;
}

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('Request body too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return undefined;
  const buffer = Buffer.concat(chunks);
  req.rawBody = buffer;
  const type = String(req.headers['content-type'] || '').toLowerCase();
  if (type.includes('application/json')) {
    try { return JSON.parse(buffer.toString('utf8')); } catch { return buffer.toString('utf8'); }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(buffer.toString('utf8')));
  }
  if (type.startsWith('text/')) return buffer.toString('utf8');
  return buffer;
}

function queryObject(url) {
  const result = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      result[key] = Array.isArray(result[key]) ? [...result[key], value] : [result[key], value];
    } else {
      result[key] = value;
    }
  }
  return result;
}

function dynamicRoute(pathname) {
  if (pathname === '/brand/parlayping-wordmark.png') return { route: 'brand-wordmark', params: {} };

  let match = pathname.match(/^\/verified\/([^/]+)$/);
  if (match) return { route: 'verified-page', params: { tweet: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/build\/([^/]+)$/);
  if (match) return { route: 'builder-page', params: { slip: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/slip\/([^/]+)$/);
  if (match) return { route: 'share-page', params: { slip: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/share\/([^/]+)\.png$/);
  if (match) return { route: 'share-card', params: { slip: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/share\/([^/]+)$/);
  if (match) return { route: 'share-page', params: { slip: decodeURIComponent(match[1]) } };

  const route = apiRoutes.get(pathname);
  return route ? { route, params: {} } : null;
}

function resolveStaticPath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\0')) return null;
  if (decoded === '/') decoded = '/index.html';

  const clean = decoded.replace(/^\/+/, '');
  const pieces = clean.split('/').filter(Boolean);
  if (!pieces.length) return null;
  if (blockedTopLevel.has(pieces[0]) || blockedFiles.has(clean)) return null;
  if (pieces.some((part) => part.startsWith('.'))) return null;

  const candidates = [clean];
  if (!path.extname(clean)) candidates.push(clean + '.html');

  for (const candidate of candidates) {
    const absolute = path.resolve(ROOT, candidate);
    if (!absolute.startsWith(ROOT + path.sep)) continue;
    try {
      const stat = fs.statSync(absolute);
      if (!stat.isFile()) continue;
      const ext = path.extname(absolute).toLowerCase();
      if (!mimeTypes[ext]) continue;
      return { absolute, ext };
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

async function handleApi(req, res, url, mapping) {
  attachResponseHelpers(res);
  req.query = { ...queryObject(url), ...mapping.params, __pp_route: mapping.route };
  req.cookies = parseCookies(req.headers.cookie);
  req.body = await readBody(req);
  return vercelHandler(req, res);
}

const server = http.createServer(async (req, res) => {
  secureHeaders(res);
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname;

  if (pathname === '/healthz') {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, service: 'ParlayPing', runtime: 'render-node' }));
  }

  const redirect = redirects.get(pathname);
  if (redirect) {
    res.statusCode = redirect[1];
    res.setHeader('Location', redirect[0]);
    return res.end();
  }

  const mapping = dynamicRoute(pathname);
  if (mapping) {
    try {
      return await handleApi(req, res, url, mapping);
    } catch (error) {
      console.error('ParlayPing Render request failed', error);
      if (!res.headersSent) {
        res.statusCode = error && error.statusCode ? error.statusCode : 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(JSON.stringify({ ok: false, error: res.statusCode === 413 ? 'Request body too large.' : 'ParlayPing request failed.' }));
      }
      return res.end();
    }
  }

  const file = resolveStaticPath(pathname);
  if (!file) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Not found');
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', mimeTypes[file.ext]);
  const stream = fs.createReadStream(file.absolute);
  stream.on('error', () => {
    if (!res.headersSent) res.statusCode = 500;
    res.end();
  });
  if (req.method === 'HEAD') return res.end();
  stream.pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`ParlayPing listening on http://${HOST}:${PORT}`);
});
