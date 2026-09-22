const { finiteOrNull, probabilityOrNull } = require('./share-slip');

const WIDTH = 1200;
const HEIGHT = 675;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function pct(value) {
  const n = probabilityOrNull(value);
  return n == null ? null : `${(n * 100).toFixed(1)}%`;
}

function formatOdds(value) {
  const n = finiteOrNull(value);
  if (n == null || n === 0) return null;
  const rounded = Math.round(n);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function normalizeStatus(value) {
  const raw = String(value || 'PENDING').toUpperCase();
  return ['PENDING','LIVE','HIT','MISS','PUSH','VOID','UNRESOLVED'].includes(raw) ? raw : 'PENDING';
}

function resolveLegDisplay(leg = {}) {
  const status = normalizeStatus(leg.status ?? leg.state);
  const odds = formatOdds(leg.oddsAmerican ?? leg.odds ?? leg.price) || '—';
  const pregame = probabilityOrNull(leg.pregameProbability);
  const live = probabilityOrNull(leg.liveProbability);
  const progress = String(leg.progressText || '').trim() || null;

  if (status === 'PENDING') {
    return {
      status,
      displayOddsText: odds,
      displayProbabilityText: pct(pregame),
      displayProbabilityCompact: pct(pregame),
      displayProgressText: progress || 'NOT STARTED',
      probabilityKind: pregame == null ? 'unavailable' : 'pregame',
      badgeText: 'PENDING',
    };
  }

  if (status === 'LIVE') {
    if (live != null) {
      return {
        status,
        displayOddsText: odds,
        displayProbabilityText: `${pct(live)} to hit`,
        displayProbabilityCompact: pct(live),
        displayProgressText: progress ? `LIVE • ${progress}` : 'LIVE',
        probabilityKind: 'live',
        badgeText: 'LIVE',
      };
    }
    if (pregame != null) {
      return {
        status,
        displayOddsText: odds,
        displayProbabilityText: `Pregame: ${pct(pregame)}`,
        displayProbabilityCompact: `PG ${pct(pregame)}`,
        displayProgressText: progress ? `LIVE • ${progress}` : 'LIVE',
        probabilityKind: 'pregame_fallback',
        badgeText: 'LIVE',
      };
    }
    return {
      status,
      displayOddsText: odds,
      displayProbabilityText: null,
      displayProbabilityCompact: null,
      displayProgressText: progress ? `LIVE • ${progress}` : 'LIVE',
      probabilityKind: 'unavailable',
      badgeText: 'LIVE',
    };
  }

  const labels = { HIT:'HIT', MISS:'MISS', PUSH:'PUSH', VOID:'VOID', UNRESOLVED:'UNRESOLVED' };
  return {
    status,
    displayOddsText: odds,
    displayProbabilityText: null,
    displayProbabilityCompact: null,
    displayProgressText: null,
    probabilityKind: 'hidden',
    badgeText: labels[status] || status,
  };
}

function statusCounts(legs = []) {
  const counts = { hit:0, miss:0, live:0, pending:0, push:0, void:0, unresolved:0 };
  for (const leg of legs) {
    const key = normalizeStatus(leg?.status).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(counts, key)) counts[key] += 1;
  }
  return counts;
}

function resolveSlipState(legs = []) {
  if (!legs.length) return 'empty';
  const states = legs.map(leg => normalizeStatus(leg?.status));
  if (states.every(state => state === 'PENDING')) return 'pregame';
  if (states.every(state => ['HIT','MISS','PUSH','VOID','UNRESOLVED'].includes(state))) return 'final';
  return 'mixed_live';
}

function summaryText(legs = []) {
  const counts = statusCounts(legs);
  const parts = [];
  if (counts.hit) parts.push(`${counts.hit} Hit`);
  if (counts.miss) parts.push(`${counts.miss} Miss`);
  if (counts.live) parts.push(`${counts.live} Live`);
  if (counts.pending) parts.push(`${counts.pending} Pending`);
  if (counts.push) parts.push(`${counts.push} Push`);
  if (counts.void) parts.push(`${counts.void} Void`);
  if (counts.unresolved) parts.push(`${counts.unresolved} Unresolved`);
  return parts.join(' • ') || 'No leg status available';
}

