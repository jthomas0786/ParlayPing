const crypto = require('crypto');
const zlib = require('zlib');

const MAX_SHARE_LEGS = 25;
const SHARE_TOKEN_PREFIX = 's1';
const MAX_COMPRESSED_BYTES = 48 * 1024;
const MAX_INFLATED_BYTES = 160 * 1024;
const DEFAULT_RETURN_ORIGINS = ['https://thesportsoutpost.com', 'https://www.thesportsoutpost.com'];

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function probabilityOrNull(value) {
  const n = finiteOrNull(value);
  return n != null && n >= 0 && n <= 1 ? n : null;
}

function cleanText(value, max = 180) {
  if (value == null) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function cleanUrl(value) {
  const text = cleanText(value, 1200);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function allowedReturnOrigins(value = process.env.PARLAYPING_ALLOWED_RETURN_ORIGINS) {
  const configured = String(value || '').split(',').map(x => x.trim()).filter(Boolean);
  const source = configured.length ? configured : DEFAULT_RETURN_ORIGINS;
  return new Set(source.map(origin => {
    try { return new URL(origin).origin; } catch { return null; }
  }).filter(Boolean));
}

function cleanReturnUrl(value, origins) {
  const text = cleanText(value, 1200);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:') return null;
    if (!allowedReturnOrigins(origins).has(url.origin)) return null;
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeStatus(value) {
  const raw = String(value || 'PENDING').toUpperCase();
  if (['PENDING', 'LIVE', 'HIT', 'MISS', 'PUSH', 'VOID', 'UNRESOLVED'].includes(raw)) return raw;
  return 'PENDING';
}

function normalizeSport(value) {
  return String(value || 'NFL').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 32) || 'NFL';
}

function canonicalLeg(input = {}, index = 0) {
  const line = finiteOrNull(input.line);
  const oddsAmerican = finiteOrNull(input.oddsAmerican ?? input.odds ?? input.price);
  const current = finiteOrNull(input.current ?? input.currentValue);
  const target = finiteOrNull(input.target ?? input.targetValue ?? line);
  const probability = probabilityOrNull(input.probability);
  const status = normalizeStatus(input.status ?? input.state);
  let pregameProbability = probabilityOrNull(input.pregameProbability);
  let liveProbability = probabilityOrNull(input.liveProbability);

  if (status === 'PENDING' && pregameProbability == null) pregameProbability = probability;
  if (status === 'LIVE' && liveProbability == null && String(input.probabilityKind || input.probabilitySource || '').toLowerCase().includes('live')) {
    liveProbability = probability;
  }

  return {
    id: cleanText(input.id, 80) || `leg-${index + 1}`,
    sport: normalizeSport(input.sport),
    player: cleanText(input.player ?? input.playerName, 120),
    playerId: cleanText(input.playerId ?? input.player_id, 100),
    playerImageUrl: cleanUrl(input.playerImageUrl ?? input.player_image_url ?? input.headshotUrl ?? input.photo),
    team: cleanText(input.team, 32),
    teamLogoUrl: cleanUrl(input.teamLogoUrl ?? input.team_logo_url ?? input.logoUrl),
    gameId: cleanText(input.gameId ?? input.eventId ?? input.event_id ?? input.game_pk, 120),
    matchup: cleanText(input.matchup, 120),
    market: cleanText(input.market ?? input.prop_key ?? input.propKey, 120),
    displayMarket: cleanText(input.displayMarket ?? input.selectionText, 180),
    side: cleanText(input.side ?? input.selection, 24),
    line,
    inclusive: Boolean(input.inclusive),
    originalText: cleanText(input.originalText, 300),
    oddsAmerican,
    sportsbook: cleanText(input.sportsbook ?? input.book ?? input.bookName, 80),
    sportsbookLink: cleanUrl(input.sportsbookLink ?? input.link ?? input.deepLink),
    status,
    pregameProbability,
    liveProbability,
    probabilitySource: cleanText(input.probabilitySource ?? input.probabilityKind, 80),
    current,
    target,
    unit: cleanText(input.unit, 40),
    progressText: cleanText(input.progressText, 120),
    startTimeUTC: cleanText(input.startTimeUTC, 80),
  };
}

function canonicalSlip(input = {}) {
  const rows = Array.isArray(input.legs) ? input.legs : [];
  if (!rows.length) throw new Error('A shared slip requires at least one leg.');
  if (rows.length > MAX_SHARE_LEGS) throw new Error(`A shared slip supports at most ${MAX_SHARE_LEGS} legs.`);
  const legs = rows.map(canonicalLeg).filter(row => row.player && row.market);
  if (!legs.length) throw new Error('No valid share legs were provided.');

  const combinedOddsAmerican = finiteOrNull(input.combinedOddsAmerican ?? input.parlayOddsAmerican ?? input.parlayOdds);
  const returnUrl = cleanReturnUrl(input.returnUrl ?? input.return_url);
  return {
    v: 1,
    createdAt: cleanText(input.createdAt, 80) || new Date().toISOString(),
    source: cleanText(input.source, 120) || 'ParlayPing',
    sourceReference: cleanText(input.sourceReference, 180),
    returnUrl,
    returnLabel: returnUrl ? (cleanText(input.returnLabel ?? input.return_label, 80) || 'The Sports Outpost') : null,
    sportsbook: cleanText(input.sportsbook ?? input.book ?? input.bookName, 80),
    combinedOddsAmerican,
    combinedOddsVerified: combinedOddsAmerican != null ? input.combinedOddsVerified !== false : false,
    legs,
  };
}

function shareSecret(secret = process.env.PARLAYPING_SHARE_SECRET) {
  const value = String(secret || '');
  if (value.length < 32) throw new Error('PARLAYPING_SHARE_SECRET must be configured with at least 32 characters.');
  return value;
}

function signPayload(payload, secret) {
  return crypto.createHmac('sha256', shareSecret(secret)).update(payload).digest().subarray(0, 18).toString('base64url');
}

function encodeShareSlip(input, secret) {
  const slip = canonicalSlip(input);
  const json = Buffer.from(JSON.stringify(slip), 'utf8');
  const compressed = zlib.deflateRawSync(json, { level: 9 });
  if (compressed.length > MAX_COMPRESSED_BYTES) throw new Error('Shared slip payload is too large.');
  const payload = compressed.toString('base64url');
  const signature = signPayload(payload, secret);
  return `${SHARE_TOKEN_PREFIX}.${payload}.${signature}`;
}

function decodeShareSlip(token, secret) {
  const value = String(token || '');
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== SHARE_TOKEN_PREFIX) throw new Error('Invalid ParlayPing share token.');
  const [, payload, signature] = parts;
  const expected = signPayload(payload, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw new Error('Invalid ParlayPing share signature.');
  const compressed = Buffer.from(payload, 'base64url');
  if (compressed.length > MAX_COMPRESSED_BYTES) throw new Error('Shared slip payload is too large.');
  const inflated = zlib.inflateRawSync(compressed, { maxOutputLength: MAX_INFLATED_BYTES });
  const parsed = JSON.parse(inflated.toString('utf8'));
  return canonicalSlip(parsed);
}

function baseUrl(value) {
  return String(value || process.env.PUBLIC_BASE_URL || 'https://parlayping.net').replace(/\/$/, '');
}

function buildShareUrl(token, value) {
  return `${baseUrl(value)}/slip/${encodeURIComponent(token)}`;
}

function buildCardUrl(token, value) {
  return `${baseUrl(value)}/share/${encodeURIComponent(token)}.png`;
}

function inferUnit(leg) {
  if (leg.unit) return leg.unit;
  const market = String(leg.market || leg.displayMarket || '').toLowerCase();
  if (/yard/.test(market) || /yds?/.test(market)) return 'yards';
  if (/reception|catch/.test(market)) return 'receptions';
  if (/strikeout|\bk\b/.test(market)) return 'strikeouts';
  if (/assist/.test(market)) return 'assists';
  if (/rebound/.test(market)) return 'rebounds';
  if (/point/.test(market)) return 'points';
  if (/touchdown|\batd\b|\btd\b/.test(market)) return 'TDs';
  if (/goal/.test(market)) return 'goals';
  if (/shot/.test(market)) return 'shots';
  return null;
}

function formatProgress(leg) {
  if (leg.progressText) return leg.progressText;
  if (leg.current == null || leg.target == null) return null;
  const unit = inferUnit(leg);
  const current = Number.isInteger(leg.current) ? String(leg.current) : String(Math.round(leg.current * 10) / 10);
  const target = Number.isInteger(leg.target) ? String(leg.target) : String(Math.round(leg.target * 10) / 10);
  return `${current} / ${target}${unit ? ` ${unit}` : ''}`;
}

function resultKey(row) {
  return [row?.id, row?.sport, row?.player, row?.market, row?.side, row?.line]
    .map(value => String(value ?? '').trim().toLowerCase())
    .join('|');
}

function mergeAnalysisIntoSlip(slipInput, analysis = {}) {
  const slip = canonicalSlip(slipInput);
  const results = Array.isArray(analysis.results) ? analysis.results : [];
  const byId = new Map(results.filter(row => row?.id).map(row => [String(row.id), row]));
  const byKey = new Map(results.map(row => [resultKey(row), row]));

  const legs = slip.legs.map((leg, index) => {
    const result = byId.get(String(leg.id)) || byKey.get(resultKey(leg)) || results[index] || null;
    if (!result) return { ...leg, progressText: formatProgress(leg) };

    const status = normalizeStatus(result.status);
    const probability = probabilityOrNull(result.probability);
    let pregameProbability = leg.pregameProbability;
    let liveProbability = probabilityOrNull(result.liveProbability);
    let probabilitySource = cleanText(result.probabilitySource ?? result.probabilityKind, 80) || leg.probabilitySource;

    if (status === 'PENDING' && probability != null) {
      pregameProbability = probability;
      probabilitySource = probabilitySource || 'pregame_model';
    }

    const resultLooksExplicitlyLive = /live/i.test(String(result.probabilityKind || result.probabilitySource || ''));
    const verifiedNflLiveModel = normalizeSport(result.sport || leg.sport) === 'NFL' && String(result.gameState || '').toLowerCase() === 'in';
    if (status === 'LIVE' && liveProbability == null && probability != null && (resultLooksExplicitlyLive || verifiedNflLiveModel)) {
      liveProbability = probability;
      probabilitySource = resultLooksExplicitlyLive ? (probabilitySource || 'live_model') : 'live_model_nfl_rest_of_game_sim';
    }

    const current = finiteOrNull(result.current ?? leg.current);
    const target = finiteOrNull(result.target ?? leg.target ?? leg.line);
    const next = {
      ...leg,
      gameId: cleanText(result.gameId, 120) || leg.gameId,
      matchup: cleanText(result.matchup, 120) || leg.matchup,
      displayMarket: cleanText(result.displayMarket, 180) || leg.displayMarket,
      status,
      pregameProbability,
      liveProbability,
      probabilitySource,
      current,
      target,
      unit: leg.unit || inferUnit({ ...leg, ...result }),
      startTimeUTC: cleanText(result.startTimeUTC, 80) || leg.startTimeUTC,
    };
    next.progressText = cleanText(result.progressText, 120) || formatProgress(next);
    return next;
  });

  return {
    ...slip,
    analysisGeneratedAt: cleanText(analysis.generatedAt, 80),
    dataGeneratedAt: cleanText(analysis.dataGeneratedAt, 80),
    analysisSource: cleanText(analysis.source, 240),
    legs,
  };
}

module.exports = {
  MAX_SHARE_LEGS,
  SHARE_TOKEN_PREFIX,
  DEFAULT_RETURN_ORIGINS,
  canonicalLeg,
  canonicalSlip,
  encodeShareSlip,
  decodeShareSlip,
  buildShareUrl,
  buildCardUrl,
  mergeAnalysisIntoSlip,
  formatProgress,
  inferUnit,
  probabilityOrNull,
  finiteOrNull,
  cleanReturnUrl,
  allowedReturnOrigins,
};
