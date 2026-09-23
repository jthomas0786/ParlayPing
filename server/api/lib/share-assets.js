const CACHE_MS = 60_000;
const summaryCache = new Map();
const scoreboardCache = new Map();

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
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
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
    return [
      team.abbreviation,
      team.shortDisplayName,
      team.displayName,
      team.name,
      team.location,
    ].filter(Boolean).map(String);
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

async function resolveEspnGameId(leg) {
  const supplied = String(leg?.gameId || '').trim();
  if (/^\d{6,}$/.test(supplied)) return supplied;
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
      for (const row of section?.athletes || []) {
        const athlete = row?.athlete || {};
        const id = String(athlete.id || '').trim();
        const name = String(athlete.displayName || athlete.fullName || athlete.shortName || '').trim();
        if (!name) continue;
        players.push({
          id,
          name,
          team:teamAbbr,
          teamLogo,
          headshot:athlete.headshot?.href || athlete.headshot || headshotUrl(sport, id),
        });
      }
    }
  }

  const deduped = new Map();
  for (const player of players) {
    const key = `${normName(player.name)}|${normTeam(player.team)}`;
    if (!deduped.has(key)) deduped.set(key, player);
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

async function enrichOneLeg(leg) {
  const upper = String(leg?.sport || '').toUpperCase();
  if (!SPORT_PATHS[upper]) return leg;
  try {
    const espnGameId = await resolveEspnGameId(leg);
    if (!espnGameId) return leg;
    const summary = await loadSummary(upper, espnGameId);
    const parsed = parseSummaryPlayers(summary, upper);
    const player = findPlayer(parsed, leg);
    if (player) {
      return {
        ...leg,
        espnGameId,
        playerId:player.id || leg.playerId,
        playerImageUrl:player.headshot || leg.playerImageUrl,
        team:player.team || leg.team,
        teamLogoUrl:player.teamLogo || leg.teamLogoUrl,
      };
    }
    const team = parsed.headerTeams.get(normTeam(leg.team));
    return {
      ...leg,
      espnGameId,
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
  parseSummaryPlayers,
  enrichShareAssets,
  resolveEspnGameId,
  eventMatchesLeg,
  matchupTokens,
  scoreboardDateKeys,
  loadScoreboards,
};
