const DATA_ROOT = 'https://raw.githubusercontent.com/jthomas0786/The-Sports-Outpost/main/slates';
const SNAPSHOT_TTL_MS = 20_000;
const cache = new Map();

const MARKET_ALIASES = {
  receivingyards: 'recYds', recyards: 'recYds', recyds: 'recYds', recyd: 'recYds', recyds_: 'recYds', recYds: 'recYds',
  rushingyards: 'rushYds', rushyards: 'rushYds', rushyds: 'rushYds', rushYds: 'rushYds',
  passingyards: 'passYds', passyards: 'passYds', passyds: 'passYds', passYds: 'passYds',
  receptions: 'receptions', catches: 'receptions',
  passingtds: 'passTds', passtds: 'passTds', passTds: 'passTds',
  completions: 'completions',
  anytimeTD: 'atd', anytimetd: 'atd', anytime_touchdown: 'atd', atd: 'atd'
};

const MARKET_LABELS = {
  recYds: 'REC YDS', rushYds: 'RUSH YDS', passYds: 'PASS YDS', receptions: 'REC', passTds: 'PASS TD', completions: 'COMP', atd: 'ATD'
};

async function fetchJson(name) {
  const now = Date.now();
  const hit = cache.get(name);
  if (hit && now - hit.ts < SNAPSHOT_TTL_MS) return hit.value;
  const response = await fetch(`${DATA_ROOT}/${name}`, { headers: { 'user-agent': 'ParlayPing/0.1' } });
  if (!response.ok) throw new Error(`Unable to load ${name}: ${response.status}`);
  const value = await response.json();
  cache.set(name, { ts: now, value });
  return value;
}

async function loadSnapshots() {
  const [sim, odds, slate] = await Promise.all([
    fetchJson('nfl-sim.json'),
    fetchJson('nfl-odds.json'),
    fetchJson('nfl.json')
  ]);
  return { sim, odds, slate };
}

function normName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[.'’]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeMarket(value) {
  const raw = String(value || '').trim();
  if (MARKET_LABELS[raw]) return raw;
  const key = raw.replace(/[^a-zA-Z]/g, '').toLowerCase();
  return MARKET_ALIASES[raw] || MARKET_ALIASES[key] || raw;
}

function normalizeLeg(input, index = 0) {
  const market = normalizeMarket(input.market);
  const side = market === 'atd' ? 'yes' : String(input.side || 'over').toLowerCase();
  const line = market === 'atd' ? 0.5 : Number(input.line);
  return {
    id: input.id || `leg-${index + 1}`,
    sport: String(input.sport || 'NFL').toUpperCase(),
    player: String(input.player || '').trim(),
    team: input.team ? String(input.team).toUpperCase() : null,
    gameId: input.gameId ? String(input.gameId) : null,
    market,
    side,
    line: Number.isFinite(line) ? line : null,
    inclusive: Boolean(input.inclusive),
    originalText: input.originalText || null
  };
}

function findPlayerGame(sim, leg) {
  const wanted = normName(leg.player);
  if (!wanted) return null;
  const games = Array.isArray(sim?.games) ? sim.games : [];
  const candidates = [];
  for (const game of games) {
    if (leg.gameId && String(game?.game?.gameId || '') !== leg.gameId) continue;
    for (const player of game?.players || []) {
      const n = normName(player?.name);
      if (!n) continue;
      if (n === wanted || n.endsWith(` ${wanted}`) || wanted.endsWith(` ${n}`)) {
        if (!leg.team || String(player.team || '').toUpperCase() === leg.team) candidates.push({ game, player });
      }
    }
  }
  return candidates[0] || null;
}

function findOddsPlayer(odds, leg, simMatch) {
  const wanted = normName(leg.player);
  const gameId = leg.gameId || String(simMatch?.game?.game?.gameId || '');
  for (const game of odds?.games || []) {
    if (gameId && String(game.gameId || '') !== gameId) continue;
    for (const player of game.players || []) {
      if (normName(player.name) === wanted || normName(player.name).endsWith(` ${wanted}`) || wanted.endsWith(` ${normName(player.name)}`)) {
        if (!leg.team || String(player.team || '').toUpperCase() === leg.team) return { game, player };
      }
    }
  }
  return null;
}

function findSlateGame(slate, gameId) {
  return (slate?.games || []).find(g => String(g.gameId) === String(gameId)) || null;
}

