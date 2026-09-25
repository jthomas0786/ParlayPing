const { normalizeSport } = require('./sport-router');
const { marketKey, normBook } = require('./sportsbook-enrich');

const MAX_WATER_STEPS = 6;
const FILLER_WORDS = new Set(['the','a','an','bet','bets','leg','legs','prop','props','market','markets','only','just','please','pls','me','my','this','that','ones','one']);

const SPORT_ALIASES = {
  NFL:['nfl','pro football','football'],
  NCAAF:['ncaaf','cfb','college football','ncaa football'],
  MLB:['mlb','baseball','major league baseball'],
  NHL:['nhl','hockey'],
  NBA:['nba','pro basketball'],
  NCAAB:['ncaab','college basketball','ncaa basketball','ncaam'],
  WNBA:['wnba','womens nba','women s nba'],
  SOCCER:['soccer','football soccer','epl','premier league','mls'],
  TENNIS:['tennis'],
  MMA:['mma','ufc','mixed martial arts'],
  ESPORTS:['esports','e sports','cs2','counter strike','valorant','league of legends','lol','dota','dota2'],
  TABLE_TENNIS:['table tennis','ping pong'],
  VOLLEYBALL:['volleyball'],
  CRICKET:['cricket'],
  RUGBY_LEAGUE:['rugby league','nrl'],
  AFL:['afl','aussie rules','australian rules'],
  BOXING:['boxing'],
  GOLF:['golf','pga','liv golf','dp world']
};

