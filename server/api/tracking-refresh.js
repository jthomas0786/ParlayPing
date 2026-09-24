const { requireUser } = require('./lib/supabase-account');
const { canonicalSlip } = require('./lib/share-slip');
const { hydrateSharedSlip } = require('./lib/share-hydrate');

const MAX_TRACKS_PER_REFRESH = 8;

function publicBaseUrl() {
  return String(process.env.PUBLIC_BASE_URL || 'https://parlayping.net').replace(/\/$/, '');
}

function normalizeLegStatus(value) {
  const status = String(value || 'PENDING').toUpperCase();
  return ['PENDING','LIVE','HIT','MISS','PUSH','VOID','UNRESOLVED'].includes(status) ? status : 'PENDING';
}

function summarizeTrackingSlip(slip) {
  const legs = Array.isArray(slip?.legs) ? slip.legs : [];
  const counts = { hit:0, miss:0, live:0, pending:0, push:0, void:0, unresolved:0 };
  for (const leg of legs) {
    const status = normalizeLegStatus(leg?.status);
    if (status === 'HIT') counts.hit++;
    else if (status === 'MISS') counts.miss++;
    else if (status === 'LIVE') counts.live++;
    else if (status === 'PUSH') counts.push++;
    else if (status === 'VOID') counts.void++;
    else if (status === 'UNRESOLVED') { counts.unresolved++; counts.pending++; }
    else counts.pending++;
  }

  let status = 'UPCOMING';
  if (counts.miss > 0) status = 'LOST';
  else if (legs.length && counts.hit + counts.push + counts.void === legs.length) status = 'WON';
  else if (counts.live > 0) status = 'LIVE';

  return {
    status,
    hitCount:counts.hit,
    missCount:counts.miss,
    liveCount:counts.live,
    pendingCount:counts.pending,
    pushCount:counts.push,
    voidCount:counts.void,
    unresolvedCount:counts.unresolved,
  };
}

async function refreshOne(track, options = {}) {
  const id = String(track?.id || '').trim().slice(0, 80);
  if (!id) throw new Error('Tracked parlay id is required.');
  const slip = canonicalSlip(track?.slip || {});
  const hydrated = await hydrateSharedSlip(slip, { baseUrl:options.baseUrl || publicBaseUrl() });
  const summary = summarizeTrackingSlip(hydrated.slip);
  return {
    id,
    ...summary,
    slip:hydrated.slip,
    liveDataAvailable:Boolean(hydrated.liveDataAvailable),
    refreshError:hydrated.error || null,
    refreshedAt:new Date().toISOString(),
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (String(req.method || '').toUpperCase() !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok:false, error:'Method not allowed.' });
  }

  try {
    await requireUser(req);
    const tracks = Array.isArray(req.body?.tracks) ? req.body.tracks : [];
    if (!tracks.length) return res.status(400).json({ ok:false, error:'At least one tracked parlay is required.' });
    if (tracks.length > MAX_TRACKS_PER_REFRESH) return res.status(400).json({ ok:false, error:`Refresh supports at most ${MAX_TRACKS_PER_REFRESH} tracked parlays at once.` });

    const results = [];
    for (const track of tracks) {
      try {
        results.push(await refreshOne(track));
      } catch (error) {
        results.push({ id:String(track?.id || '').trim().slice(0,80) || null, error:error?.message || 'Tracking refresh failed.' });
      }
    }
    return res.status(200).json({ ok:true, results });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status >= 400 && status < 600 ? status : 500).json({ ok:false, error:error?.message || 'Tracking refresh failed.' });
  }
};

module.exports.MAX_TRACKS_PER_REFRESH = MAX_TRACKS_PER_REFRESH;
module.exports.normalizeLegStatus = normalizeLegStatus;
module.exports.summarizeTrackingSlip = summarizeTrackingSlip;
module.exports.refreshOne = refreshOne;
