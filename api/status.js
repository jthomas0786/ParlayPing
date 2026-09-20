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
    version: '0.9.0',
    timestamp: new Date().toISOString(),
    engine: {
      ready: true,
      sports: ['NFL','NCAAF','MLB','NHL','NBA','NCAAB','WNBA','SOCCER','TENNIS','MMA','ESPORTS','TABLE_TENNIS'],
      gradingModes: {
        fullOrLiveConnected: ['NFL','NCAAF','MLB','NHL','SOCCER','TENNIS','MMA'],
        basketball: ['NBA','NCAAB','WNBA'],
        pregameSportsbookOnly: ['ESPORTS','TABLE_TENNIS']
      },
      source: 'The Sports Outpost simulations, sportsbook snapshots, and connected live/final stat feeds',
      note: 'Soccer, Tennis and MMA have connected live/final grading. Esports and Table Tennis use real sportsbook pricing before start and remain unresolved after start until trustworthy grading feeds are connected.'
    },
    parser: {
      textFallbackReady: true,
      extendedSportsReady: true,
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