const MARKET_ALIASES = {
  rushYds:['rushing yards','rush yards','rushing yds','rush yds'],
  recYds:['receiving yards','receiver yards','rec yards','receiving yds','rec yds'],
  passYds:['passing yards','pass yards','passing yds','pass yds'],
  receptions:['receptions','reception','catches','catch'],
  passTds:['passing touchdowns','passing tds','pass touchdowns','pass tds'],
  atd:['anytime touchdown','any time touchdown','anytime td','any time td','atd','touchdown scorer'],
  firstTd:['first touchdown','first td','first touchdown scorer'],
  completions:['completions','pass completions'],
  points:['points','pts'],
  rebounds:['rebounds','rebs'],
  assists:['assists','asts'],
  threes:['three pointers','three pointer','3 pointers','3 pointer','3pt','threes'],
  ptsAsts:['points assists','points + assists','pts asts','pa'],
  ptsRebs:['points rebounds','points + rebounds','pts rebs','pr'],
  rebsAsts:['rebounds assists','rebounds + assists','rebs asts','ra'],
  pra:['points rebounds assists','points + rebounds + assists','pts rebs asts','pra'],
  hr:['home runs','home run','homers','homer','hr'],
  hits:['hits','hit'],
  tb:['total bases','bases','tb'],
  rbi:['runs batted in','rbis','rbi'],
  runs:['runs scored','runs','run scored'],
  sb:['stolen bases','stolen base','sb'],
  pitcherStrikeouts:['pitcher strikeouts','pitching strikeouts','strikeouts','ks'],
  pitchingOuts:['pitching outs','pitcher outs'],
  hitsAllowed:['hits allowed'],
  earnedRuns:['earned runs','earned runs allowed'],
  walks:['walks','bases on balls'],
  singles:['singles','single'],
  doubles:['doubles','double'],
  triples:['triples','triple'],
  shots:['shots on goal','shots','sog'],
  atg:['anytime goal','any time goal','anytime goal scorer','goal scorer','atg'],
  goals:['goals','goal'],
  aces:['aces','ace'],
  doubleFaults:['double faults','double fault'],
  games:['games won','games'],
  sets:['sets won','sets'],
  kills:['kills','kill'],
  maps:['maps won','maps'],
  rounds:['rounds','rounds won'],
  takedowns:['takedowns','takedown'],
  significantStrikes:['significant strikes','sig strikes']
};

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compact(value) {
  return norm(value).replace(/[^a-z0-9]+/g, '');
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractCommandText(text, username = 'ParlayPing') {
  const source = String(text || '');
  const handle = String(username || '').replace(/^@/, '').trim();
  if (!source || !handle) return '';
  const re = new RegExp(`@${escapeRegex(handle)}\\b`, 'ig');
  let match;
  let end = -1;
  while ((match = re.exec(source))) end = re.lastIndex;
  if (end < 0) return '';
  return source
    .slice(end)
    .replace(/^(?:\s*@[A-Za-z0-9_]{1,15}\b[\s,:-]*)+/, '')
    .replace(/^[\s,:;.!?\-–—]+/, '')
    .trim();
}

function containsPhrase(haystack, phrase) {
  const h = ` ${norm(haystack)} `;
  const p = norm(phrase);
  return Boolean(p && h.includes(` ${p} `));
}

function sportKeysFromPhrase(phrase) {
  const out = new Set();
  const n = norm(phrase);
  for (const [sport, aliases] of Object.entries(SPORT_ALIASES)) {
    if (aliases.some(alias => containsPhrase(n, alias))) out.add(sport);
  }
  return out;
}

function marketKeysFromPhrase(phrase) {
  const out = new Set();
  const n = norm(phrase);
  for (const [key, aliases] of Object.entries(MARKET_ALIASES)) {
    if (aliases.some(alias => containsPhrase(n, alias))) out.add(key);
  }
  return out;
}

function sideKeysFromPhrase(phrase) {
  const out = new Set();
  const n = norm(phrase);
  if (/\bovers?\b/.test(n)) out.add('over');
  if (/\bunders?\b/.test(n)) out.add('under');
  if (/\byes\b/.test(n)) out.add('yes');
  if (/\bno\b/.test(n)) out.add('no');
  return out;
}

function cleanDescriptorPhrase(value) {
  return norm(value)
    .split(' ')
    .filter(token => !FILLER_WORDS.has(token))
    .join(' ')
    .trim();
}

function descriptorFromPhrase(phrase) {
  const cleaned = cleanDescriptorPhrase(phrase);
  return {
    raw: String(phrase || '').trim(),
    normalized: cleaned,
    sports: [...sportKeysFromPhrase(phrase)],
    markets: [...marketKeysFromPhrase(phrase)],
    sides: [...sideKeysFromPhrase(phrase)]
  };
}

function knownCommandStart(value) {
  return /^(?:water\s*down|make\s+(?:it|this|the\s+slip)\s+safer|safer\b|just\b|only\b|keep\s+only\b|remove\b|drop\b|exclude\b|make\s+it\s+\d+\s+legs?\b|keep\s+\d+\s+legs?\b)/i.test(String(value || '').trim());
}

function parseMentionCommand(text, username = 'ParlayPing') {
  const commandText = extractCommandText(text, username);
  const source = norm(commandText);
  const actions = [];
  if (!source || !knownCommandStart(source)) return { recognized:false, commandText, actions:[] };

  const waterMatch = source.match(/\b(?:water\s*down|make\s+(?:it|this|the\s+slip)\s+safer|safer)\b(?:\s+(all|everything|every\s+leg|every\s+bet))?(?:\s+by\s+(\d+))?/i);
  if (waterMatch) {
    const explicitSteps = waterMatch[2] != null;
    const steps = explicitSteps ? Math.max(1, Math.min(MAX_WATER_STEPS, Number(waterMatch[2]) || 1)) : 1;
    let scope = null;
    const after = source.slice((waterMatch.index || 0) + waterMatch[0].length).replace(/^\s*(?:the\s+)?/, '').trim();
    if (after && !/^\b(?:and|then|by)\b/.test(after)) {
      const candidate = after.split(/\b(?:and|then)\b/)[0].trim();
      if (candidate && !/^\d+\b/.test(candidate)) scope = descriptorFromPhrase(candidate);
    }
    actions.push({ type:'water_down', steps, all:Boolean(waterMatch[1]) || explicitSteps, scope, explicitSteps });
  }

  const onlyRe = /\b(?:keep\s+only|just|only)\s+(?:the\s+)?(.+?)(?=\s+\b(?:and|then)\b\s+|$)/gi;
  let match;
  while ((match = onlyRe.exec(commandText))) {
    const phrase = String(match[1] || '').trim();
    if (phrase && !/^(?:water\s*down|safer)\b/i.test(phrase)) actions.push({ type:'only', descriptor:descriptorFromPhrase(phrase) });
  }

  const excludeRe = /\b(?:remove|drop|exclude)\s+(?:the\s+)?(.+?)(?=\s+\b(?:and|then)\b\s+|$)/gi;
  while ((match = excludeRe.exec(commandText))) {
    const phrase = String(match[1] || '').trim();
    if (/^(?:the\s+)?(?:riskiest|lowest\s+probability)(?:\s+(\d+))?\s*legs?$/i.test(phrase)) continue;
    if (phrase) actions.push({ type:'exclude', descriptor:descriptorFromPhrase(phrase) });
  }

  const limitMatch = source.match(/\b(?:make\s+it|keep)\s+(\d+)\s+legs?\b/i);
  if (limitMatch) actions.push({ type:'limit', count:Math.max(1, Math.min(25, Number(limitMatch[1]) || 1)) });

  const riskyMatch = source.match(/\b(?:drop|remove)\s+(?:the\s+)?(?:(\d+)\s+)?(?:riskiest|lowest\s+probability)\s+legs?\b/i);
  if (riskyMatch) actions.push({ type:'drop_riskiest', count:Math.max(1, Math.min(24, Number(riskyMatch[1]) || 1)) });

  return { recognized:actions.length > 0, commandText, actions };
}

function resultById(analysis) {
  return new Map((Array.isArray(analysis?.results) ? analysis.results : []).filter(row => row?.id).map(row => [String(row.id), row]));
}

function probabilityForLeg(leg, analysisMap, fallbackResults = [], index = 0) {
  const result = analysisMap.get(String(leg?.id || '')) || fallbackResults[index] || null;
  for (const value of [result?.pregameProbability, result?.probability, leg?.pregameProbability, leg?.probability]) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  }
  return null;
}

