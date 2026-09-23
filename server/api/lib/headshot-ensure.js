const CACHE_MS = 5 * 60_000;
const searchCache = new Map();
const probeCache = new Map();

const ESPN_HEADSHOT_SLUGS = {
  NFL:'nfl',
  NCAAF:'college-football',
  NBA:'nba',
  WNBA:'wnba',
  NCAAB:'mens-college-basketball',
  MLB:'mlb',
  NHL:'nhl',
  SOCCER:'soccer',
  TENNIS:'tennis',
  GOLF:'golf',
  MMA:'mma',
};

const TRUSTED_IMAGE_HOSTS = [
  'espncdn.com',
  'espn.com',
  'nba.com',
  'wnba.com',
  'mlbstatic.com',
  'mlb.com',
  'nhle.com',
  'nhl.com',
  'nfl.com',
];

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[.'’]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isTrustedImageUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return TRUSTED_IMAGE_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

async function probeImage(url) {
  if (!isTrustedImageUrl(url)) return false;
  const cached = probeCache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.ok;
  let ok = false;
  try {
    const response = await fetch(url, {
      method:'GET',
      headers:{ accept:'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8', 'user-agent':'Mozilla/5.0 ParlayPing/1.0' },
      redirect:'follow',
      cache:'no-store',
      signal:AbortSignal.timeout(3500),
    });
    const type = String(response.headers.get('content-type') || '').toLowerCase();
    ok = response.ok && type.startsWith('image/');
    try { await response.body?.cancel(); } catch (_) {}
  } catch (_) {}
  if (probeCache.size > 512) probeCache.clear();
  probeCache.set(url, { ts:Date.now(), ok });
  return ok;
}

function espnHeadshot(sport, id) {
  const slug = ESPN_HEADSHOT_SLUGS[String(sport || '').toUpperCase()];
  const athleteId = String(id || '').trim();
  return slug && athleteId ? `https://a.espncdn.com/i/headshots/${slug}/players/full/${encodeURIComponent(athleteId)}.png` : null;
}

function objectImages(value) {
  if (!value || typeof value !== 'object') return [];
  const out = [];
  const add = candidate => {
    const raw = typeof candidate === 'string' ? candidate : candidate?.href || candidate?.url || candidate?.src;
    if (isTrustedImageUrl(raw)) out.push(raw);
  };
  add(value.headshot);
  add(value.image);
  add(value.photo);
  add(value.avatar);
  if (Array.isArray(value.images)) value.images.forEach(add);
  return out;
}

function objectId(value) {
  const direct = String(value?.id || value?.athleteId || value?.playerId || '').trim();
  if (/^\d+$/.test(direct)) return direct;
  const uid = String(value?.uid || '').trim();
  const match = uid.match(/~a:(\d+)/i);
  return match?.[1] || null;
}

function objectName(value) {
  return String(value?.displayName || value?.fullName || value?.name || value?.title || '').trim();
}

function collectNamedObjects(root, targetName) {
  const target = norm(targetName);
  const found = [];
  const seen = new Set();
  const visit = value => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (!Array.isArray(value)) {
      const name = objectName(value);
      if (name && norm(name) === target) found.push(value);
    }
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') visit(child);
    }
  };
  visit(root);
  return found;
}