function clamp(v, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, v)); }
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}
function normalCdf(x, mean, sd) {
  if (!Number.isFinite(sd) || sd <= 0) return x < mean ? 0 : 1;
  return 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2)));
}

function probabilityFromDistribution(player, market, line, side) {
  if (market === 'atd') return clamp(Number(player?.probabilities?.atd ?? 0));
  const exact = player?.sportsbook?.[side]?.[market];
  if (exact && Number.isFinite(Number(exact.line)) && Math.abs(Number(exact.line) - Number(line)) < 0.01 && Number.isFinite(Number(exact.probability))) {
    return clamp(Number(exact.probability));
  }
  const d = player?.distributions?.[market];
  if (!d || !Number.isFinite(Number(d.mean))) return null;
  const p10 = Number(d.p10), p90 = Number(d.p90), mean = Number(d.mean);
  let sd = (p90 - p10) / 2.563103;
  if (!Number.isFinite(sd) || sd <= 0) sd = Math.max(0.75, Math.abs(Number(d.p75) - Number(d.p25)) / 1.349 || 1);
  const over = 1 - normalCdf(Number(line), mean, sd);
  return clamp(side === 'under' ? 1 - over : over);
}

function currentValue(player, market) {
  if (market === 'atd') return Number(player?.current?.rushTds || 0) + Number(player?.current?.recTds || 0);
  const v = Number(player?.current?.[market]);
  return Number.isFinite(v) ? v : 0;
}

function gameState(game, slateGame) {
  const raw = String(game?.game?.liveStatus || slateGame?.status || 'pre').toLowerCase();
  if (['post', 'final', 'completed'].includes(raw)) return 'post';
  if (['in', 'live', 'inprogress'].includes(raw)) return 'in';
  return 'pre';
}

function legResult(leg, current, state) {
  if (leg.market === 'atd') {
    if (current >= 1) return state === 'pre' ? 'PENDING' : 'HIT';
    return state === 'post' ? 'MISS' : state === 'in' ? 'LIVE' : 'PENDING';
  }
  if (!Number.isFinite(leg.line)) return state === 'in' ? 'LIVE' : state === 'post' ? 'FINAL' : 'PENDING';
  if (leg.side === 'under') {
    if (state === 'post') return current < leg.line ? 'HIT' : 'MISS';
    if (current >= leg.line) return 'MISS';
    return state === 'in' ? 'LIVE' : 'PENDING';
  }
  const reached = leg.inclusive ? current >= leg.line : current > leg.line;
  if (reached && state !== 'pre') return 'HIT';
  if (state === 'post') return 'MISS';
  return state === 'in' ? 'LIVE' : 'PENDING';
}

function americanImplied(price) {
  const n = Number(price);
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? 100 / (n + 100) : (-n) / ((-n) + 100);
}