function legSearchText(leg) {
  return norm([
    leg?.sport,
    leg?.player,
    leg?.team,
    leg?.market,
    leg?.displayMarket,
    leg?.originalText
  ].filter(Boolean).join(' '));
}

function descriptorMatchesLeg(descriptor, leg) {
  if (!descriptor) return true;
  const sports = new Set(descriptor.sports || []);
  const markets = new Set(descriptor.markets || []);
  const sides = new Set(descriptor.sides || []);
  if (sports.size && !sports.has(normalizeSport(leg?.sport))) return false;
  if (markets.size && !markets.has(marketKey(leg))) return false;
  if (sides.size && !sides.has(String(leg?.side || '').toLowerCase())) return false;
  if (sports.size || markets.size || sides.size) return true;

  const generic = cleanDescriptorPhrase(descriptor.normalized || descriptor.raw || '');
  if (!generic) return false;
  const text = legSearchText(leg);
  if (text.includes(generic)) return true;
  const player = norm(leg?.player);
  if (player && (generic.includes(player) || player.includes(generic))) return true;
  const parts = generic.split(' ').filter(Boolean);
  return parts.length > 0 && parts.every(part => text.includes(part));
}

function normalizeSide(value) {
  const side = String(value || 'over').toLowerCase();
  if (side === 'under' || side === 'no') return side;
  if (side === 'yes') return 'yes';
  return 'over';
}

function offersForLeg(leg) {
  const out = [];
  const wantedSide = normalizeSide(leg?.side);
  for (const [rawBook, rows] of Object.entries(leg?.altLinesByBook || {})) {
    const book = normBook(rawBook) || String(rawBook || '');
    for (const row of Array.isArray(rows) ? rows : []) {
      const line = Number(row?.line);
      const oddsAmerican = Number(row?.oddsAmerican ?? row?.price ?? row?.odds);
      const side = normalizeSide(row?.side || wantedSide);
      if (!Number.isFinite(line) || !Number.isFinite(oddsAmerican) || side !== wantedSide) continue;
      out.push({
        book,
        line,
        side,
        oddsAmerican,
        probability:Number.isFinite(Number(row?.probability)) ? Number(row.probability) : null,
        selectionLink:row?.selectionLink || row?.deepLink || row?.link || null
      });
    }
  }
  return out;
}