async function fetchJson(url, timeout = 4500) {
  const response = await fetch(url, {
    headers:{ accept:'application/json,text/plain,*/*', 'accept-language':'en-US,en;q=0.9', 'user-agent':'okhttp/4.12.0' },
    cache:'no-store',
    signal:AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`Headshot lookup failed (${response.status})`);
  return response.json();
}

async function firstWorking(candidates) {
  for (const url of [...new Set((candidates || []).filter(isTrustedImageUrl))]) {
    if (await probeImage(url)) return url;
  }
  return null;
}

async function searchEspnByName(playerName, sport) {
  const key = `espn:${String(sport || '').toUpperCase()}:${norm(playerName)}`;
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.value;

  const urls = [
    `https://site.web.api.espn.com/apis/common/v3/search?region=us&lang=en&query=${encodeURIComponent(playerName)}&limit=10&mode=prefix&type=player&active=true`,
    `https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(playerName)}&limit=10`,
  ];
  let answer = null;
  for (const url of urls) {
    try {
      const body = await fetchJson(url);
      const matches = collectNamedObjects(body, playerName);
      const candidates = [];
      for (const match of matches) {
        candidates.push(...objectImages(match));
        const id = objectId(match);
        if (id) candidates.push(espnHeadshot(sport, id));
      }
      answer = await firstWorking(candidates);
      if (answer) break;
    } catch (_) {}
  }
  if (searchCache.size > 512) searchCache.clear();
  searchCache.set(key, { ts:Date.now(), value:answer });
  return answer;
}

async function searchMlbByName(playerName) {
  const key = `mlb:${norm(playerName)}`;
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.value;
  let value = null;
  try {
    const body = await fetchJson(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(playerName)}&active=true&sportIds=1`);
    const player = (body?.people || []).find(row => norm(row?.fullName) === norm(playerName));
    if (player?.id) {
      value = await firstWorking([
        `https://img.mlbstatic.com/mlb-photos/image/upload/w_426,d_people:generic:headshot:silo:current.png,q_auto:best,f_auto/v1/people/${encodeURIComponent(String(player.id))}/headshot/silo/current`,
      ]);
    }
  } catch (_) {}
  searchCache.set(key, { ts:Date.now(), value });
  return value;
}

async function searchNhlByName(playerName) {
  const key = `nhl:${norm(playerName)}`;
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.value;
  let value = null;
  try {
    const results = await fetchJson(`https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=20&active=true&q=${encodeURIComponent(playerName)}`);
    const player = (Array.isArray(results) ? results : []).find(row => norm(row?.name) === norm(playerName));
    if (player?.playerId) {
      const profile = await fetchJson(`https://api-web.nhle.com/v1/player/${encodeURIComponent(String(player.playerId))}/landing`);
      value = await firstWorking([profile?.headshot, profile?.heroImage]);
    }
  } catch (_) {}
  searchCache.set(key, { ts:Date.now(), value });
  return value;
}

async function findFallbackHeadshot(leg) {
  const playerName = String(leg?.player || leg?.selection || '').trim();
  if (!playerName) return null;

  const existing = [leg?.playerImageUrl, leg?.headshotUrl].filter(isTrustedImageUrl);
  const existingWorking = await firstWorking(existing);
  if (existingWorking) return existingWorking;

  const espn = await searchEspnByName(playerName, leg?.sport);
  if (espn) return espn;

  const sport = String(leg?.sport || '').toUpperCase();
  if (sport === 'MLB') return searchMlbByName(playerName);
  if (sport === 'NHL') return searchNhlByName(playerName);
  return null;
}

async function ensureHeadshots(slip) {
  const legs = Array.isArray(slip?.legs) ? slip.legs : [];
  const enriched = await Promise.all(legs.map(async leg => {
    try {
      const current = isTrustedImageUrl(leg?.playerImageUrl) ? leg.playerImageUrl : null;
      if (current && await probeImage(current)) return leg;
      const playerImageUrl = await findFallbackHeadshot(leg);
      return playerImageUrl ? { ...leg, playerImageUrl } : leg;
    } catch (_) {
      return leg;
    }
  }));
  return { ...slip, legs:enriched };
}

module.exports = {
  ESPN_HEADSHOT_SLUGS,
  TRUSTED_IMAGE_HOSTS,
  norm,
  isTrustedImageUrl,
  probeImage,
  espnHeadshot,
  collectNamedObjects,
  searchEspnByName,
  searchMlbByName,
  searchNhlByName,
  findFallbackHeadshot,
  ensureHeadshots,
};
