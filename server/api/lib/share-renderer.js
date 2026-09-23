const fs = require('fs');
const path = require('path');
const { finiteOrNull, probabilityOrNull } = require('./share-slip');

const WIDTH = 1200;
const HEIGHT = 675;
const assetCache = new Map();

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function localAssetDataUri(fileName, mime) {
  const key = `${fileName}:${mime}`;
  if (assetCache.has(key)) return assetCache.get(key);
  try {
    const bytes = fs.readFileSync(path.join(process.cwd(), fileName));
    const uri = `data:${mime};base64,${bytes.toString('base64')}`;
    assetCache.set(key, uri);
    return uri;
  } catch {
    assetCache.set(key, null);
    return null;
  }
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
  const raw = String(value);
  if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(raw)) return raw;
  try {
    const url = new URL(raw);
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
  const map = { LIVE:'#24efd5', HIT:'#49f59f', MISS:'#ff5571', PENDING:'#96adc0', PUSH:'#f2c86b', VOID:'#b5a7ff', UNRESOLVED:'#f2c86b' };
  return map[normalizeStatus(status)] || '#96adc0';
}

function approvedWordmarkSvg(x, y, width = 318, height = 82) {
  const href = localAssetDataUri('parlayping-approved-lockup.svg', 'image/svg+xml');
  if (!href) return `<text x="${x}" y="${y+48}" font-family="Arial,sans-serif" font-size="42" font-weight="900" fill="#f7fbff">Parlay<tspan fill="#20e8c1">Ping</tspan></text>`;
  return `<image href="${href}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMinYMid meet"/>`;
}

function approvedHeroWatermarkSvg(x, y, size = 360, opacity = 0.10) {
  const href = localAssetDataUri('parlayping-approved-hero.webp', 'image/webp');
  if (!href) return '';
  return `<image href="${href}" x="${x}" y="${y}" width="${size}" height="${size}" opacity="${opacity}" preserveAspectRatio="xMidYMid meet"/>`;
}

function canonicalMarkSvg(x, y, scale = 1) {
  const size = 70 * scale;
  const href = localAssetDataUri('parlayping-approved-hero.webp', 'image/webp');
  return href ? `<image href="${href}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>` : '';
}

function wordmarkSvg(x, y, fontSize = 34) {
  return approvedWordmarkSvg(x, y - fontSize, fontSize * 7.6, fontSize * 2.05);
}

function avatarSvg(leg, x, y, size, clipId) {
  const href = safeAssetUrl(leg.playerImageUrl);
  const r = size/2;
  if (href) {
    return `<defs><clipPath id="${clipId}"><circle cx="${x+r}" cy="${y+r}" r="${r}"/></clipPath></defs><circle cx="${x+r}" cy="${y+r}" r="${r}" fill="#102b3f" stroke="#255b73" stroke-width="2"/><image href="${esc(href)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`;
  }
  return `<circle cx="${x+r}" cy="${y+r}" r="${r}" fill="#0f3046" stroke="#2a6279" stroke-width="2"/><text x="${x+r}" y="${y+r+9}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${Math.round(size*.34)}" font-weight="900" fill="#e8f9ff">${esc(initials(leg.player))}</text>`;
}

function teamSvg(leg, x, y, size) {
  const href = safeAssetUrl(leg.teamLogoUrl);
  if (href) return `<image href="${esc(href)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
  const team = truncate(leg.team || leg.sport || '', 4).toUpperCase();
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="10" fill="#0c2639" stroke="#24546a" stroke-width="1.5"/><text x="${x+size/2}" y="${y+size/2+5}" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="900" fill="#9eeaf4">${esc(team)}</text>`;
}

function statusChip(display, rightX, y) {
  const accent = statusColor(display.status);
  const label = display.status === 'PENDING' ? 'PREGAME' : display.badgeText;
  const width = Math.max(72, 20 + label.length * 8);
  return `<rect x="${rightX-width}" y="${y}" width="${width}" height="24" rx="12" fill="${accent}" opacity=".13" stroke="${accent}" stroke-width="1.3"/><text x="${rightX-width/2}" y="${y+17}" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="900" letter-spacing=".5" fill="${accent}">${esc(label)}</text>`;
}

