const crypto = require('crypto');
const { extractApiKey, apiAuth } = require('../lib/api-key-auth');
const { canonicalSlip, encodeShareSlip, buildShareUrl, buildCardUrl } = require('../lib/share-slip');
const { buildBuilderUrl } = require('../lib/builder-url');

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function requestBaseUrl() {
  return String(process.env.PUBLIC_BASE_URL || 'https://parlayping.net').replace(/\/+$/, '');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Use POST.' });

  const apiKey = extractApiKey(req);
  if (!apiKey) return res.status(401).json({ ok:false, error:'ParlayPing API key required.' });
  const requestId = String(req.headers['x-request-id'] || crypto.randomUUID()).slice(0,120);
  res.setHeader('X-Request-Id', requestId);

  const auth = await apiAuth({ apiKey, endpoint:'/api/v1/share', requestId });
  if (!auth.ok) return res.status(auth.status).json(auth.payload);
  if (auth.payload?.monthlyLimit != null) res.setHeader('X-RateLimit-Monthly-Limit', String(auth.payload.monthlyLimit));
  if (auth.payload?.monthlyUsed != null) res.setHeader('X-RateLimit-Monthly-Used', String(auth.payload.monthlyUsed));
  if (auth.payload?.rateLimitPerMinute != null) res.setHeader('X-RateLimit-Minute-Limit', String(auth.payload.rateLimitPerMinute));
  if (auth.payload?.minuteUsed != null) res.setHeader('X-RateLimit-Minute-Used', String(auth.payload.minuteUsed));

  let statusCode = 500;
  try {
    const body = parseBody(req);
    const slip = canonicalSlip({
      ...body,
      legs: body.legs,
      source: body.source || 'ParlayPing API',
      returnUrl: body.returnUrl,
      returnLabel: body.returnLabel,
    });
    const token = encodeShareSlip(slip);
    const root = requestBaseUrl();
    const slipUrl = buildShareUrl(token, root);
    const launchUrl = buildBuilderUrl(token, root);
    const cardUrl = buildCardUrl(token, root);
    statusCode = 201;
    return res.status(201).json({
      ok:true,
      requestId,
      share:{
        token,
        url:slipUrl,
        launchUrl,
        slipUrl,
        cardUrl,
        legCount:slip.legs.length,
        createdAt:slip.createdAt,
        returnUrl:slip.returnUrl || null,
        returnLabel:slip.returnLabel || null,
      },
      api:{ version:'v1', plan:auth.payload?.plan || null },
    });
  } catch (error) {
    console.error('ParlayPing v1 share error', error);
    statusCode = /requires|supports|valid|configured|payload/i.test(error?.message || '') ? 400 : 500;
    return res.status(statusCode).json({ ok:false, error:error?.message || 'Share creation failed.', requestId });
  } finally {
    try { await apiAuth({ apiKey, endpoint:'/api/v1/share', requestId, action:'finalize', statusCode, metadata:{ version:'v1' } }); } catch (_) {}
  }
};

module.exports.parseBody = parseBody;
module.exports.requestBaseUrl = requestBaseUrl;
