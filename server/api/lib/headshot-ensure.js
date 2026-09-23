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

const ESPN_SEARCH_SPORT = {
  NFL:'football', NCAAF:'football', NBA:'basketball', WNBA:'basketball', NCAAB:'basketball',
  MLB:'baseball', NHL:'hockey', SOCCER:'soccer', TENNIS:'tennis', GOLF:'golf', MMA:'mma',
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

function compact(value) {
  return norm(value).replace(/\s+/g, '');
}

function teamMatches(a, b) {
  const x = compact(a);
  const y = compact(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
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

function objectStrings(value, depth = 0, out = []) {
  if (depth > 3 || value == null) return out;
  if (typeof value === 'string' || typeof value === 'number') {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 20)) objectStrings(item, depth + 1, out);
    return out;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value).slice(0, 50)) {
      if (/^(?:abbreviation|description|displayName|fullName|league|location|name|shortDisplayName|shortName|sport|subtitle|team|title|type)$/i.test(key)) {
        objectStrings(item, depth + 1, out);
      }
    }
  }
  return out;
}

function objectTeamScore(value, team) {
  if (!team) return 0;
  return objectStrings(value).some(text => teamMatches(team, text)) ? 4 : 0;
}

function objectSportScore(value, sport) {
  const upper = String(sport || '').toUpperCase();
  const terms = {
    NFL:['nfl','football'], NCAAF:['college football','ncaaf'], NBA:['nba'], WNBA:['wnba'], NCAAB:['college basketball','ncaab'],
    MLB:['mlb','baseball'], NHL:['nhl','hockey'], SOCCER:['soccer'], TENNIS:['tennis'], GOLF:['golf'], MMA:['mma','ufc'],
  }[upper] || [];
  const haystack = objectStrings(value).join(' ').toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 2 : 0), 0);
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