function buildMarketOptions(leg, simPlayer, oddsPlayer) {
  const market = oddsPlayer?.odds?.[leg.market];
  if (!market) return [];
  if (leg.market === 'atd') {
    const best = market.best || null;
    return [{ line: null, side: 'yes', probability: probabilityFromDistribution(simPlayer, 'atd', 0.5, 'over'), book: best?.book || null, price: best?.price ?? null, link: best?.link || null }];
  }
  const rows = [];
  const pushRow = row => {
    const line = Number(row?.line);
    if (!Number.isFinite(line)) return;
    const sideData = row?.[leg.side];
    if (!sideData) return;
    const best = sideData.best || null;
    rows.push({
      line,
      side: leg.side,
      probability: probabilityFromDistribution(simPlayer, leg.market, line, leg.side),
      impliedProbability: americanImplied(best?.price),
      book: best?.book || null,
      price: best?.price ?? null,
      link: best?.link || null
    });
  };
  pushRow(market);
  for (const alt of market.alternates || []) pushRow(alt);
  const seen = new Set();
  return rows
    .filter(r => { const k = `${r.line}:${r.side}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.line - b.line);
}

function pct(v) { return Number.isFinite(v) ? Math.round(v * 1000) / 10 : null; }
function formatLine(leg) {
  if (leg.market === 'atd') return 'ATD';
  if (!Number.isFinite(leg.line)) return MARKET_LABELS[leg.market] || leg.market;
  if (leg.inclusive && leg.side !== 'under') return `${leg.line}+ ${MARKET_LABELS[leg.market] || leg.market}`;
  return `${leg.side === 'under' ? 'U' : 'O'}${leg.line} ${MARKET_LABELS[leg.market] || leg.market}`;
}

function encodeSlip(legs) {
  return Buffer.from(JSON.stringify({ v: 1, legs }), 'utf8').toString('base64url');
}

function compactReply(results, combinedTailProbability, tailUrl) {
  const lines = results.slice(0, 6).map(r => {
    const icon = r.status === 'HIT' ? '✅' : r.status === 'MISS' ? '❌' : r.status === 'LIVE' ? '🔴' : '⏳';
    const progress = r.status === 'LIVE' ? ` ${r.current}/${r.target}` : '';
    const prob = (r.status === 'LIVE' || r.status === 'PENDING') && Number.isFinite(r.probability) ? ` · ${Math.round(r.probability * 100)}%` : '';
    return `${icon} ${r.player} ${r.displayMarket}${progress}${prob}`;
  });
  if (Number.isFinite(combinedTailProbability)) lines.push(`🎯 Remaining: ${Math.round(combinedTailProbability * 100)}%`);
  if (tailUrl) lines.push(`Tail what's left → ${tailUrl}`);
  return lines.join('\n');
}

async function analyzeSlip(rawLegs, options = {}) {
  const legs = (Array.isArray(rawLegs) ? rawLegs : []).slice(0, 20).map(normalizeLeg).filter(l => l.sport === 'NFL' && l.player && l.market);
  if (!legs.length) throw new Error('No supported NFL player-prop legs were provided.');
  const { sim, odds, slate } = await loadSnapshots();
  const results = [];

  for (const leg of legs) {
    const simMatch = findPlayerGame(sim, leg);
    if (!simMatch) {
      results.push({ ...leg, status: 'UNRESOLVED', displayMarket: formatLine(leg), probability: null, current: null, target: leg.line, marketOptions: [] });
      continue;
    }
    const gameId = String(simMatch.game?.game?.gameId || '');
    const slateGame = findSlateGame(slate, gameId);
    const state = gameState(simMatch.game, slateGame);
    const current = currentValue(simMatch.player, leg.market);
    const status = legResult(leg, current, state);
    const probability = status === 'HIT' ? 1 : status === 'MISS' ? 0 : probabilityFromDistribution(simMatch.player, leg.market, leg.line, leg.side === 'yes' ? 'over' : leg.side);
    const oddsMatch = findOddsPlayer(odds, { ...leg, gameId }, simMatch);
    const marketOptions = state === 'pre' ? buildMarketOptions(leg, simMatch.player, oddsMatch?.player) : [];
    results.push({
      ...leg,
      gameId,
      matchup: `${simMatch.game?.game?.away?.abbr || slateGame?.away?.abbr || ''} @ ${simMatch.game?.game?.home?.abbr || slateGame?.home?.abbr || ''}`.trim(),
      startTimeUTC: oddsMatch?.game?.startDateUTC || slateGame?.startTimeUTC || null,
      gameState: state,
      status,
      displayMarket: formatLine(leg),
      current,
      target: leg.market === 'atd' ? 1 : leg.line,
      probability,
      probabilityPct: pct(probability),
      marketOptions
    });
  }

  const tailable = results.filter(r => r.status === 'PENDING');
  const combinedTailProbability = tailable.length && tailable.every(r => Number.isFinite(r.probability))
    ? tailable.reduce((p, r) => p * r.probability, 1)
    : null;
  const token = encodeSlip(legs);
  const baseUrl = String(options.baseUrl || 'https://parlayping.net').replace(/\/$/, '');
  const tailUrl = tailable.length ? `${baseUrl}/tail?slip=${encodeURIComponent(token)}` : null;
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    dataGeneratedAt: sim?.generatedAt || null,
    source: 'The Sports Outpost NFL simulation + sportsbook snapshots',
    results,
    counts: {
      hit: results.filter(r => r.status === 'HIT').length,
      miss: results.filter(r => r.status === 'MISS').length,
      live: results.filter(r => r.status === 'LIVE').length,
      pending: tailable.length,
      unresolved: results.filter(r => r.status === 'UNRESOLVED').length
    },
    combinedTailProbability,
    combinedTailProbabilityPct: pct(combinedTailProbability),
    tailUrl,
    replyText: compactReply(results, combinedTailProbability, tailUrl)
  };
}

module.exports = { analyzeSlip, normalizeLeg, encodeSlip };
