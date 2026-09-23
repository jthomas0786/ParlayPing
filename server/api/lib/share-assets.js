const CACHE_MS = 60_000;
const summaryCache = new Map();
const scoreboardCache = new Map();
const imageProbeCache = new Map();
const nhlPlayerCache = new Map();

const SPORT_PATHS = {
  NFL:'football/nfl',
  NCAAF:'football/college-football',
  NBA:'basketball/nba',
  WNBA:'basketball/wnba',
  NCAAB:'basketball/mens-college-basketball',
  MLB:'baseball/mlb',
  NHL:'hockey/nhl',
};

const HEADSHOT_SLUGS = {
  NFL:'nfl',
  NCAAF:'college-football',
  NBA:'nba',
  WNBA:'wnba',
  NCAAB:'mens-college-basketball',
  MLB:'mlb',
  NHL:'nhl',
};

function normName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[.'’]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normTeam(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,'');
}

function teamMatches(a, b) {
  const x = normTeam(a);
  const y = normTeam(b);
  if (!x || !y) return true;
  return x === y || x.includes(y) || y.includes(x);
}

function headshotUrl(sport, id) {
  const slug = HEADSHOT_SLUGS[String(sport || '').toUpperCase()];
  return slug && id ? `https://a.espncdn.com/i/headshots/${slug}/players/full/${encodeURIComponent(String(id))}.png` : null;
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

async function probeImage(url) {
  if (!isHttpUrl(url)) return false;
  const cached = imageProbeCache.get(url);
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
  if (imageProbeCache.size > 256) imageProbeCache.clear();
  imageProbeCache.set(url, { ts:Date.now(), ok });
  return ok;
}

async function firstWorkingImage(candidates) {
  for (const candidate of [...new Set((candidates || []).filter(isHttpUrl))]) {
    if (await probeImage(candidate)) return candidate;
  }
  return null;
}

function officialImageCandidates(sport, id) {
  const upper = String(sport || '').toUpperCase();
  const playerId = String(id || '').trim();
  if (!playerId) return [];
  if (upper === 'NBA') {
    return [`https://cdn.nba.com/headshots/nba/latest/1040x760/${encodeURIComponent(playerId)}.png`];
  }
  if (upper === 'WNBA') {
    return [`https://cdn.wnba.com/headshots/wnba/latest/1040x760/${encodeURIComponent(playerId)}.png`];
  }
  if (upper === 'MLB') {
    return [`https://img.mlbstatic.com/mlb-photos/image/upload/w_426,d_people:generic:headshot:silo:current.png,q_auto:best,f_auto/v1/people/${encodeURIComponent(playerId)}/headshot/silo/current`];
  }
  return [];
}

async function nhlOfficialHeadshot(id) {
  const playerId = String(id || '').trim();
  if (!/^\d+$/.test(playerId)) return null;
  const cached = nhlPlayerCache.get(playerId);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.value;
  let value = null;
  try {
    const response = await fetch(`https://api-web.nhle.com/v1/player/${encodeURIComponent(playerId)}/landing`, {
      headers:{ accept:'application/json', 'user-agent':'Mozilla/5.0 ParlayPing/1.0' },
      cache:'no-store',
      signal:AbortSignal.timeout(4000),
    });
    if (response.ok) {
      const body = await response.json();
      value = body?.headshot || body?.heroImage || null;
    }
  } catch (_) {}
  if (nhlPlayerCache.size > 128) nhlPlayerCache.clear();
  nhlPlayerCache.set(playerId, { ts:Date.now(), value });
  return value;
}

async function resolveHeadshotCandidates(sport, ids, extra = []) {
  const upper = String(sport || '').toUpperCase();
  const candidates = [...extra];
  for (const rawId of ids || []) {
    const id = String(rawId || '').trim();
    if (!id) continue;
    candidates.push(headshotUrl(upper, id));
    candidates.push(...officialImageCandidates(upper, id));
    if (upper === 'NHL') candidates.push(await nhlOfficialHeadshot(id));
  }
  return firstWorkingImage(candidates);
}

async function espnJson(url) {
  const headers = {
    accept:'application/json,text/plain,*/*',
    'accept-language':'en-US,en;q=0.9',
    referer:'https://www.espn.com/',
    'user-agent':'okhttp/4.12.0',
  };
  let response = await fetch(url, { headers, cache:'no-store', signal:AbortSignal.timeout(5000) });
  if (response.status === 403 && url.includes('site.api.espn.com')) {
    response = await fetch(url.replace('https://site.api.espn.com/','https://site.web.api.espn.com/'), {
      headers,
      cache:'no-store',
      signal:AbortSignal.timeout(5000),
    });
  }
  if (!response.ok) throw new Error(`ESPN asset lookup failed (${response.status})`);
  return response.json();
}

function dateKey(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0,10).replace(/-/g,'');
}

function scoreboardDateKeys(value) {
  const center = new Date(value || Date.now());
  if (Number.isNaN(center.getTime())) return [];
  return [-1,0,1].map(offset => {
    const date = new Date(center.getTime() + offset * 24 * 60 * 60 * 1000);
    return dateKey(date);
  }).filter(Boolean);
}