function selectVisibleLegs(legs = [], context = 'share', limit = 6) {
  const rows = legs.map((leg, index) => ({ ...leg, __index:index }));
  if (context !== 'x_reply') return rows.slice(0, limit);
  const priority = { LIVE:0, HIT:1, MISS:1, PUSH:1, VOID:1, PENDING:2, UNRESOLVED:3 };
  return rows
    .sort((a,b) => (priority[normalizeStatus(a.status)] ?? 9) - (priority[normalizeStatus(b.status)] ?? 9) || a.__index - b.__index)
    .slice(0, limit);
}

function safeAssetUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const allowed = [
      'parlayping.net','www.parlayping.net','thesportsoutpost.com','www.thesportsoutpost.com',
      'a.espncdn.com','cdn.espn.com','static.www.nfl.com','static.nfl.com','cdn.nba.com',
      'img.mlbstatic.com','images.ctfassets.net','assets.nhle.com','cms.nhl.bamgrid.com',
      'raw.githubusercontent.com','avatars.githubusercontent.com'
    ];
    if (!allowed.some(domain => host === domain || host.endsWith(`.${domain}`))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0,2).map(part => part[0]?.toUpperCase()).join('') || '?';
}

function displayMarket(leg) {
  if (leg.displayMarket) return String(leg.displayMarket);
  const market = String(leg.market || '').trim();
  const side = String(leg.side || '').trim();
  const line = finiteOrNull(leg.line);
  if (/atd|anytime.*touchdown/i.test(market)) return 'Anytime TD Scorer';
  if (line != null && side) return `${side.charAt(0).toUpperCase()+side.slice(1)} ${line} ${market}`.trim();
  return market || 'Prop';
}

function truncate(value, max) {
  const text = String(value || '');
  return text.length <= max ? text : `${text.slice(0, Math.max(1,max-1))}…`;
}

function statusColor(status) {
  const map = { LIVE:'#22f0d2', HIT:'#49f59f', MISS:'#ff667d', PENDING:'#8fa9bf', PUSH:'#f2c86b', VOID:'#b5a7ff', UNRESOLVED:'#f2c86b' };
  return map[normalizeStatus(status)] || '#8fa9bf';
}

function canonicalMarkSvg(x, y, scale = 1) {
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <defs><linearGradient id="ppMarkGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4af5a2"/><stop offset="1" stop-color="#19dcff"/></linearGradient></defs>
    <path d="M10 6 H42 C53 6 61 14 61 25 C61 35 55 43 46 46 H34 V57 H10 Z" fill="#071725" stroke="url(#ppMarkGrad)" stroke-width="3.2"/>
    <path d="M16 15 H37 L34 48 L30 45 L26 49 L22 45 L18 49 L14 45 Z" fill="#f7fbff" stroke="#dff8ff" stroke-width="1.5"/>
    <circle cx="21.5" cy="23" r="4" fill="#20dfa7"/><path d="M19.4 23.1 l1.5 1.6 3.2 -3.5" fill="none" stroke="#071725" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="21.5" cy="32" r="4" fill="#20dfa7"/><path d="M19.4 32.1 l1.5 1.6 3.2 -3.5" fill="none" stroke="#071725" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="21.5" cy="41" r="4" fill="#20dfa7"/><path d="M19.4 41.1 l1.5 1.6 3.2 -3.5" fill="none" stroke="#071725" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M29 22 H35 M29 31 H34 M29 40 H33" stroke="#91a8b8" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="43" cy="28" r="5.4" fill="url(#ppMarkGrad)"/>
    <path d="M47 19 C53 21 55 24 55 28 C55 33 52 36 47 38" fill="none" stroke="url(#ppMarkGrad)" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M49 13 C58 16 62 21 62 28 C62 36 58 41 49 44" fill="none" stroke="#f7fbff" stroke-width="3.2" stroke-linecap="round"/>
  </g>`;
}

function wordmarkSvg(x, y, fontSize = 34) {
  return `<text x="${x}" y="${y}" font-family="Inter,Arial,sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="-1.2"><tspan fill="#f7fbff">Parlay</tspan><tspan fill="#20e8c1">Ping</tspan></text>`;
}