function saferLineChoice(leg, steps = 1) {
  const current = Number(leg?.line);
  if (!Number.isFinite(current)) return null;
  const side = normalizeSide(leg?.side);
  if (side === 'yes' || side === 'no') return null;
  const offers = offersForLeg(leg);
  if (!offers.length) return null;

  const lines = [...new Set(offers.map(row => row.line).filter(line => side === 'under' ? line > current : line < current))];
  lines.sort(side === 'under' ? (a,b) => a-b : (a,b) => b-a);
  if (!lines.length) return null;
  const targetIndex = Math.min(Math.max(1, steps) - 1, lines.length - 1);
  const targetLine = lines[targetIndex];
  const actualSteps = targetIndex + 1;
  const exact = offers.filter(row => Math.abs(row.line - targetLine) < 1e-9);
  if (!exact.length) return null;

  const preferredBook = normBook(leg?.sportsbook);
  const preferred = preferredBook ? exact.filter(row => row.book === preferredBook) : [];
  const pool = preferred.length ? preferred : exact;
  pool.sort((a,b) => b.oddsAmerican - a.oddsAmerican);
  const chosen = pool[0];
  const bookOffers = {};
  for (const row of exact) {
    const existing = bookOffers[row.book];
    if (!existing || row.oddsAmerican > existing.oddsAmerican) {
      bookOffers[row.book] = { oddsAmerican:row.oddsAmerican, selectionLink:row.selectionLink || null, betslipUrl:null };
    }
  }
  return { targetLine, actualSteps, chosen, bookOffers };
}

function withSaferLine(leg, choice) {
  return {
    ...leg,
    line:choice.targetLine,
    target:choice.targetLine,
    oddsAmerican:choice.chosen.oddsAmerican,
    sportsbook:choice.chosen.book,
    sportsbookLink:choice.chosen.selectionLink || null,
    bookOffers:choice.bookOffers,
    commandOriginalLine:Number(leg?.line),
    commandAction:'water_down'
  };
}

function sortByRisk(rows, analysis, ascending = true) {
  const map = resultById(analysis);
  const results = Array.isArray(analysis?.results) ? analysis.results : [];
  return rows.map((leg,index) => ({ leg,index,probability:probabilityForLeg(leg,map,results,index) }))
    .sort((a,b) => {
      const ap = a.probability == null ? 1 : a.probability;
      const bp = b.probability == null ? 1 : b.probability;
      return ascending ? ap-bp || a.index-b.index : bp-ap || a.index-b.index;
    });
}

