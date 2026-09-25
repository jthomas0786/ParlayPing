const DEFAULT_LIVE_ENDPOINT = 'https://hjhfbhpuuxnrexddplxd.supabase.co/functions/v1/nfl-live';
const LIVE_TTL_MS = 12_000;
let cache = { ts: 0, value: null };

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

function normTeam(value) {
  const raw = String(value || '').toUpperCase().trim();
  return ({ LAR: 'LA', JAC: 'JAX', WAS: 'WSH', OAK: 'LV', SD: 'LAC', STL: 'LA' })[raw] || raw;
}

function number(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && value.includes('/')) return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function completions(value) {
  if (value == null) return null;
  const match = String(value).match(/^\s*(\d+)\s*\//);
  if (match) return Number(match[1]);
  return number(value);
}

async function getNflLiveSnapshot(options = {}) {
  if (options.snapshot) return options.snapshot;
  const now = Date.now();
  if (cache.value && now - cache.ts < LIVE_TTL_MS) return cache.value;
  const endpoint = String(process.env.NFL_LIVE_ENDPOINT || DEFAULT_LIVE_ENDPOINT).trim();
  if (!endpoint) return null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
  try {
    const response = await fetch(endpoint, {
      headers: { accept: 'application/json', 'user-agent': 'ParlayPing/0.1' },
      signal: controller?.signal
    });
    if (!response.ok) throw new Error(`NFL live feed returned ${response.status}`);
    const value = await response.json();
    if (!value || typeof value !== 'object' || !value.games) throw new Error('NFL live feed returned an invalid payload');
    cache = { ts: now, value };
    return value;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function gameById(snapshot, gameId) {
  if (!snapshot?.games || !gameId) return null;
  return snapshot.games[String(gameId)] || null;
}

function gameState(game) {
  const raw = String(game?.status || '').toLowerCase();
  if (['post', 'final', 'completed'].includes(raw)) return 'post';
  if (['in', 'live', 'inprogress', 'in-progress'].includes(raw)) return 'in';
  return 'pre';
}

function uniquePlayers(game) {
  const stats = game?.playerStats || {};
  const rows = [];
  const seen = new Set();
  for (const source of [stats.byId || {}, stats.byName || {}]) {
    for (const player of Object.values(source)) {
      if (!player || typeof player !== 'object') continue;
      const id = String(player.id || `${player.team || ''}|${player.name || ''}`);
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push(player);
    }
  }
  return rows;
}

function livePlayer(game, playerName, expectedTeam = null) {
  const wanted = normName(playerName);
  if (!wanted) return null;
  const team = expectedTeam ? normTeam(expectedTeam) : null;
  const candidates = uniquePlayers(game).filter(player => {
    const name = normName(player?.name);
    if (!(name === wanted || name.endsWith(` ${wanted}`) || wanted.endsWith(` ${name}`))) return false;
    if (team && normTeam(player?.team) && normTeam(player.team) !== team) return false;
    return true;
  });
  return candidates[0] || null;
}

function explicitNumber(flat, key) {
  if (!flat || !Object.prototype.hasOwnProperty.call(flat, key)) return null;
  return number(flat[key]);
}

function liveValue(player, market) {
  if (!player || typeof player !== 'object') return null;
  const flat = player.flat || {};
  switch (market) {
    case 'recYds': return explicitNumber(flat, 'recYds');
    case 'rushYds': return explicitNumber(flat, 'rushYds');
    case 'rushRecYds': {
      const rushYds = explicitNumber(flat, 'rushYds');
      const recYds = explicitNumber(flat, 'recYds');
      return Number.isFinite(rushYds) && Number.isFinite(recYds) ? rushYds + recYds : null;
    }
    case 'passYds': return explicitNumber(flat, 'passYds');
    case 'receptions': return explicitNumber(flat, 'receptions');
    case 'passTds': return explicitNumber(flat, 'passTds');
    case 'rushTds': return explicitNumber(flat, 'rushTds');
    case 'recTds': return explicitNumber(flat, 'recTds');
    case 'completions': return Object.prototype.hasOwnProperty.call(flat, 'compAtt') ? completions(flat.compAtt) : null;
    case 'atd': {
      const rushTds = explicitNumber(flat, 'rushTds');
      const recTds = explicitNumber(flat, 'recTds');
      return Number.isFinite(rushTds) && Number.isFinite(recTds) ? rushTds + recTds : null;
    }
    default: return explicitNumber(flat, market);
  }
}

function shortPlayerToken(value) {
  const parts = normName(value).split(' ').filter(Boolean);
  if (!parts.length) return '';
  const first = parts[0] || '';
  const last = parts[parts.length - 1] || '';
  return `${first.slice(0, 1)}${last}`;
}

function isTouchdownPlay(play) {
  const text = String(play?.text || '');
  const type = String(play?.type || '');
  return /touchdown/i.test(text) || /touchdown/i.test(type);
}

function finalAtdValue(game, playerName, expectedTeam = null) {
  if (gameState(game) !== 'post') return null;
  if (!Object.prototype.hasOwnProperty.call(game || {}, 'scoringPlays') || !Array.isArray(game?.scoringPlays)) return null;
  const player = livePlayer(game, playerName, expectedTeam);
  if (!player) return null;

  const team = expectedTeam ? normTeam(expectedTeam) : normTeam(player?.team);
  const wanted = normName(playerName);
  const token = shortPlayerToken(playerName);
  if (!wanted || !token) return null;

  const touchdownPlays = game.scoringPlays.filter(play => {
    if (!isTouchdownPlay(play)) return false;
    const playTeam = normTeam(play?.team);
    return !team || !playTeam || playTeam === team;
  });

  let matched = false;
  for (const play of touchdownPlays) {
    const text = normName(play?.text);
    if (!text) continue;
    const words = text.split(' ').filter(Boolean);
    if (text.includes(wanted) || words.includes(token)) {
      matched = true;
      break;
    }
  }
  if (!matched) return 0;

  const sameToken = uniquePlayers(game).filter(candidate => {
    if (team && normTeam(candidate?.team) && normTeam(candidate.team) !== team) return false;
    return shortPlayerToken(candidate?.name) === token;
  });
  return sameToken.length === 1 ? 1 : null;
}

function resetLiveCache() { cache = { ts: 0, value: null }; }

module.exports = {
  DEFAULT_LIVE_ENDPOINT,
  getNflLiveSnapshot,
  gameById,
  gameState,
  livePlayer,
  liveValue,
  finalAtdValue,
  normLiveName: normName,
  normLiveTeam: normTeam,
  resetLiveCache
};