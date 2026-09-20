const MARKET_WORDS = [
  { re: /receiv(?:ing)?\s*(?:yards?|yds?)|rec\s*(?:yards?|yds?)/i, market: 'recYds' },
  { re: /rush(?:ing)?\s*(?:yards?|yds?)/i, market: 'rushYds' },
  { re: /pass(?:ing)?\s*(?:yards?|yds?)/i, market: 'passYds' },
  { re: /receptions?|catches/i, market: 'receptions' },
  { re: /pass(?:ing)?\s*(?:touchdowns?|tds?)/i, market: 'passTds' },
  { re: /completions?/i, market: 'completions' }
];

const SUPPORTED_MARKETS = new Set(['recYds','rushYds','passYds','receptions','passTds','completions','atd']);

function cleanPlayer(value) {
  return String(value || '')
    .replace(/^[-•✅☑️🔥🔒\s]+/, '')
    .replace(/\b(over|under|o|u)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePlayerKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[.'’]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sanitizeLeg(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const player = cleanPlayer(raw.player);
  const market = String(raw.market || '').trim();
  if (!player || player.length < 2 || !SUPPORTED_MARKETS.has(market)) return null;

  const side = market === 'atd' ? 'yes' : String(raw.side || 'over').toLowerCase();
  if (!['over','under','yes'].includes(side)) return null;

  let line = market === 'atd' ? null : Number(raw.line);
  if (market !== 'atd' && !Number.isFinite(line)) return null;
  if (Number.isFinite(line) && (line < 0 || line > 1000)) return null;

  return {
    player,
    team: raw.team ? String(raw.team).trim().toUpperCase() : null,
    market,
    side,
    line,
    inclusive: market === 'atd' ? true : Boolean(raw.inclusive),
    originalText: String(raw.originalText || '').trim().slice(0, 240)
  };
}

function dedupeLegs(rawLegs) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(rawLegs) ? rawLegs : []) {
    const leg = sanitizeLeg(raw);
    if (!leg) continue;
    const key = [normalizePlayerKey(leg.player), leg.market, leg.side, leg.line ?? 'null', leg.inclusive ? '1' : '0'].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(leg);
    if (out.length >= 20) break;
  }
  return out;
}

function heuristicParse(text) {
  const lines = String(text || '').split(/\n|\r|;|\s+[|]\s+/).map(s => s.trim()).filter(Boolean);
  const legs = [];
  for (const line of lines) {
    const atd = line.match(/^(.{2,50}?)(?:\s+[-–—:]?\s*)(?:anytime\s+(?:touchdown|td)|to\s+score(?:\s+a\s+touchdown)?|atd)\b/i);
    if (atd) {
      const player = cleanPlayer(atd[1]);
      if (player) legs.push({ player, team: null, market: 'atd', side: 'yes', line: null, inclusive: true, originalText: line });
      continue;
    }
    for (const word of MARKET_WORDS) {
      if (!word.re.test(line)) continue;
      const number = line.match(/(?:over|under|o|u)?\s*(\d+(?:\.\d+)?)\s*\+?/i);
      if (!number) continue;
      const value = Number(number[1]);
      const numberIndex = line.indexOf(number[0]);
      let player = cleanPlayer(line.slice(0, numberIndex));
      if (!player || player.length < 2) {
        const marketMatch = line.match(word.re);
        player = cleanPlayer(line.slice(0, marketMatch?.index || 0));
      }
      if (!player) continue;
      const under = /\bunder\b|\bU\s*\d/i.test(line);
      const inclusive = /\d+(?:\.\d+)?\s*\+/.test(line);
      legs.push({ player, team: null, market: word.market, side: under ? 'under' : 'over', line: value, inclusive, originalText: line });
      break;
    }
  }
  return dedupeLegs(legs);
}

function responseText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') return content.text;
    }
  }
  return '';
}