async function loadScoreboardByDate(sport, date) {
  const upper = String(sport || '').toUpperCase();
  const path = SPORT_PATHS[upper];
  if (!path || !date) return null;
  const key = `${upper}:${date}`;
  const cached = scoreboardCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.value;
  const value = await espnJson(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${date}&limit=100`);
  if (scoreboardCache.size > 64) scoreboardCache.clear();
  scoreboardCache.set(key, { ts:Date.now(), value });
  return value;
}

async function loadScoreboards(sport, startTimeUTC) {
  const dates = scoreboardDateKeys(startTimeUTC);
  const rows = await Promise.all(dates.map(async date => {
    try { return await loadScoreboardByDate(sport, date); }
    catch { return null; }
  }));
  return rows.filter(Boolean);
}

async function loadSummary(sport, gameId) {
  const upper = String(sport || '').toUpperCase();
  const path = SPORT_PATHS[upper];
  if (!path || !gameId) return null;
  const key = `${upper}:${gameId}`;
  const cached = summaryCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.value;
  const value = await espnJson(`https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${encodeURIComponent(String(gameId))}`);
  if (summaryCache.size > 96) summaryCache.clear();
  summaryCache.set(key, { ts:Date.now(), value });
  return value;
}

function eventTeams(event) {
  const competition = event?.competitions?.[0];
  return (competition?.competitors || []).map(competitor => {
    const team = competitor?.team || {};
    return [team.abbreviation, team.shortDisplayName, team.displayName, team.name, team.location].filter(Boolean).map(String);
  });
}

function matchupTokens(value) {
  return String(value || '')
    .split(/\s+(?:@|vs\.?|v\.?|at)\s+/i)
    .map(token => token.trim())
    .filter(Boolean)
    .slice(0,2);
}

function eventStart(event) {
  const raw = event?.date || event?.competitions?.[0]?.date || null;
  const ms = Date.parse(raw || '');
  return Number.isFinite(ms) ? ms : null;
}

function eventMatchesLeg(event, leg) {
  const teams = eventTeams(event);
  const flat = teams.flat();
  const tokens = matchupTokens(leg?.matchup);
  if (tokens.length === 2) {
    const both = tokens.every(token => flat.some(team => teamMatches(token, team)));
    if (!both) return false;
  } else if (leg?.team && !flat.some(team => teamMatches(leg.team, team))) {
    return false;
  }
  const legStart = Date.parse(leg?.startTimeUTC || '');
  const start = eventStart(event);
  if (Number.isFinite(legStart) && Number.isFinite(start) && Math.abs(start - legStart) > 14 * 60 * 60 * 1000) return false;
  return true;
}

function summaryEvent(summary) {
  const competition = summary?.header?.competitions?.[0];
  if (!competition) return null;
  return { date:competition.date, competitions:[competition] };
}

async function suppliedEspnGameIsValid(leg, gameId) {
  try {
    const summary = await loadSummary(leg?.sport, gameId);
    const parsed = parseSummaryPlayers(summary, leg?.sport);
    if (leg?.player && findPlayer(parsed, leg)) return true;
    const event = summaryEvent(summary);
    return Boolean(event && eventMatchesLeg(event, leg));
  } catch (_) {
    return false;
  }
}

async function resolveEspnGameId(leg) {
  const supplied = String(leg?.espnGameId || leg?.gameId || '').trim();
  if (/^\d{6,}$/.test(supplied) && await suppliedEspnGameIsValid(leg, supplied)) return supplied;
  const scoreboards = await loadScoreboards(leg?.sport, leg?.startTimeUTC);
  const byId = new Map();
  for (const scoreboard of scoreboards) {
    for (const event of Array.isArray(scoreboard?.events) ? scoreboard.events : []) {
      if (event?.id) byId.set(String(event.id), event);
    }
  }
  const candidates = [...byId.values()].filter(event => eventMatchesLeg(event, leg));
  if (!candidates.length) return null;
  if (candidates.length === 1) return String(candidates[0].id || '');
  const legStart = Date.parse(leg?.startTimeUTC || '');
  candidates.sort((a,b) => {
    const aStart = eventStart(a);
    const bStart = eventStart(b);
    const da = Number.isFinite(legStart) && Number.isFinite(aStart) ? Math.abs(aStart-legStart) : Number.MAX_SAFE_INTEGER;
    const db = Number.isFinite(legStart) && Number.isFinite(bStart) ? Math.abs(bStart-legStart) : Number.MAX_SAFE_INTEGER;
    return da-db;
  });
  return String(candidates[0]?.id || '') || null;
}

function pushAthlete(players, athlete, teamAbbr, teamLogo, sport) {
  if (!athlete) return;
  const id = String(athlete.id || athlete.uid || '').trim();
  const name = String(athlete.displayName || athlete.fullName || athlete.shortName || '').trim();
  if (!name) return;
  players.push({
    id,
    name,
    team:teamAbbr,
    teamLogo,
    headshot:athlete.headshot?.href || athlete.headshot || headshotUrl(sport, id),
  });
}

function parseSummaryPlayers(summary, sport) {
  const players = [];
  const headerTeams = new Map();
  const competition = summary?.header?.competitions?.[0];
  for (const competitor of competition?.competitors || []) {
    const team = competitor?.team || {};
    const abbr = String(team.abbreviation || team.shortDisplayName || team.displayName || '').trim();
    const logo = team.logo || team.logos?.[0]?.href || null;
    if (abbr) headerTeams.set(normTeam(abbr), { abbr, logo, id:String(team.id || competitor.id || '') });
    if (team.displayName) headerTeams.set(normTeam(team.displayName), { abbr:abbr || team.displayName, logo, id:String(team.id || competitor.id || '') });
    if (team.shortDisplayName) headerTeams.set(normTeam(team.shortDisplayName), { abbr:abbr || team.shortDisplayName, logo, id:String(team.id || competitor.id || '') });
  }

  for (const group of summary?.boxscore?.players || []) {
    const team = group?.team || {};
    const teamAbbr = String(team.abbreviation || team.shortDisplayName || team.displayName || '').trim();
    const teamLogo = team.logo || team.logos?.[0]?.href || headerTeams.get(normTeam(teamAbbr))?.logo || null;
    for (const section of group?.statistics || []) {
      for (const row of section?.athletes || []) pushAthlete(players, row?.athlete, teamAbbr, teamLogo, sport);
    }
  }

  for (const roster of summary?.rosters || []) {
    const team = roster?.team || {};
    const teamAbbr = String(team.abbreviation || team.shortDisplayName || team.displayName || '').trim();
    const teamLogo = team.logo || team.logos?.[0]?.href || headerTeams.get(normTeam(teamAbbr))?.logo || null;
    for (const entry of roster?.roster || roster?.athletes || []) pushAthlete(players, entry?.athlete || entry, teamAbbr, teamLogo, sport);
  }

  const deduped = new Map();
  for (const player of players) {
    const key = `${normName(player.name)}|${normTeam(player.team)}`;
    const existing = deduped.get(key);
    if (!existing || (!existing.headshot && player.headshot)) deduped.set(key, player);
  }
  return { players:[...deduped.values()], headerTeams };
}

function findPlayer(parsed, leg) {
  const exact = parsed.players.filter(player => normName(player.name) === normName(leg.player));
  if (!exact.length) return null;
  if (exact.length === 1) return exact[0];
  const teamMatch = exact.find(player => teamMatches(leg.team, player.team));
  return teamMatch || exact[0];
}

async function bestHeadshotForLeg(leg, player) {
  const ids = [player?.id, leg?.playerId, leg?.espnPlayerId].filter(Boolean);
  const extras = [player?.headshot, leg?.playerImageUrl, leg?.headshotUrl].filter(Boolean);
  return resolveHeadshotCandidates(leg?.sport, ids, extras);
}

async function enrichOneLeg(leg) {
  const upper = String(leg?.sport || '').toUpperCase();
  if (!SPORT_PATHS[upper]) return leg;
  try {
    const espnGameId = await resolveEspnGameId(leg);
    let parsed = { players:[], headerTeams:new Map() };
    if (espnGameId) {
      try { parsed = parseSummaryPlayers(await loadSummary(upper, espnGameId), upper); } catch (_) {}
    }
    const player = findPlayer(parsed, leg);
    const playerImageUrl = await bestHeadshotForLeg(leg, player);
    if (player || playerImageUrl) {
      return {
        ...leg,
        espnGameId:espnGameId || leg.espnGameId,
        playerId:player?.id || leg.playerId,
        playerImageUrl:playerImageUrl || leg.playerImageUrl,
        team:player?.team || leg.team,
        teamLogoUrl:player?.teamLogo || leg.teamLogoUrl,
      };
    }
    const team = parsed.headerTeams.get(normTeam(leg.team));
    return {
      ...leg,
      espnGameId:espnGameId || leg.espnGameId,
      team:team?.abbr || leg.team,
      teamLogoUrl:team?.logo || leg.teamLogoUrl,
    };
  } catch (_) {
    return leg;
  }
}

async function enrichShareAssets(slip) {
  const legs = Array.isArray(slip?.legs) ? slip.legs.map(leg => ({ ...leg })) : [];
  const enriched = await Promise.all(legs.map(enrichOneLeg));
  return { ...slip, legs:enriched };
}

module.exports = {
  SPORT_PATHS,
  HEADSHOT_SLUGS,
  normName,
  normTeam,
  teamMatches,
  headshotUrl,
  officialImageCandidates,
  nhlOfficialHeadshot,
  probeImage,
  firstWorkingImage,
  parseSummaryPlayers,
  enrichShareAssets,
  resolveEspnGameId,
  eventMatchesLeg,
  matchupTokens,
  scoreboardDateKeys,
  loadScoreboards,
  bestHeadshotForLeg,
  suppliedEspnGameIsValid,
};
