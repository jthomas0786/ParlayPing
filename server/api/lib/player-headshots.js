const { probeImage, headshotUrl, normName, teamMatches } = require('./share-assets');

const CACHE_MS = 15 * 60 * 1000;
const lookupCache = new Map();
const jsonCache = new Map();
const textCache = new Map();

const ESPN_SEARCH_SPORT = {
  NFL:'football', NCAAF:'football', NBA:'basketball', WNBA:'basketball', NCAAB:'basketball',
  MLB:'baseball', NHL:'hockey', SOCCER:'soccer', TENNIS:'tennis', MMA:'mma', UFC:'mma', GOLF:'golf',
};

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function cacheGet(map, key) {
  const hit = map.get(key);
  return hit && Date.now() - hit.ts < CACHE_MS ? hit.value : undefined;
}

function cacheSet(map, key, value, max = 256) {
  if (map.size >= max) map.clear();
  map.set(key, { ts:Date.now(), value });
  return value;
}

async function fetchJson(url, options = {}) {
  const key = `json:${url}`;
  const cached = cacheGet(jsonCache, key);
  if (cached !== undefined) return cached;
  try {
    const response = await fetch(url, {
      headers:{
        accept:'application/json,text/plain,*/*',
        'accept-language':'en-US,en;q=0.9',
        'user-agent':'Mozilla/5.0 ParlayPing/1.0',
        ...(options.headers || {}),
      },
      redirect:'follow',
      cache:'no-store',
      signal:AbortSignal.timeout(options.timeout || 5000),
    });
    if (!response.ok) return cacheSet(jsonCache, key, null);
    return cacheSet(jsonCache, key, await response.json());
  } catch (_) {
    return cacheSet(jsonCache, key, null);
  }
}

async function fetchText(url, options = {}) {
  const key = `text:${url}`;
  const cached = cacheGet(textCache, key);
  if (cached !== undefined) return cached;
  try {
    const response = await fetch(url, {
      headers:{ 'user-agent':'Mozilla/5.0 ParlayPing/1.0', ...(options.headers || {}) },
      redirect:'follow',
      cache:'no-store',
      signal:AbortSignal.timeout(options.timeout || 7000),
    });
    if (!response.ok) return cacheSet(textCache, key, null, 12);
    return cacheSet(textCache, key, await response.text(), 12);
  } catch (_) {
    return cacheSet(textCache, key, null, 12);
  }
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
    for (const [key, item] of Object.entries(value).slice(0, 40)) {
      if (/^(?:description|displayName|fullName|name|shortName|subtitle|title|type|sport|league|team|abbreviation|href|url)$/i.test(key)) {
        objectStrings(item, depth + 1, out);
      }
    }
  }
  return out;
}

function directImageUrls(value, depth = 0, out = []) {
  if (depth > 4 || value == null) return out;
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value) && /(?:\.png|\.jpe?g|\.webp|headshot|photo|image)/i.test(value)) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 20)) directImageUrls(item, depth + 1, out);
    return out;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value).slice(0, 50)) {
      if (/image|photo|headshot|picture|avatar/i.test(key) || depth < 2) directImageUrls(item, depth + 1, out);
    }
  }
  return out;
}

function candidateName(obj) {
  return clean(obj?.displayName || obj?.fullName || obj?.name || obj?.shortName || obj?.title || obj?.athlete?.displayName || obj?.athlete?.fullName || obj?.athlete?.name);
}

function candidateId(obj) {
  const values = [obj?.id, obj?.athleteId, obj?.playerId, obj?.personId, obj?.athlete?.id];
  for (const value of values) {
    const text = clean(value);
    if (/^\d+$/.test(text)) return text;
  }
  const strings = objectStrings(obj);
  for (const text of strings) {
    const match = text.match(/\/player\/_\/id\/(\d+)/i) || text.match(/\/athletes\/(\d+)/i);
    if (match) return match[1];
  }
  return null;
}

function collectNamedObjects(value, wantedName, depth = 0, out = [], seen = new Set()) {
  if (depth > 7 || value == null || out.length >= 80) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectNamedObjects(item, wantedName, depth + 1, out, seen);
    return out;
  }
  if (typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);
  const name = candidateName(value);
  if (name && normName(name) === wantedName) out.push(value);
  for (const item of Object.values(value)) collectNamedObjects(item, wantedName, depth + 1, out, seen);
  return out;
}

function sportScore(obj, sport) {
  const upper = clean(sport).toUpperCase();
  const haystack = objectStrings(obj).join(' ').toLowerCase();
  const terms = {
    NFL:['nfl','football'], NCAAF:['college football','ncaaf','football'],
    NBA:['nba','basketball'], WNBA:['wnba','basketball'], NCAAB:['college basketball','ncaab','basketball'],
    MLB:['mlb','baseball'], NHL:['nhl','hockey'], SOCCER:['soccer','football'],
    TENNIS:['tennis'], MMA:['mma','ufc'], UFC:['mma','ufc'], GOLF:['golf'],
  }[upper] || [];
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 2 : 0), 0);
}

