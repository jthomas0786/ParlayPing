const FOOTBALL_MARKET_WORDS = [
  { re: /receiv(?:ing)?\s*(?:yards?|yds?)|rec\s*(?:yards?|yds?)/i, market: 'recYds' },
  { re: /rush(?:ing)?\s*(?:yards?|yds?)/i, market: 'rushYds' },
  { re: /pass(?:ing)?\s*(?:yards?|yds?)/i, market: 'passYds' },
  { re: /receptions?|catches/i, market: 'receptions' },
  { re: /pass(?:ing)?\s*(?:touchdowns?|tds?)/i, market: 'passTds' },
  { re: /completions?/i, market: 'completions' }
];

const MLB_MARKET_WORDS = [
  { re: /hits?\s*\+\s*runs?\s*\+\s*rbi(?:s)?|hits?\s+runs?\s+rbi(?:s)?/i, market:'hrr' },
  { re: /total\s+bases?/i, market:'totalBases' },
  { re: /stolen\s+bases?/i, market:'stolenBases' },
  { re: /runs?\s+batted\s+in|\brbi(?:s)?\b/i, market:'rbi' },
  { re: /\bhits?\b/i, market:'hits' }
];

const NHL_MARKET_WORDS = [
  { re: /shots?\s+on\s+goal|\bsog\b/i, market:'shotsOnGoal', strong:true },
  { re: /blocked\s+shots?/i, market:'blocks', strong:true },
  { re: /\bsaves?\b/i, market:'saves', strong:false },
  { re: /\bassists?\b/i, market:'assists', strong:false },
  { re: /\bpoints?\b/i, market:'points', strong:false },
  { re: /\bgoals?\b/i, market:'goals', strong:false }
];

const BASKETBALL_MARKET_WORDS = [
  { re: /points?\s*\+\s*rebounds?\s*\+\s*assists?|pts?\s*\+\s*reb\s*\+\s*ast|\bpra\b/i, market:'pra' },
  { re: /points?\s*\+\s*rebounds?|pts?\s*\+\s*reb|\bpr\b/i, market:'ptsRebs' },
  { re: /points?\s*\+\s*assists?|pts?\s*\+\s*ast|\bpa\b/i, market:'ptsAsts' },
  { re: /rebounds?\s*\+\s*assists?|reb\s*\+\s*ast|\bra\b/i, market:'rebsAsts' },
  { re: /three[-\s]?pointers?\s+(?:made|makes?)|3[-\s]?pointers?\s+(?:made|makes?)|\b3pm\b|\bthrees?\b/i, market:'threes' },
  { re: /\bturnovers?\b/i, market:'turnovers' },
  { re: /\bsteals?\b/i, market:'steals' },
  { re: /\bblocks?\b/i, market:'blocks' },
  { re: /\bassists?\b/i, market:'assists' },
  { re: /\brebounds?\b|\breb\b/i, market:'rebounds' },
  { re: /\bpoints?\b|\bpts\b/i, market:'points' }
];

const SPORT_ENUM = ['NFL','NCAAF','NBA','NCAAB','WNBA','MLB','NHL','SOCCER','TENNIS','MMA','GOLF','CRICKET','ESPORTS','TABLE_TENNIS','RUGBY','VOLLEYBALL','MOTORSPORTS','OTHER'];
const FOOTBALL_MARKETS = new Set(['recYds','rushYds','passYds','receptions','passTds','completions','atd']);
const MLB_MARKETS = new Set(['homeRun','hits','totalBases','rbi','hrr','stolenBases']);
const NHL_MARKETS = new Set(['shotsOnGoal','points','assists','goals','anytimeGoal','blocks','saves']);
const BASKETBALL_MARKETS = new Set(['points','rebounds','assists','threes','steals','blocks','turnovers','pra','ptsRebs','ptsAsts','rebsAsts','doubleDouble','tripleDouble']);

