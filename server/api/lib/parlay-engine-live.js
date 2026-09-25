const base = require('./parlay-engine');
const { getNflLiveSnapshot, gameById, gameState, livePlayer, liveValue } = require('./nfl-live-feed');

function normalizeLiveMarket(value) {
  const raw = String(value || '').trim();
  const key = raw.replace(/[^a-zA-Z]/g, '').toLowerCase();
  const aliases = {
    receivingyards: 'recYds', recyards: 'recYds', recyds: 'recYds',
    rushingyards: 'rushYds', rushyards: 'rushYds', rushyds: 'rushYds',
    passingyards: 'passYds', passyards: 'passYds', passyds: 'passYds',
    rushingreceivingyards: 'rushRecYds', rushreceivingyards: 'rushRecYds', rushrecyds: 'rushRecYds',
    receptions: 'receptions', catches: 'receptions',
    passingtds: 'passTds', passtds: 'passTds',
    rushingtds: 'rushTds', rushtds: 'rushTds',
    receivingtds: 'recTds', rectds: 'recTds',
    completions: 'completions',
    anytimetd: 'atd', anytimetouchdown: 'atd', atd: 'atd'
  };
  return aliases[key] || raw;
}

function liveLegResult(row, current, state) {
  const market = normalizeLiveMarket(row?.market);
  if (market === 'atd') {
    if (current >= 1) return state === 'pre' ? 'PENDING' : 'HIT';
    return state === 'post' ? 'MISS' : state === 'in' ? 'LIVE' : 'PENDING';
  }
  const line = Number(row?.line);
  if (!Number.isFinite(line)) return state === 'post' ? 'MISS' : state === 'in' ? 'LIVE' : 'PENDING';
  const side = String(row?.side || 'over').toLowerCase();
  if (side === 'under') {
    if (state === 'post') return current < line ? 'HIT' : 'MISS';
    if (current >= line) return 'MISS';
    return state === 'in' ? 'LIVE' : 'PENDING';
  }
  const reached = row?.inclusive ? current >= line : current > line;
  if (reached && state !== 'pre') return 'HIT';
  if (state === 'post') return 'MISS';
  return state === 'in' ? 'LIVE' : 'PENDING';
}

function unavailableLiveResult(row, state, reason) {
  return {
    ...row,
    gameState: state,
    status: state === 'post' ? 'UNRESOLVED' : state === 'in' ? 'LIVE' : row?.status,
    current: null,
    liveData: false,
    liveDataUnavailable: true,
    liveDataUnavailableReason: reason,
  };
}

function overlayLiveResult(row, snapshot) {
  const liveGame = gameById(snapshot, row?.gameId);
  if (!liveGame) return row;
  const state = gameState(liveGame);
  if (state === 'pre') return { ...row, gameState: 'pre' };
  const market = normalizeLiveMarket(row?.market);
  const player = livePlayer(liveGame, row?.player, row?.team);
  if (!player) return unavailableLiveResult(row, state, 'player-not-found-in-live-box-score');
  const current = liveValue(player, market);
  if (!Number.isFinite(current)) return unavailableLiveResult(row, state, 'market-not-found-in-live-box-score');
  const status = liveLegResult(row, current, state);
  return {
    ...row,
    market,
    gameState: state,
    status,
    current,
    target: market === 'atd' ? 1 : row?.target ?? row?.line ?? null,
    probability: status === 'HIT' ? 1 : status === 'MISS' ? 0 : row?.probability ?? null,
    probabilityPct: status === 'HIT' ? 100 : status === 'MISS' ? 0 : row?.probabilityPct ?? null,
    liveData: true,
    liveDataGeneratedAt: snapshot?.generatedAt || null
  };
}

function summarize(results) {
  const pending = results.filter(row => row.status === 'PENDING');
  const combinedTailProbability = pending.length && pending.every(row => Number.isFinite(row.probability))
    ? pending.reduce((product, row) => product * row.probability, 1)
    : null;
  return {
    pending,
    combinedTailProbability,
    counts: {
      hit: results.filter(row => row.status === 'HIT').length,
      miss: results.filter(row => row.status === 'MISS').length,
      live: results.filter(row => row.status === 'LIVE').length,
      pending: pending.length,
      unresolved: results.filter(row => row.status === 'UNRESOLVED').length
    }
  };
}

async function analyzeSlip(rawLegs, options = {}) {
  const analysis = await base.analyzeSlip(rawLegs, options);
  let snapshot = null;
  try {
    snapshot = await getNflLiveSnapshot({ snapshot: options.liveSnapshot });
  } catch (error) {
    console.warn('ParlayPing NFL live feed fallback', error?.message || error);
  }
  if (!snapshot?.games) return analysis;

  const results = (analysis.results || []).map(row => row?.status === 'UNRESOLVED' ? row : overlayLiveResult(row, snapshot));
  const summary = summarize(results);
  const usedLive = results.some(row => row?.liveData);
  return {
    ...analysis,
    results,
    counts: summary.counts,
    combinedTailProbability: summary.combinedTailProbability,
    combinedTailProbabilityPct: Number.isFinite(summary.combinedTailProbability)
      ? Math.round(summary.combinedTailProbability * 1000) / 10
      : null,
    dataGeneratedAt: usedLive ? (snapshot.generatedAt || analysis.dataGeneratedAt || null) : analysis.dataGeneratedAt,
    source: usedLive
      ? 'The Sports Outpost NFL simulation + sportsbook snapshots + low-latency live stats'
      : analysis.source
  };
}

module.exports = {
  ...base,
  analyzeSlip,
  normalizeLiveMarket,
  liveLegResult,
  unavailableLiveResult,
  overlayLiveResult
};