async function fetchJson(url, timeout = 4500, extraHeaders = {}) {
  const response = await fetch(url, {
    headers:{ accept:'application/json,text/plain,*/*', 'accept-language':'en-US,en;q=0.9', 'user-agent':'Mozilla/5.0 ParlayPing/1.0', ...extraHeaders },
    cache:'no-store',
    redirect:'follow',
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

async function searchEspnByName(playerName, sport, team = null) {
  const upper = String(sport || '').toUpperCase();
  const key = `espn:${upper}:${norm(playerName)}:${compact(team)}`;
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.value;

  const sportHint = ESPN_SEARCH_SPORT[upper];
  const urls = [
    `https://site.web.api.espn.com/apis/common/v3/search?region=us&lang=en&query=${encodeURIComponent(playerName)}&limit=20&mode=prefix&type=player&active=true`,
    `https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(playerName)}&limit=20${sportHint ? `&sport=${encodeURIComponent(sportHint)}` : ''}`,
    `https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(playerName)}&limit=20`,
  ];
  let answer = null;
  for (const url of urls) {
    try {
      const body = await fetchJson(url);
      const matches = collectNamedObjects(body, playerName)
        .sort((a,b) => (objectTeamScore(b, team) + objectSportScore(b, upper)) - (objectTeamScore(a, team) + objectSportScore(a, upper)));
      const candidates = [];
      for (const match of matches) {
        candidates.push(...objectImages(match));
        const id = objectId(match);
        if (id) candidates.push(espnHeadshot(upper, id));
      }
      answer = await firstWorking(candidates);
      if (answer) break;
    } catch (_) {}
  }
  if (searchCache.size > 512) searchCache.clear();
  searchCache.set(key, { ts:Date.now(), value:answer });
  return answer;
}

function sortByTeam(rows, team, accessor) {
  return [...rows].sort((a,b) => Number(teamMatches(team, accessor(b))) - Number(teamMatches(team, accessor(a))));
}

async function searchMlbByName(playerName, team = null) {
  const key = `mlb:${norm(playerName)}:${compact(team)}`;
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.value;
  let value = null;
  try {
    let body = await fetchJson(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(playerName)}&active=true&sportIds=1`);
    if (!Array.isArray(body?.people) || !body.people.length) {
      body = await fetchJson(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(playerName)}&sportIds=1`);
    }
    const matches = sortByTeam(
      (body?.people || []).filter(row => norm(row?.fullName) === norm(playerName)),
      team,
      row => row?.currentTeam?.abbreviation || row?.currentTeam?.name || '',
    );
    value = await firstWorking(matches.map(player => player?.id &&
      `https://img.mlbstatic.com/mlb-photos/image/upload/w_426,d_people:generic:headshot:silo:current.png,q_auto:best,f_auto/v1/people/${encodeURIComponent(String(player.id))}/headshot/silo/current`
    ));
  } catch (_) {}
  searchCache.set(key, { ts:Date.now(), value });
  return value;
}

async function searchNhlByName(playerName, team = null) {
  const key = `nhl:${norm(playerName)}:${compact(team)}`;
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.value;
  let value = null;
  try {
    const results = await fetchJson(`https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=20&active=true&q=${encodeURIComponent(playerName)}`);
    const matches = sortByTeam(
      (Array.isArray(results) ? results : []).filter(row => norm(row?.name || row?.fullName) === norm(playerName)),
      team,
      row => row?.teamAbbrev || row?.teamAbbreviation || row?.teamName || '',
    );
    for (const player of matches) {
      if (!player?.playerId) continue;
      const profile = await fetchJson(`https://api-web.nhle.com/v1/player/${encodeURIComponent(String(player.playerId))}/landing`);
      value = await firstWorking([profile?.headshot, profile?.heroImage]);
      if (value) break;
    }
  } catch (_) {}
  searchCache.set(key, { ts:Date.now(), value });
  return value;
}

function basketballSeason(sport, now = new Date()) {
  const year = now.getUTCFullYear();
  if (String(sport).toUpperCase() === 'WNBA') return String(year);
  const start = now.getUTCMonth() >= 6 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

function resultSetRows(body) {
  const set = body?.resultSets?.[0] || body?.resultSet || null;
  const headers = set?.headers || set?.Headers || [];
  const rows = set?.rowSet || set?.rows || [];
  if (!Array.isArray(headers) || !Array.isArray(rows)) return [];
  return rows.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

async function searchBasketballLeagueByName(playerName, sport, team = null) {
  const upper = String(sport || '').toUpperCase();
  if (!['NBA','WNBA'].includes(upper)) return null;
  const key = `${upper.toLowerCase()}:${norm(playerName)}:${compact(team)}`;
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.value;
  let value = null;
  try {
    const leagueId = upper === 'WNBA' ? '10' : '00';
    const season = basketballSeason(upper);
    const statsHost = upper === 'WNBA' ? 'https://stats.wnba.com' : 'https://stats.nba.com';
    const referer = upper === 'WNBA' ? 'https://www.wnba.com/' : 'https://www.nba.com/';
    const query = new URLSearchParams({ LeagueID:leagueId, Season:season, IsOnlyCurrentSeason:'1' });
    const body = await fetchJson(`${statsHost}/stats/commonallplayers?${query.toString()}`, 6500, {
      referer,
      origin:referer.replace(/\/$/, ''),
    });
    const matches = sortByTeam(
      resultSetRows(body).filter(row => norm(row?.DISPLAY_FIRST_LAST || row?.PLAYER_NAME || row?.DISPLAY_LAST_COMMA_FIRST) === norm(playerName)),
      team,
      row => row?.TEAM_ABBREVIATION || row?.TEAM_NAME || '',
    );
    const league = upper.toLowerCase();
    const size = upper === 'WNBA' ? '260x190' : '1040x760';
    value = await firstWorking(matches.map(row => row?.PERSON_ID &&
      `https://cdn.${league}.com/headshots/${league}/latest/${size}/${encodeURIComponent(String(row.PERSON_ID))}.png`
    ));
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

  const sport = String(leg?.sport || '').toUpperCase();
  const team = leg?.team || null;
  const espn = await searchEspnByName(playerName, sport, team);
  if (espn) return espn;

  if (sport === 'MLB') return searchMlbByName(playerName, team);
  if (sport === 'NHL') return searchNhlByName(playerName, team);
  if (sport === 'NBA' || sport === 'WNBA') return searchBasketballLeagueByName(playerName, sport, team);
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
  ESPN_SEARCH_SPORT,
  TRUSTED_IMAGE_HOSTS,
  norm,
  teamMatches,
  isTrustedImageUrl,
  probeImage,
  espnHeadshot,
  collectNamedObjects,
  searchEspnByName,
  searchMlbByName,
  searchNhlByName,
  searchBasketballLeagueByName,
  basketballSeason,
  resultSetRows,
  findFallbackHeadshot,
  ensureHeadshots,
};
