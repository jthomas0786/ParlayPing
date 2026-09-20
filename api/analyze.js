const { analyzeMultiSport } = require('./lib/sport-router');
const { applyCorrelationSafety, buildPublicReply } = require('./lib/analysis-safety');

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  return {};
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST.' });

  try {
    const body = parseBody(req);
    const legs = Array.isArray(body.legs) ? body.legs : [];
    if (!legs.length) return res.status(400).json({ ok: false, error: 'legs[] is required.' });
    if (legs.length > 20) return res.status(400).json({ ok: false, error: 'Maximum 20 legs per ping.' });
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'parlayping.net';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const raw = await analyzeMultiSport(legs, { baseUrl: `${proto}://${host}`, referenceTime: body.referenceTime || null });
    const result = applyCorrelationSafety(raw);
    result.replyText = buildPublicReply(result, { maxLegs: 4 });
    return res.status(200).json(result);
  } catch (error) {
    console.error('ParlayPing analyze error', error);
    return res.status(500).json({ ok: false, error: error?.message || 'Analysis failed.' });
  }
};