function normalizeMediaUrls(mediaUrls) {
  const out = [];
  for (const raw of Array.isArray(mediaUrls) ? mediaUrls : []) {
    const value = String(raw || '').trim();
    if (!value) continue;
    if (/^https:\/\//i.test(value) || /^data:image\/(png|jpe?g|webp);base64,/i.test(value)) out.push(value);
    if (out.length >= 4) break;
  }
  return out;
}

async function aiParse({ text, mediaUrls = [] }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const images = normalizeMediaUrls(mediaUrls);
  const instructions = [
    'Extract explicit NFL player-prop wagers from the supplied social post and/or sportsbook bet-slip screenshots.',
    'Never infer, repair, or invent a player, line, team, market, or side that is not visibly present in the supplied content.',
    'Treat each visible wager selection as one leg. Ignore odds, stake, payout, parlay boost, sportsbook branding, game totals, spreads, moneylines, settled-result icons, cash-out text, and promotional copy.',
    'If the same leg appears more than once because of repeated UI elements, output it only once.',
    'Supported markets only: receiving yards=recYds, rushing yards=rushYds, passing yards=passYds, receptions=receptions, passing touchdowns=passTds, completions=completions, anytime touchdown=atd.',
    'Examples: 50+ Receiving Yards => market recYds, side over, line 50, inclusive true. Over 49.5 Receiving Yards => recYds, over, 49.5, inclusive false. Anytime TD => atd, side yes, line null.',
    'For originalText, copy a short visible phrase from the source that supports the extracted leg. If a leg cannot be read confidently enough to identify player + supported market + line/ATD, omit it.',
    'This release supports NFL player props only. Do not convert unsupported wager types into supported ones.'
  ].join(' ');

  const content = [{
    type: 'input_text',
    text: `${instructions}\n\nPost text (may be empty or just @ParlayPing):\n${String(text || '').slice(0, 6000)}`
  }];
  for (const url of images) content.push({ type: 'input_image', image_url: url, detail: 'high' });

  const schema = {
    type: 'object', additionalProperties: false,
    properties: {
      sport: { type: 'string', enum: ['NFL'] },
      legs: { type: 'array', maxItems: 20, items: {
        type: 'object', additionalProperties: false,
        properties: {
          player: { type: 'string' },
          team: { type: ['string','null'] },
          market: { type: 'string', enum: ['recYds','rushYds','passYds','receptions','passTds','completions','atd'] },
          side: { type: 'string', enum: ['over','under','yes'] },
          line: { type: ['number','null'] },
          inclusive: { type: 'boolean' },
          originalText: { type: 'string' }
        },
        required: ['player','team','market','side','line','inclusive','originalText']
      }}
    },
    required: ['sport','legs']
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
      store: false,
      reasoning: { effort: 'none' },
      max_output_tokens: 1800,
      input: [{ role: 'user', content }],
      text: { format: { type: 'json_schema', name: 'parlayping_slip', strict: true, schema } }
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Vision parse failed (${response.status})`);
  const raw = responseText(payload);
  if (!raw) throw new Error('Vision parser returned no structured output.');
  const parsed = JSON.parse(raw);
  return dedupeLegs(parsed?.legs);
}

async function parseSlip({ text = '', mediaUrls = [] } = {}) {
  const images = normalizeMediaUrls(mediaUrls);
  let method = 'heuristic';
  let legs = [];
  let visionError = null;

  if (process.env.OPENAI_API_KEY) {
    try {
      legs = await aiParse({ text, mediaUrls: images });
      method = images.length ? 'vision' : 'ai-text';
    } catch (error) {
      visionError = error?.message || String(error);
      console.error('ParlayPing AI parser fallback', visionError);
    }
  }

  if (!legs?.length) {
    legs = heuristicParse(text);
    if (images.length && !process.env.OPENAI_API_KEY) method = 'vision-unconfigured';
    else if (images.length && visionError) method = 'vision-fallback';
  }

  return {
    legs: dedupeLegs(legs),
    method,
    mediaCount: images.length,
    visionConfigured: Boolean(process.env.OPENAI_API_KEY),
    ...(visionError ? { visionError } : {})
  };
}

module.exports = { parseSlip, heuristicParse, dedupeLegs, sanitizeLeg, normalizeMediaUrls };
