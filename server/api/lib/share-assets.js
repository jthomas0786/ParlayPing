const CACHE_MS = 60_000;
const summaryCache = new Map();

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

async function enrichShareAssets(slip) {
  const legs = Array.isArray(slip?.legs) ? slip.legs.map(leg => ({ ...leg })) : [];
  const groups = new Map();
  legs.forEach((leg, index) => {
    const sport = String(leg.sport || '').toUpperCase();
    const gameId = String(leg.gameId || '').trim();
    if (!SPORT_PATHS[sport] || !gameId) return;
    const key = `${sport}:${gameId}`;
    if (!groups.has(key)) groups.set(key, { sport, gameId, indexes:[] });
    groups.get(key).indexes.push(index);
  });

  await Promise.all([...groups.values()].map(async group => {
    try {
      const summary = await loadSummary(group.sport, group.gameId);
      const parsed = parseSummaryPlayers(summary, group.sport);
      for (const index of group.indexes) {
        const leg = legs[index];
        const player = findPlayer(parsed, leg);
        if (player) {
          if (player.id) leg.playerId = player.id;
          if (player.headshot) leg.playerImageUrl = player.headshot;
          if (player.team) leg.team = player.team;
          if (player.teamLogo) leg.teamLogoUrl = player.teamLogo;
          continue;
        }
        const team = parsed.headerTeams.get(normTeam(leg.team));
        if (team?.logo) leg.teamLogoUrl = team.logo;
        if (team?.abbr) leg.team = team.abbr;
      }
    } catch (_) {
      // Asset enrichment is best-effort. The signed slip remains usable without it.
    }
  }));

  return { ...slip, legs };
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
};
