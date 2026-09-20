const MARKET_WORDS = [
  { re: /receiv(?:ing)?\s*(?:yards?|yds?)|rec\s*(?:yards?|yds?)/i, market: 'recYds' },
  { re: /rush(?:ing)?\s*(?:yards?|yds?)/i, market: 'rushYds' },
  { re: /pass(?:ing)?\s*(?:yards?|yds?)/i, market: 'passYds' },
  { re: /receptions?|catches/i, market: 'receptions' },
  { re: /pass(?:ing)?\s*(?:touchdowns?|tds?)/i, market: 'passTds' },
  { re: /completions?/i, market: 'completions' }
];

function cleanPlayer(value) {
  return String(value || '')
    .replace(/^[-•✅☑️🔥🔒\s]+/, '')
    .replace(/\b(over|under|o|u)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
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
  return legs.slice(0, 20);
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

async function aiParse({ text, mediaUrls = [] }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const content = [{
    type: 'input_text',
    text: `Extract the sports-betting legs from this social post or bet slip. Only extract explicit wagers; never invent a player, line, team, or market. This first release supports NFL player props only. Convert market names to: recYds, rushYds, passYds, receptions, passTds, completions, atd. For alt lines written like 50+, set inclusive=true and line=50. For sportsbook O/U lines such as over 49.5, inclusive=false. For anytime touchdown set side=yes and line=null. Ignore payout, stake, boosts, and already-settled result annotations. Post text:\n${String(text || '').slice(0, 6000)}`
  }];
  for (const url of mediaUrls.slice(0, 4)) content.push({ type: 'input_image', image_url: url, detail: 'high' });

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
      input: [{ role: 'user', content }],
      text: { format: { type: 'json_schema', name: 'parlayping_slip', strict: true, schema } }
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Vision parse failed (${response.status})`);
  const raw = responseText(payload);
  if (!raw) throw new Error('Vision parser returned no structured output.');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed?.legs) ? parsed.legs : [];
}

async function parseSlip({ text = '', mediaUrls = [] } = {}) {
  let method = 'heuristic';
  let legs = [];
  if (process.env.OPENAI_API_KEY) {
    try {
      legs = await aiParse({ text, mediaUrls });
      method = mediaUrls.length ? 'vision' : 'ai-text';
    } catch (error) {
      console.error('ParlayPing AI parser fallback', error?.message || error);
    }
  }
  if (!legs?.length) legs = heuristicParse(text);
  return { legs: (legs || []).slice(0, 20), method };
}

module.exports = { parseSlip, heuristicParse };