function cleanPlayer(value) {
  return String(value || '').replace(/^[-•✅☑️🔥🔒\s]+/, '').replace(/\b(over|under|o|u)\s*$/i, '').replace(/\s+/g, ' ').trim();
}
function normalizePlayerKey(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[.'’]/g, '').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function normalizeSport(value) {
  const raw = String(value || 'OTHER').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const aliases = { CFB:'NCAAF', NCAAFOOTBALL:'NCAAF', COLLEGEFOOTBALL:'NCAAF', COLLEGEBASKETBALL:'NCAAB', NCAAM:'NCAAB', NCAAMBB:'NCAAB', PROBASKETBALL:'NBA', BASKETBALL:'NBA', WOMENSNBA:'WNBA', UFC:'MMA', MIXEDMARTIALARTS:'MMA', BASEBALL:'MLB', PROBASEBALL:'MLB', MAJORLEAGUEBASEBALL:'MLB', HOCKEY:'NHL', PROHOCKEY:'NHL', NATIONALHOCKEYLEAGUE:'NHL', TABLETENNIS:'TABLE_TENNIS', PINGPONG:'TABLE_TENNIS' };
  const sport = aliases[raw] || raw;
  return SPORT_ENUM.includes(sport) ? sport : 'OTHER';
}
function sanitizeLeg(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const player = cleanPlayer(raw.player);
  const market = String(raw.market || '').trim();
  if (!player || player.length < 2 || !/^[A-Za-z][A-Za-z0-9_]{1,63}$/.test(market)) return null;
  const sport = normalizeSport(raw.sport);
  const binary = ['atd','anytimeGoal','homeRun','doubleDouble','tripleDouble','toReceiveCard','matchWinner','fightWinner'].includes(market);
  const side = binary ? String(raw.side || 'yes').toLowerCase() : String(raw.side || 'over').toLowerCase();
  if (!['over','under','yes','no'].includes(side)) return null;
  const line = raw.line == null ? null : Number(raw.line);
  if (!binary && !Number.isFinite(line)) return null;
  if (Number.isFinite(line) && (line < 0 || line > 100000)) return null;
  return {
    sport,
    player,
    team: raw.team ? String(raw.team).trim().toUpperCase() : null,
    market,
    side,
    line: binary && raw.line == null ? null : line,
    inclusive: binary ? true : Boolean(raw.inclusive),
    originalText: String(raw.originalText || '').trim().slice(0, 240)
  };
}
function dedupeLegs(rawLegs) {
  const out = [], seen = new Set();
  for (const raw of Array.isArray(rawLegs) ? rawLegs : []) {
    const leg = sanitizeLeg(raw); if (!leg) continue;
    const key = [leg.sport, normalizePlayerKey(leg.player), leg.market, leg.side, leg.line ?? 'null', leg.inclusive ? '1' : '0'].join('|');
    if (seen.has(key)) continue;
    seen.add(key); out.push(leg); if (out.length >= 20) break;
  }
  return out;
}
function heuristicSport(text) {
  if (/\b(table\s+tennis|ping[\s-]?pong)\b/i.test(text)) return 'TABLE_TENNIS';
  if (/\b(wnba|women'?s national basketball association)\b/i.test(text)) return 'WNBA';
  if (/\b(ncaab|ncaam|college basketball|ncaa basketball)\b/i.test(text)) return 'NCAAB';
  if (/\b(nba|national basketball association)\b/i.test(text)) return 'NBA';
  if (/\b(mlb|major league baseball|baseball)\b/i.test(text)) return 'MLB';
  if (/\b(nhl|national hockey league|hockey)\b/i.test(text)) return 'NHL';
  if (/\b(ncaaf|cfb|college football|ncaa football)\b/i.test(text)) return 'NCAAF';
  if (/\b(ufc|mma|mixed martial arts)\b/i.test(text)) return 'MMA';
  if (/\b(tennis|atp|wta)\b/i.test(text)) return 'TENNIS';
  if (/\b(soccer|football club|premier league|epl|mls|la liga|bundesliga|serie a|ligue 1)\b/i.test(text)) return 'SOCCER';
  if (/\b(total\s+bases?|stolen\s+bases?|rbi(?:s)?|hits?\s*\+\s*runs?\s*\+\s*rbi(?:s)?|hits?)\b/i.test(text)) return 'MLB';
  if (/\b(rebounds?|pra|3pm|three[-\s]?pointers?|double[-\s]?double|triple[-\s]?double|turnovers?)\b/i.test(text)) return 'NBA';
  return 'NFL';
}
function numericLegFromLine(line, word, sport) {
  const number = line.match(/(?:over|under|o|u)?\s*(\d+(?:\.\d+)?)\s*\+?/i);
  if (!number) return null;
  const value = Number(number[1]);
  const marketMatch = line.match(word.re);
  const numberIndex = line.indexOf(number[0]);
  let player = cleanPlayer(line.slice(0, numberIndex));
  if (marketMatch && word.re.test(player)) player = cleanPlayer(line.slice(0, marketMatch.index || 0));
  if (!player || player.length < 2) player = cleanPlayer(line.slice(0, marketMatch?.index || 0));
  if (!player) return null;
  const under = /\bunder\b|\bU\s*\d/i.test(line);
  const inclusive = /\d+(?:\.\d+)?\s*\+/.test(line);
  return { sport, player, team:null, market:word.market, side:under?'under':'over', line:value, inclusive, originalText:line };
}
function heuristicParse(text) {
  const contextSport = heuristicSport(text);
  const lines = String(text || '').split(/\n|\r|;|\s+[|]\s+/).map(s => s.trim()).filter(Boolean);
  const legs = [];
  const basketballContext=['NBA','NCAAB','WNBA'].includes(contextSport);
  for (const line of lines) {
    if (['TABLE_TENNIS','TENNIS','MMA'].includes(contextSport)) {
      const winner=line.match(/^(.{2,70}?)(?:\s+[-–—:]?\s*)(match\s+winner|fight\s+winner|to\s+win\s+(?:the\s+)?(?:match|fight)|moneyline)\b/i);
      if(winner){
        const player=cleanPlayer(winner[1]);
        const market=contextSport==='MMA'?'fightWinner':'matchWinner';
        if(player)legs.push({sport:contextSport,player,team:null,market,side:'yes',line:null,inclusive:true,originalText:line});
        continue;
      }
    }
    if (basketballContext) {
      const dd=line.match(/^(.{2,70}?)(?:\s+[-–—:]?\s*)(?:to\s+record\s+(?:a\s+)?|(?:yes\s+)?)(double[-\s]?double|triple[-\s]?double)\b/i);
      if(dd){const player=cleanPlayer(dd[1]),market=/triple/i.test(dd[2])?'tripleDouble':'doubleDouble';if(player)legs.push({sport:contextSport,player,team:null,market,side:'yes',line:null,inclusive:true,originalText:line});continue;}
      let basketballMatched=false;
      for(const word of BASKETBALL_MARKET_WORDS){
        if(!word.re.test(line))continue;
        const leg=numericLegFromLine(line,word,contextSport);if(leg){legs.push(leg);basketballMatched=true;break;}
      }
      if(basketballMatched)continue;
    }

    const homeRun = line.match(/^(.{2,70}?)(?:\s+[-–—:]?\s*)(?:to\s+(?:hit|record)\s+(?:a\s+)?home\s+run|(?:anytime\s+)?home\s+run|to\s+homer|homer)\b/i);
    if (homeRun) {
      const player=cleanPlayer(homeRun[1]);
      if(player) legs.push({sport:'MLB',player,team:null,market:'homeRun',side:'yes',line:null,inclusive:true,originalText:line});
      continue;
    }
    let matched=false;
    if(contextSport==='MLB') for(const word of MLB_MARKET_WORDS){
      if(!word.re.test(line)) continue;
      const leg=numericLegFromLine(line,word,'MLB');
      if(leg){legs.push(leg);matched=true;break;}
    }
    if(matched) continue;

    const anytimeGoal = line.match(/^(.{2,70}?)(?:\s+[-–—:]?\s*)(?:anytime\s+(?:goal|goal\s+scorer)|to\s+score(?:\s+a\s+goal)?|to\s+record\s+(?:a\s+)?goal)\b/i);
    if (anytimeGoal && contextSport === 'NHL') {
      const player=cleanPlayer(anytimeGoal[1]);
      if(player) legs.push({sport:'NHL',player,team:null,market:'anytimeGoal',side:'yes',line:null,inclusive:true,originalText:line});
      continue;
    }
    for(const word of NHL_MARKET_WORDS){
      if(!word.re.test(line)) continue;
      if(contextSport!=='NHL'&&!word.strong) continue;
      const leg=numericLegFromLine(line,word,'NHL');
      if(leg){legs.push(leg);matched=true;break;}
    }
    if(matched) continue;

    const atd = line.match(/^(.{2,50}?)(?:\s+[-–—:]?\s*)(?:anytime\s+(?:touchdown|td)|to\s+score(?:\s+a\s+touchdown)?|atd)\b/i);
    if (atd) {
      const player = cleanPlayer(atd[1]);
      if (player) legs.push({ sport:['MLB','NHL','NBA','NCAAB','WNBA'].includes(contextSport)?'NFL':contextSport, player, team:null, market:'atd', side:'yes', line:null, inclusive:true, originalText:line });
      continue;
    }
    for (const word of FOOTBALL_MARKET_WORDS) {
      if (!word.re.test(line)) continue;
      const leg=numericLegFromLine(line,word,['MLB','NHL','NBA','NCAAB','WNBA'].includes(contextSport)?'NFL':contextSport);
      if(leg) legs.push(leg);
      break;
    }
  }
  return dedupeLegs(legs);
}
function responseText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const item of payload?.output || []) for (const content of item?.content || []) if (typeof content?.text === 'string') return content.text;
  return '';
}
function normalizeMediaUrls(mediaUrls) {
  const out = [];
  for (const raw of Array.isArray(mediaUrls) ? mediaUrls : []) {
    const value = String(raw || '').trim(); if (!value) continue;
    if (/^https:\/\//i.test(value) || /^data:image\/(png|jpe?g|webp);base64,/i.test(value)) out.push(value);
    if (out.length >= 4) break;
  }
  return out;
}
function openAiTimeoutMs(){
  const configured=Number(process.env.OPENAI_TIMEOUT_MS);
  return Number.isFinite(configured)?Math.max(3000,Math.min(30000,Math.round(configured))):12000;
}
async function aiParse({ text, mediaUrls = [] }) {
  const key = process.env.OPENAI_API_KEY; if (!key) return null;
  const images = normalizeMediaUrls(mediaUrls);
  const instructions = [
    'Extract explicit player-prop wagers from the supplied social post and/or sportsbook bet-slip screenshots.',
    'Classify EACH leg by sport/league. Do not force a college player into a pro league. Use NCAAF for NCAA/college football, NBA for NBA, WNBA for WNBA, NCAAB for NCAA/college basketball, MLB for Major League Baseball, NHL for National Hockey League, SOCCER for soccer, TENNIS for tennis, MMA for UFC/MMA, ESPORTS for esports, and TABLE_TENNIS for table tennis or ping pong. A mixed-sport slip may contain different sports on different legs.',
    'If the league is visibly shown, use it. If it is not shown, use player/team/market context only when confident; otherwise use OTHER.',
    'Never invent or repair a player, line, team, market, or side that is not supported by the visible content.',
    'Treat each visible wager selection as one leg. Ignore odds, stake, payout, boosts, sportsbook branding, game totals, spreads, unrelated team/game moneylines, settled icons, cash-out text, and promotional copy. Tennis/Table Tennis explicit player match-winner selections and MMA fighter-winner selections are valid legs and should not be discarded as generic moneylines.',
    'If the same leg appears more than once because of repeated UI elements, output it only once.',
    'Canonical football markets: receiving yards=recYds, rushing yards=rushYds, passing yards=passYds, receptions=receptions, passing touchdowns=passTds, completions=completions, anytime touchdown=atd.',
    'Canonical basketball markets for NBA/WNBA/NCAAB: points=points, rebounds=rebounds, assists=assists, made three-pointers=threes, steals=steals, blocks=blocks, turnovers=turnovers, points+rebounds+assists=pra, points+rebounds=ptsRebs, points+assists=ptsAsts, rebounds+assists=rebsAsts, double-double=doubleDouble (yes/no binary), triple-double=tripleDouble (yes/no binary).',
    'Canonical MLB markets currently supported by ParlayPing: to hit a home run/home run=homeRun (yes/no binary), hits=hits, total bases=totalBases, RBI=rbi, hits+runs+RBI=hrr, stolen bases=stolenBases. Do not rename MLB home run to homeRuns.',
    'Canonical NHL markets currently supported by ParlayPing: shots on goal/SOG=shotsOnGoal, points=points, assists=assists, goals=goals, anytime goal scorer=anytimeGoal (yes/no binary), blocked shots=blocks, goalie saves=saves.',
    'Canonical extended winner markets: Tennis match winner=matchWinner (yes/no binary), Table Tennis/Ping Pong match winner=matchWinner (yes/no binary), MMA/UFC fight winner=fightWinner (yes/no binary).',
    'For other sports use concise canonical camelCase keys such as goals, aces, or significantStrikes. Do not convert one market into another.',
    'Examples: 50+ Receiving Yards => recYds, over, line 50, inclusive true. Over 49.5 Receiving Yards => recYds, over, 49.5, inclusive false. Anytime TD => atd, yes, line null. 25+ Points => basketball points, over, line 25, inclusive true. Over 24.5 Points => basketball points, over, line 24.5, inclusive false. 10+ Rebounds => rebounds, over, line 10, inclusive true. 3+ Made Threes => threes, over, line 3, inclusive true. Double Double => doubleDouble, yes, line null. 1+ Hits => MLB hits, over, line 1, inclusive true. Over 0.5 Hits => MLB hits, over, 0.5, inclusive false. 2+ Total Bases => MLB totalBases, over, line 2, inclusive true. To Hit a Home Run => MLB homeRun, yes, line null. 3+ Shots on Goal => NHL shotsOnGoal, over, line 3, inclusive true. Over 2.5 Shots on Goal => NHL shotsOnGoal, over, line 2.5, inclusive false. Anytime Goal Scorer => NHL anytimeGoal, yes, line null. Table Tennis Match Winner => TABLE_TENNIS matchWinner, yes, line null. UFC Fight Winner => MMA fightWinner, yes, line null.',
    'For originalText, copy a short visible phrase supporting the leg. If player + market + line/binary selection cannot be read confidently, omit the leg.'
  ].join(' ');
  const content = [{ type:'input_text', text:`${instructions}\n\nPost text (may be empty):\n${String(text || '').slice(0,6000)}` }];
  for (const url of images) content.push({ type:'input_image', image_url:url, detail:'high' });
  const schema = {
    type:'object', additionalProperties:false,
    properties:{ legs:{ type:'array', maxItems:20, items:{
      type:'object', additionalProperties:false,
      properties:{
        sport:{type:'string',enum:SPORT_ENUM}, player:{type:'string'}, team:{type:['string','null']}, market:{type:'string'},
        side:{type:'string',enum:['over','under','yes','no']}, line:{type:['number','null']}, inclusive:{type:'boolean'}, originalText:{type:'string'}
      },
      required:['sport','player','team','market','side','line','inclusive','originalText']
    }}}
    ,required:['legs']
  };
  const signal=typeof AbortSignal==='function'&&typeof AbortSignal.timeout==='function'?AbortSignal.timeout(openAiTimeoutMs()):undefined;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method:'POST', headers:{'content-type':'application/json',authorization:`Bearer ${key}`},signal,
    body:JSON.stringify({ model:process.env.OPENAI_MODEL || 'gpt-5.6-luna', store:false, reasoning:{effort:'none'}, max_output_tokens:1800,
      input:[{role:'user',content}], text:{format:{type:'json_schema',name:'parlayping_slip',strict:true,schema}} })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Vision parse failed (${response.status})`);
  const raw = responseText(payload); if (!raw) throw new Error('Vision parser returned no structured output.');
  return dedupeLegs(JSON.parse(raw)?.legs);
}
async function parseSlip({ text = '', mediaUrls = [] } = {}) {
  const images = normalizeMediaUrls(mediaUrls);
  let method='heuristic', legs=[], visionError=null;
  if (process.env.OPENAI_API_KEY) {
    try { legs=await aiParse({text,mediaUrls:images}); method=images.length?'vision':'ai-text'; }
    catch(error){ visionError=error?.message||String(error); console.error('ParlayPing AI parser fallback',visionError); }
  }
  if (!legs?.length) {
    legs=heuristicParse(text);
    if (images.length&&!process.env.OPENAI_API_KEY) method='vision-unconfigured';
    else if (images.length&&visionError) method='vision-fallback';
  }
  legs=dedupeLegs(legs);
  const sports=[...new Set(legs.map(l=>l.sport))];
  return { legs, sports, sport:sports.length===1?sports[0]:sports.length?'MIXED':null, method, mediaCount:images.length, visionConfigured:Boolean(process.env.OPENAI_API_KEY), ...(visionError?{visionError}:{}) };
}

module.exports = { parseSlip, heuristicParse, dedupeLegs, sanitizeLeg, normalizeMediaUrls, normalizeSport, SPORT_ENUM, FOOTBALL_MARKETS, MLB_MARKETS, NHL_MARKETS, BASKETBALL_MARKETS, openAiTimeoutMs };