function teamScore(obj, team) {
  const wanted = clean(team);
  if (!wanted) return 0;
  const strings = objectStrings(obj);
  return strings.some(value => teamMatches(wanted, value)) ? 4 : 0;
}

async function firstWorking(urls) {
  const seen = new Set();
  for (const raw of urls || []) {
    const url = clean(raw);
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    if (await probeImage(url)) return url;
  }
  return null;
}

async function espnSearchHeadshot(leg) {
  const player = clean(leg?.player);
  if (!player) return null;
  const sport = clean(leg?.sport).toUpperCase();
  const query = new URLSearchParams({ query:player, limit:'30' });
  const sportHint = ESPN_SEARCH_SPORT[sport];
  if (sportHint) query.set('sport', sportHint);
  let body = await fetchJson(`https://site.web.api.espn.com/apis/search/v2?${query.toString()}`);
  if (!body && sportHint) {
    query.delete('sport');
    body = await fetchJson(`https://site.web.api.espn.com/apis/search/v2?${query.toString()}`);
  }
  if (!body) return null;

  const wanted = normName(player);
  const objects = collectNamedObjects(body, wanted);
  objects.sort((a,b) => (sportScore(b, sport) + teamScore(b, leg?.team)) - (sportScore(a, sport) + teamScore(a, leg?.team)));
  const urls = [];
  for (const obj of objects) {
    urls.push(...directImageUrls(obj));
    const id = candidateId(obj);
    if (id) urls.push(headshotUrl(sport, id));
  }
  return firstWorking(urls);
}

function parseCsvLine(line) {
  const out = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      out.push(value); value = '';
    } else value += ch;
  }
  out.push(value);
  return out;
}

function currentNflSeason(date = new Date()) {
  return date.getUTCFullYear();
}

async function nflRosterHeadshot(leg) {
  if (clean(leg?.sport).toUpperCase() !== 'NFL') return null;
  const season = currentNflSeason();
  const url = `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`;
  const text = await fetchText(url, { timeout:9000 });
  if (!text) return null;
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return null;
  const header = parseCsvLine(lines[0]);
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  const wanted = normName(leg?.player);
  const candidates = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    if (normName(row[index.full_name]) !== wanted) continue;
    const team = row[index.team] || '';
    const score = teamMatches(leg?.team, team) ? 10 : 0;
    candidates.push({ score, url:row[index.headshot_url] || null, espnId:row[index.espn_id] || null });
  }
  candidates.sort((a,b) => b.score - a.score);
  const urls = [];
  for (const candidate of candidates) {
    urls.push(candidate.url);
    if (candidate.espnId) urls.push(headshotUrl('NFL', candidate.espnId));
  }
  return firstWorking(urls);
}

async function mlbOfficialHeadshot(leg) {
  if (clean(leg?.sport).toUpperCase() !== 'MLB' || !leg?.player) return null;
  const query = new URLSearchParams({ names:clean(leg.player), active:'true', sportIds:'1' });
  let body = await fetchJson(`https://statsapi.mlb.com/api/v1/people/search?${query.toString()}`);
  if (!Array.isArray(body?.people) || !body.people.length) {
    query.delete('active');
    body = await fetchJson(`https://statsapi.mlb.com/api/v1/people/search?${query.toString()}`);
  }
  const wanted = normName(leg.player);
  const matches = (body?.people || []).filter(person => normName(person?.fullName || person?.name) === wanted);
  matches.sort((a,b) => {
    const at = a?.currentTeam?.abbreviation || a?.currentTeam?.name || '';
    const bt = b?.currentTeam?.abbreviation || b?.currentTeam?.name || '';
    return Number(teamMatches(leg?.team, bt)) - Number(teamMatches(leg?.team, at));
  });
  const urls = matches.map(person => person?.id && `https://img.mlbstatic.com/mlb-photos/image/upload/w_426,d_people:generic:headshot:silo:current.png,q_auto:best,f_auto/v1/people/${encodeURIComponent(String(person.id))}/headshot/silo/current`);
  return firstWorking(urls);
}

