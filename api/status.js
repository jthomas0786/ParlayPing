module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Use GET.' });

  const xConfigured = Boolean(
    process.env.X_API_KEY &&
    process.env.X_API_SECRET &&
    process.env.X_ACCESS_TOKEN &&
    process.env.X_ACCESS_TOKEN_SECRET
  );
  const parserVisionConfigured = Boolean(process.env.OPENAI_API_KEY);
  const xApprovalRecorded = String(process.env.X_AI_REPLY_APPROVED || '').toLowerCase() === 'true';
  const autoReplyEnabled = String(process.env.X_AUTOREPLY_ENABLED || '').toLowerCase() === 'true';
  const workerProtected = Boolean(process.env.X_WORKER_SECRET);

  return res.status(200).json({
    ok: true,
    service: 'ParlayPing',
    version: '0.4.0',
    timestamp: new Date().toISOString(),
    engine: {
      ready: true,
      sport: 'NFL',
      source: 'The Sports Outpost NFL simulation + sportsbook snapshots'
    },
    parser: {
      textFallbackReady: true,
      visionConfigured: parserVisionConfigured
    },
    x: {
      username: process.env.X_USERNAME || 'ParlayPing',
      auth: 'oauth1-user-context',
      configured: xConfigured,
      approvalRecorded: xApprovalRecorded,
      autoReplyEnabled,
      postingReady: xConfigured && xApprovalRecorded && autoReplyEnabled,
      workerProtected
    },
    note: 'No secret values are exposed by this endpoint.'
  });
};