function applyMentionCommand({ legs, analysis, command } = {}) {
  const original = Array.isArray(legs) ? legs.map(row => ({...row})) : [];
  let next = original.slice();
  const applied = [];
  const skipped = [];
  if (!command?.recognized) return { recognized:false, changed:false, legs:next, applied, skipped, summary:null };

  const onlyActions = command.actions.filter(action => action.type === 'only');
  for (const action of onlyActions) {
    const before = next.length;
    next = next.filter(leg => descriptorMatchesLeg(action.descriptor, leg));
    applied.push({ type:'only', before, after:next.length, descriptor:action.descriptor });
  }

  for (const action of command.actions.filter(action => action.type === 'exclude')) {
    const before = next.length;
    next = next.filter(leg => !descriptorMatchesLeg(action.descriptor, leg));
    applied.push({ type:'exclude', before, after:next.length, descriptor:action.descriptor });
  }

  if (!next.length) {
    return {
      recognized:true,
      changed:false,
      legs:original,
      applied,
      skipped,
      error:'command-removed-all-legs',
      publicMessage:'I understood the filter, but none of the parsed legs matched it, so I left the betslip unchanged.'
    };
  }

  for (const action of command.actions.filter(action => action.type === 'drop_riskiest')) {
    const ranked = sortByRisk(next, analysis, true);
    const removeIds = new Set(ranked.slice(0, Math.min(action.count, Math.max(0,next.length-1))).map(row => String(row.leg?.id || row.index)));
    const before = next.length;
    next = next.filter((leg,index) => !removeIds.has(String(leg?.id || index)));
    applied.push({ type:'drop_riskiest', before, after:next.length, count:before-next.length });
  }

  for (const action of command.actions.filter(action => action.type === 'limit')) {
    const before = next.length;
    if (before > action.count) {
      next = sortByRisk(next, analysis, false).slice(0, action.count).sort((a,b)=>a.index-b.index).map(row=>row.leg);
    }
    applied.push({ type:'limit', before, after:next.length, count:action.count });
  }

  for (const action of command.actions.filter(action => action.type === 'water_down')) {
    const candidates = next.map((leg,index) => ({ leg,index,choice:saferLineChoice(leg,action.steps) }))
      .filter(row => row.choice && (!action.scope || descriptorMatchesLeg(action.scope,row.leg)));
    let selected = candidates;
    if (!action.all && !action.scope) {
      const map = resultById(analysis);
      const results = Array.isArray(analysis?.results) ? analysis.results : [];
      selected = candidates.map(row => ({...row,probability:probabilityForLeg(row.leg,map,results,row.index)}))
        .sort((a,b) => (a.probability ?? 1)-(b.probability ?? 1) || a.index-b.index)
        .slice(0, Math.max(1, Math.ceil(candidates.length/2)));
    }
    const selectedIndexes = new Set(selected.map(row => row.index));
    next = next.map((leg,index) => {
      const row = selected.find(candidate => candidate.index === index);
      return row ? withSaferLine(leg,row.choice) : leg;
    });
    if (selected.length) {
      applied.push({ type:'water_down', count:selected.length, requestedSteps:action.steps, all:action.all, scope:action.scope || null, legs:selected.map(row => ({id:row.leg?.id||null,player:row.leg?.player||null,from:Number(row.leg?.line),to:row.choice.targetLine,steps:row.choice.actualSteps})) });
    } else {
      skipped.push({ type:'water_down', reason:'no-verified-safer-alternate-lines', scope:action.scope || null });
    }
  }

  const changed = next.length !== original.length || next.some((leg,index) => {
    const prior = original.find(row => String(row?.id || '') === String(leg?.id || '')) || original[index];
    return !prior || Number(prior?.line) !== Number(leg?.line) || String(prior?.sportsbook || '') !== String(leg?.sportsbook || '');
  });

  const filterChange = applied.find(row => ['only','exclude','drop_riskiest','limit'].includes(row.type) && row.before !== row.after);
  const watered = applied.find(row => row.type === 'water_down' && row.count > 0);
  let summary = null;
  if (watered && filterChange) summary = `filtered to ${next.length} leg${next.length===1?'':'s'} and watered down ${watered.count}`;
  else if (watered) summary = `watered down ${watered.count} leg${watered.count===1?'':'s'}${watered.requestedSteps>1?` by ${watered.requestedSteps} safer line steps`:''}`;
  else if (filterChange) summary = `filtered to ${next.length} leg${next.length===1?'':'s'}`;

  const publicMessage = !changed && skipped.some(row => row.type === 'water_down')
    ? 'I understood “water down,” but I could not find a verified safer alternate line for any matching leg, so I left the betslip unchanged.'
    : null;

  return { recognized:true, changed, legs:next, applied, skipped, summary, publicMessage };
}

function mergeAnalyzedContext(legs, analysis) {
  const results = Array.isArray(analysis?.results) ? analysis.results : [];
  const byId = resultById(analysis);
  return (Array.isArray(legs) ? legs : []).map((leg,index) => {
    const result = byId.get(String(leg?.id || '')) || results[index] || null;
    if (!result) return {...leg};
    const next = {...leg};
    for (const key of ['gameId','matchup','startTimeUTC','playerId','team','displayMarket','probability','pregameProbability']) {
      if (result[key] !== undefined && result[key] !== null && result[key] !== '') next[key] = result[key];
    }
    return next;
  });
}

function commandReplyText(baseReply, commandResult) {
  const base = String(baseReply || '').trim();
  if (!commandResult?.summary) return base || null;
  const prefix = `Adjusted: ${commandResult.summary}.`;
  if (!base) return prefix;
  const combined = `${prefix}\n${base}`;
  return combined.length <= 280 ? combined : base;
}

module.exports = {
  MAX_WATER_STEPS,
  SPORT_ALIASES,
  MARKET_ALIASES,
  extractCommandText,
  parseMentionCommand,
  descriptorFromPhrase,
  descriptorMatchesLeg,
  saferLineChoice,
  applyMentionCommand,
  mergeAnalyzedContext,
  commandReplyText
};