function legRowSvg(leg, x, y, w, h, index, compact = true) {
  const display = resolveLegDisplay(leg);
  const accent = statusColor(display.status);
  const avatar = compact ? 60 : Math.min(72, h - 24);
  const avatarX = x + 16;
  const avatarY = y + 15;
  const teamSize = compact ? 34 : 40;
  const teamX = avatarX + avatar + 10;
  const teamY = y + 26;
  const textX = teamX + teamSize + 12;
  const rightX = x + w - 16;
  const nameSize = compact ? 27 : 29;
  const marketSize = compact ? 18 : 20;
  const oddsSize = compact ? 28 : 31;
  const probSize = compact ? 18 : 19;
  const probabilityLine = display.displayProbabilityCompact || (display.status === 'LIVE' ? '—' : null);
  const settled = ['HIT','MISS','PUSH','VOID','UNRESOLVED'].includes(display.status);
  const lower = settled ? display.badgeText : (display.displayProgressText || display.badgeText);
  const playerMax = compact ? 18 : 32;
  const marketMax = compact ? 25 : 42;
  const oddsY = y + 42;

  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="#082034" stroke="#1a4b62" stroke-width="1.8"/>
    <rect x="${x}" y="${y}" width="6" height="${h}" rx="3" fill="${accent}"/>
    ${avatarSvg(leg,avatarX,avatarY,avatar,`avatar-${index}`)}
    ${teamSvg(leg,teamX,teamY,teamSize)}
    <text x="${textX}" y="${y+36}" font-family="Arial,sans-serif" font-size="${nameSize}" font-weight="900" fill="#ffffff">${esc(truncate(leg.player || 'Leg',playerMax))}</text>
    <text x="${textX}" y="${y+63}" font-family="Arial,sans-serif" font-size="${marketSize}" font-weight="700" fill="#b7cfdd">${esc(truncate(displayMarket(leg),marketMax))}</text>
    <text x="${rightX}" y="${oddsY}" text-anchor="end" font-family="Arial,sans-serif" font-size="${oddsSize}" font-weight="900" fill="#ffffff">${esc(display.displayOddsText)}</text>
    ${probabilityLine ? `<text x="${rightX}" y="${y+66}" text-anchor="end" font-family="Arial,sans-serif" font-size="${probSize}" font-weight="900" fill="${display.probabilityKind==='live'?'#24efd5':'#a7c9dc'}">${esc(probabilityLine)}</text>` : ''}
    <text x="${textX}" y="${y+h-14}" font-family="Arial,sans-serif" font-size="15" font-weight="900" fill="${accent}">${esc(truncate(lower || '',40))}</text>
    ${statusChip(display,rightX,y+h-33)}
  </g>`;
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
  const top = state === 'pregame' ? 166 : 190;
  const footerY = legs.length > 6 ? 598 : 590;
  const rowGap = 12;
  let rows = '';

  if (oneColumn) {
    const rowH = legs.length === 1 ? 154 : legs.length === 2 ? 132 : 112;
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
    hiddenStrip = `<rect x="55" y="${stripY}" width="1090" height="47" rx="15" fill="#081c2b" stroke="#17455c"/><text x="86" y="${stripY+31}" font-family="Arial,sans-serif" font-size="22" font-weight="900" fill="#20e8c1">•••</text><text x="145" y="${stripY+31}" font-family="Arial,sans-serif" font-size="20" font-weight="900" fill="#f7fbff">+${hidden} more ${hidden===1?'leg':'legs'}</text><text x="1120" y="${stripY+31}" text-anchor="end" font-family="Arial,sans-serif" font-size="13" font-weight="800" letter-spacing="1.3" fill="#7895aa">ADDITIONAL PICKS NOT SHOWN</text>`;
  }

  const summaryBar = state === 'pregame' ? '' : `<rect x="55" y="142" width="1090" height="34" rx="12" fill="#0a2639"/><circle cx="76" cy="159" r="5" fill="${state==='final'?'#49f59f':'#20e8c1'}"/><text x="91" y="165" font-family="Arial,sans-serif" font-size="17" font-weight="900" fill="#d2e7f1">${esc(summary)}</text>`;
  const title = `${legs.length}-LEG PARLAY`;
  const pageUrl = input.pageUrl || 'https://parlayping.net';

  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#02111d"/><stop offset=".54" stop-color="#061c2c"/><stop offset="1" stop-color="#08263f"/></linearGradient><linearGradient id="cta" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#12dce3"/><stop offset="1" stop-color="#2af09b"/></linearGradient><filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect width="1200" height="675" rx="32" fill="url(#bg)"/>${approvedHeroWatermarkSvg(825,-95,430,.08)}<path d="M820 -30 C970 70 1040 190 1190 240" fill="none" stroke="#0d5361" stroke-width="95" opacity=".12"/><rect x="30" y="24" width="1140" height="627" rx="28" fill="none" stroke="#16dfe0" stroke-width="2" opacity=".7"/>${approvedWordmarkSvg(55,34,315,72)}<text x="600" y="82" text-anchor="middle" font-family="Arial,sans-serif" font-size="38" font-weight="900" fill="#ffffff">${esc(title)}</text>${combinedOdds ? `<text x="1135" y="82" text-anchor="end" font-family="Arial,sans-serif" font-size="45" font-weight="900" fill="#20e8c1">${esc(combinedOdds)}</text>` : `<text x="1135" y="80" text-anchor="end" font-family="Arial,sans-serif" font-size="15" font-weight="900" letter-spacing="1.2" fill="#87a7ba">PARLAYPING SHARE CARD</text>`}${summaryBar}${rows}${hiddenStrip}<rect x="55" y="${footerY}" width="1090" height="50" rx="16" fill="url(#cta)" filter="url(#glow)"/><text x="600" y="${footerY+32}" text-anchor="middle" font-family="Arial,sans-serif" font-size="21" font-weight="900" letter-spacing=".5" fill="#041522">OPEN THIS BETSLIP ON PARLAYPING.NET</text><text x="1122" y="${footerY+32}" text-anchor="end" font-family="Arial,sans-serif" font-size="24" font-weight="900" fill="#041522">›</text><text x="55" y="658" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="#66859a">${esc(truncate(pageUrl,90))}</text><text x="1145" y="658" text-anchor="end" font-family="Arial,sans-serif" font-size="12" font-weight="800" fill="#66859a">ParlayPing • Live status when available</text></svg>`;
}

module.exports = { WIDTH, HEIGHT, pct, formatOdds, resolveLegDisplay, resolveSlipState, statusCounts, summaryText, selectVisibleLegs, renderShareSvg, safeAssetUrl, canonicalMarkSvg, wordmarkSvg, approvedWordmarkSvg, approvedHeroWatermarkSvg };
