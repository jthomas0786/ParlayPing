const { parseSlip } = require('./lib/slip-parser');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Use POST.' });

  const workerSecret = process.env.X_WORKER_SECRET;
  const supplied = req.headers['x-parlayping-secret'];
  if (!workerSecret || supplied !== workerSecret) {
    return res.status(401).json({ ok:false, error:'Unauthorized.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const result = await parseSlip({
      text: body.text || '',
      mediaUrls: Array.isArray(body.mediaUrls) ? body.mediaUrls : []
    });
    return res.status(200).json({ ok:true, ...result });
  } catch (error) {
    return res.status(500).json({ ok:false, error:error?.message || 'Parse failed.' });
  }
};
