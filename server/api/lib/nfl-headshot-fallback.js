const { norm, teamMatches, isTrustedImageUrl, probeImage } = require('./headshot-ensure');

const CACHE_MS = 30 * 60_000;
let rosterCache = null;

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function seasonYear(now = new Date()) {
  return now.getUTCFullYear();
}

async function loadRoster(season = seasonYear()) {
  if (rosterCache && rosterCache.season === season && Date.now() - rosterCache.ts < CACHE_MS) return rosterCache.rows;
  const url = `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`;
  try {
    const response = await fetch(url, {
      headers:{ 'user-agent':'Mozilla/5.0 ParlayPing/1.0', accept:'text/csv,text/plain,*/*' },
      redirect:'follow',
      cache:'no-store',
      signal:AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const text = await response.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const headers = parseCsvLine(lines[0]);
    const index = Object.fromEntries(headers.map((header, i) => [header, i]));
    const rows = lines.slice(1).map(line => {
      const values = parseCsvLine(line);
      return {
        name:values[index.full_name] || '',
        team:values[index.team] || '',
        headshot:values[index.headshot_url] || '',
      };
    });
    rosterCache = { season, ts:Date.now(), rows };
    return rows;
  } catch (_) {
    return [];
  }
}

async function searchNflRosterHeadshot(playerName, team = null, season = seasonYear()) {
  const wanted = norm(playerName);
  if (!wanted) return null;
  const matches = (await loadRoster(season))
    .filter(row => norm(row.name) === wanted && isTrustedImageUrl(row.headshot))
    .sort((a,b) => Number(teamMatches(team, b.team)) - Number(teamMatches(team, a.team)));
  for (const row of matches) {
    if (await probeImage(row.headshot)) return row.headshot;
  }
  return null;
}

async function ensureNflOfficialHeadshots(slip) {
  const legs = Array.isArray(slip?.legs) ? slip.legs : [];
  const next = await Promise.all(legs.map(async leg => {
    if (String(leg?.sport || '').toUpperCase() !== 'NFL' || leg?.playerImageUrl || !leg?.player) return leg;
    try {
      const playerImageUrl = await searchNflRosterHeadshot(leg.player, leg.team);
      return playerImageUrl ? { ...leg, playerImageUrl } : leg;
    } catch (_) {
      return leg;
    }
  }));
  return { ...slip, legs:next };
}

module.exports = { parseCsvLine, seasonYear, loadRoster, searchNflRosterHeadshot, ensureNflOfficialHeadshots };