function avatarSvg(leg, x, y, size, clipId) {
  const url = safeAssetUrl(leg.playerImageUrl);
  const r = size/2;
  if (url) {
    return `<defs><clipPath id="${clipId}"><circle cx="${x+r}" cy="${y+r}" r="${r}"/></clipPath></defs><circle cx="${x+r}" cy="${y+r}" r="${r}" fill="#102b3f" stroke="#1f5268" stroke-width="2"/><image href="${esc(url)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`;
  }
  return `<circle cx="${x+r}" cy="${y+r}" r="${r}" fill="#102b3f" stroke="#1f5268" stroke-width="2"/><text x="${x+r}" y="${y+r+7}" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="19" font-weight="800" fill="#dff7ff">${esc(initials(leg.player))}</text>`;
}

function teamSvg(leg, x, y, size) {
  const url = safeAssetUrl(leg.teamLogoUrl);
  if (url) return `<image href="${esc(url)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
  const team = truncate(leg.team || leg.sport || '', 4).toUpperCase();
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="10" fill="#0c2639" stroke="#1a536b"/><text x="${x+size/2}" y="${y+size/2+5}" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="12" font-weight="800" fill="#8fdff1">${esc(team)}</text>`;
}

function legRowSvg(leg, x, y, w, h, index, compact = true) {
  const display = resolveLegDisplay(leg);
  const accent = statusColor(display.status);
  const avatar = Math.min(66, h - 22);
  const avatarX = x + 14;
  const avatarY = y + (h-avatar)/2;
  const teamSize = 42;
  const teamX = avatarX + avatar + 12;
  const teamY = y + (h-teamSize)/2;
  const textX = teamX + teamSize + 14;
  const rightX = x + w - 18;
  const playerMax = compact ? 23 : 34;
  const marketMax = compact ? 29 : 46;
  const nameSize = compact ? 20 : 23;
  const marketSize = compact ? 15 : 17;
  const oddsSize = compact ? 22 : 24;
  const probSize = compact ? 15 : 17;
  const probabilityLine = display.displayProbabilityCompact || (display.status === 'LIVE' ? '—' : null);
  const settled = ['HIT','MISS','PUSH','VOID','UNRESOLVED'].includes(display.status);
  const lower = settled ? display.badgeText : (display.displayProgressText || display.badgeText);

  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="#091f31" stroke="#17455c" stroke-width="1.6"/><rect x="${x}" y="${y}" width="5" height="${h}" rx="3" fill="${accent}" opacity=".95"/>${avatarSvg(leg,avatarX,avatarY,avatar,`avatar-${index}`)}${teamSvg(leg,teamX,teamY,teamSize)}<text x="${textX}" y="${y+34}" font-family="Inter,Arial,sans-serif" font-size="${nameSize}" font-weight="800" fill="#f7fbff">${esc(truncate(leg.player || 'Leg',playerMax))}</text><text x="${textX}" y="${y+58}" font-family="Inter,Arial,sans-serif" font-size="${marketSize}" font-weight="500" fill="#9db8cf">${esc(truncate(displayMarket(leg),marketMax))}</text><text x="${rightX}" y="${y+33}" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="${oddsSize}" font-weight="900" fill="#f7fbff">${esc(display.displayOddsText)}</text>${probabilityLine ? `<text x="${rightX}" y="${y+56}" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="${probSize}" font-weight="800" fill="${display.probabilityKind==='live'?'#20e8c1':'#91b9d2'}">${esc(probabilityLine)}</text>` : ''}<text x="${textX}" y="${y+h-13}" font-family="Inter,Arial,sans-serif" font-size="13" font-weight="800" fill="${accent}" letter-spacing=".3">${esc(truncate(lower || '',48))}</text></g>`;
}

function renderShareSvg(input = {}) {
  const slip = input.slip || {};
  const legs = Array.isArray(slip.legs) ? slip.legs : [];
  if (!legs.length) throw new Error('Cannot render an empty ParlayPing share card.');
  const context = input.context === 'x_reply' ? 'x_reply' : 'share';
  const visible = selectVisibleLegs(legs, context, 6);
  const hidden = Math.max(0, legs.length - visible.length);
  const state = resolveSlipState(legs);
  const summary = summaryText(legs);
  const combinedOdds = slip.combinedOddsVerified ? formatOdds(slip.combinedOddsAmerican) : null;
  const oneColumn = legs.length <= 3;
  const top = state === 'pregame' ? 168 : 188;
  const footerY = legs.length > 6 ? 600 : 585;
  const rowGap = 12;
  let rows = '';

  if (oneColumn) {
    const rowH = legs.length === 1 ? 150 : legs.length === 2 ? 130 : 112;
    for (let i=0;i<visible.length;i++) rows += legRowSvg(visible[i],55,top + i*(rowH+rowGap),1090,rowH,i,false);
  } else {
    const colW = 535;
    const rowH = hidden ? 106 : 112;
    const colGap = 20;
    for (let i=0;i<visible.length;i++) {
      const col = i % 2;
      const row = Math.floor(i/2);
      rows += legRowSvg(visible[i],55 + col*(colW+colGap),top + row*(rowH+rowGap),colW,rowH,i,true);
    }
  }

  let hiddenStrip = '';
  if (hidden) {
    const stripY = top + 3*(106+rowGap);
    hiddenStrip = `<rect x="55" y="${stripY}" width="1090" height="47" rx="15" fill="#081c2b" stroke="#17455c"/><text x="86" y="${stripY+31}" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="900" fill="#20e8c1">•••</text><text x="145" y="${stripY+31}" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="800" fill="#f7fbff">+${hidden} more ${hidden===1?'leg':'legs'}</text><text x="1120" y="${stripY+31}" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="13" font-weight="700" letter-spacing="1.5" fill="#7895aa">ADDITIONAL PICKS NOT SHOWN</text>`;
  }

  const summaryBar = state === 'pregame' ? '' : `<rect x="55" y="140" width="1090" height="34" rx="12" fill="#0a2639"/><circle cx="76" cy="157" r="5" fill="${state==='final'?'#49f59f':'#20e8c1'}"/><text x="91" y="163" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="800" fill="#b9d5e5">${esc(summary)}</text>`;
  const title = `${legs.length}-LEG PARLAY`;
  const pageUrl = input.pageUrl || 'https://parlayping.net';

  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#03121f"/><stop offset=".55" stop-color="#061b2a"/><stop offset="1" stop-color="#08233a"/></linearGradient><linearGradient id="cta" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#13d8df"/><stop offset="1" stop-color="#2af09b"/></linearGradient><filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect width="1200" height="675" rx="32" fill="url(#bg)"/><path d="M820 -30 C970 70 1040 190 1190 240" fill="none" stroke="#0d5361" stroke-width="95" opacity=".16"/><rect x="30" y="24" width="1140" height="627" rx="28" fill="none" stroke="#16dfe0" stroke-width="2" opacity=".7"/>${canonicalMarkSvg(55,39,1.05)}${wordmarkSvg(132,84,38)}<text x="132" y="108" font-family="Inter,Arial,sans-serif" font-size="12" font-weight="700" letter-spacing="2.4" fill="#a9c7d8">COMPARE • TAIL • WIN TOGETHER</text><text x="600" y="78" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="36" font-weight="900" fill="#f7fbff">${esc(title)}</text>${combinedOdds ? `<text x="1135" y="80" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="43" font-weight="900" fill="#20e8c1">${esc(combinedOdds)}</text>` : `<text x="1135" y="78" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="800" letter-spacing="1.3" fill="#7895aa">PARLAYPING SHARE CARD</text>`}${summaryBar}${rows}${hiddenStrip}<rect x="55" y="${footerY}" width="1090" height="50" rx="16" fill="url(#cta)" filter="url(#glow)"/><text x="600" y="${footerY+32}" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="900" letter-spacing=".7" fill="#041522">OPEN THIS BETSLIP ON PARLAYPING.NET</text><text x="1122" y="${footerY+32}" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="900" fill="#041522">›</text><text x="55" y="658" font-family="Inter,Arial,sans-serif" font-size="12" font-weight="600" fill="#66859a">${esc(truncate(pageUrl,90))}</text><text x="1145" y="658" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="12" font-weight="700" fill="#66859a">ParlayPing • Live status when available</text></svg>`;
}

module.exports = { WIDTH, HEIGHT, pct, formatOdds, resolveLegDisplay, resolveSlipState, statusCounts, summaryText, selectVisibleLegs, renderShareSvg, safeAssetUrl, canonicalMarkSvg, wordmarkSvg };