async function nhlOfficialHeadshotByName(leg) {
  if (clean(leg?.sport).toUpperCase() !== 'NHL' || !leg?.player) return null;
  const query = new URLSearchParams({ culture:'en-us', limit:'20', q:clean(leg.player) });
  const body = await fetchJson(`https://search.d3.nhle.com/api/v1/search/player?${query.toString()}`);
  const rows = Array.isArray(body) ? body : (body?.data || body?.players || []);
  const wanted = normName(leg.player);
  const matches = rows.filter(row => normName(row?.name || row?.fullName || `${row?.firstName || ''} ${row?.lastName || ''}`) === wanted);
  matches.sort((a,b) => Number(teamMatches(leg?.team, b?.teamAbbrev || b?.teamAbbreviation || b?.team)) - Number(teamMatches(leg?.team, a?.teamAbbrev || a?.teamAbbreviation || a?.team)));
  for (const row of matches) {
    const id = row?.playerId || row?.id;
    if (!id) continue;
    const profile = await fetchJson(`https://api-web.nhle.com/v1/player/${encodeURIComponent(String(id))}/landing`);
    const url = await firstWorking([profile?.headshot, profile?.heroImage]);
    if (url) return url;
  }
  return null;
}

function basketballSeason(sport, now = new Date()) {
  const year = now.getUTCFullYear();
  if (sport === 'WNBA') return String(year);
  const start = now.getUTCMonth() >= 6 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

function rowsFromResultSet(body) {
  const set = body?.resultSets?.[0] || body?.resultSet || null;
  const headers = set?.headers || set?.Headers || [];
  const rows = set?.rowSet || set?.rows || [];
  if (!Array.isArray(headers) || !Array.isArray(rows)) return [];
  return rows.map(row => Object.fromEntries(headers.map((key, i) => [key, row[i]])));
}

async function basketballOfficialHeadshot(leg) {
  const sport = clean(leg?.sport).toUpperCase();
  if (!['NBA','WNBA'].includes(sport) || !leg?.player) return null;
  const season = basketballSeason(sport);
  const leagueId = sport === 'WNBA' ? '10' : '00';
  const host = sport === 'WNBA' ? 'https://stats.wnba.com' : 'https://stats.nba.com';
  const referer = sport === 'WNBA' ? 'https://www.wnba.com/' : 'https://www.nba.com/';
  const query = new URLSearchParams({ LeagueID:leagueId, Season:season, IsOnlyCurrentSeason:'1' });
  const body = await fetchJson(`${host}/stats/commonallplayers?${query.toString()}`, {
    timeout:6500,
    headers:{ referer, origin:referer.replace(/\/$/,'') },
  });
  const wanted = normName(leg.player);
  const rows = rowsFromResultSet(body).filter(row => normName(row.DISPLAY_FIRST_LAST || row.DISPLAY_LAST_COMMA_FIRST || row.PLAYER_NAME) === wanted);
  rows.sort((a,b) => Number(teamMatches(leg?.team, b.TEAM_ABBREVIATION || b.TEAM_NAME)) - Number(teamMatches(leg?.team, a.TEAM_ABBREVIATION || a.TEAM_NAME)));
  const size = sport === 'WNBA' ? '260x190' : '1040x760';
  const league = sport.toLowerCase();
  return firstWorking(rows.map(row => row.PERSON_ID && `https://cdn.${league}.com/headshots/${league}/latest/${size}/${encodeURIComponent(String(row.PERSON_ID))}.png`));
}

async function resolveHeadshotForLeg(leg) {
  const player = clean(leg?.player);
  if (!player) return null;
  if (leg?.playerImageUrl && await probeImage(leg.playerImageUrl)) return leg.playerImageUrl;
  const key = `${clean(leg?.sport).toUpperCase()}|${normName(player)}|${clean(leg?.team).toUpperCase()}`;
  const cached = cacheGet(lookupCache, key);
  if (cached !== undefined) return cached;

  const resolvers = [
    () => espnSearchHeadshot(leg),
    () => nflRosterHeadshot(leg),
    () => mlbOfficialHeadshot(leg),
    () => nhlOfficialHeadshotByName(leg),
    () => basketballOfficialHeadshot(leg),
  ];
  for (const resolver of resolvers) {
    try {
      const url = await resolver();
      if (url) return cacheSet(lookupCache, key, url);
    } catch (_) {}
  }
  return cacheSet(lookupCache, key, null);
}

async function ensurePlayerHeadshots(slip) {
  const legs = Array.isArray(slip?.legs) ? slip.legs : [];
  const next = await Promise.all(legs.map(async leg => {
    const playerImageUrl = await resolveHeadshotForLeg(leg);
    return playerImageUrl && playerImageUrl !== leg.playerImageUrl ? { ...leg, playerImageUrl } : leg;
  }));
  return { ...slip, legs:next };
}

module.exports = {
  ensurePlayerHeadshots,
  resolveHeadshotForLeg,
  espnSearchHeadshot,
  nflRosterHeadshot,
  mlbOfficialHeadshot,
  nhlOfficialHeadshotByName,
  basketballOfficialHeadshot,
  collectNamedObjects,
  candidateId,
  directImageUrls,
  rowsFromResultSet,
  basketballSeason,
};
