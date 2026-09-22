const { decodeShareSlip, buildShareUrl, buildCardUrl } = require('./lib/share-slip');
const { hydrateSharedSlip } = require('./lib/share-hydrate');
const { resolveLegDisplay, resolveSlipState, summaryText, formatOdds } = require('./lib/share-renderer');

function esc(value) {
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function tokenFromRequest(req) {
  return String(req.query?.slip || req.query?.token || '').trim();
}

function requestBaseUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'parlayping.net';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

function safeHttps(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function initials(name) {
  return String(name || '?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]?.toUpperCase()).join('') || '?';
}

function displayMarket(leg) {
  if (leg.displayMarket) return String(leg.displayMarket);
  const market = String(leg.market || '').trim();
  if (/atd|anytime.*touchdown/i.test(market)) return 'Anytime TD Scorer';
  const side = String(leg.side || '').trim();
  const line = leg.line;
  if (side && line !== null && line !== undefined && line !== '') {
    const label = side.charAt(0).toUpperCase() + side.slice(1);
    return `${label} ${line}${market ? ` ${market}` : ''}`;
  }
  return market || 'Prop';
}

function logoMarkup() {
  return `<img class="brand-logo" src="/parlayping-logo.svg" alt="ParlayPing"/>`;
}

function bestBookForSlip(slip) {
  const legs = Array.isArray(slip.legs) ? slip.legs : [];
  const books = new Map();
  legs.forEach((leg, index) => {
    const name = String(leg.sportsbook || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    const current = books.get(key) || { name, count:0, links:[] };
    current.count += 1;
    const link = safeHttps(leg.sportsbookLink);
    if (link) current.links.push({ index, link });
    books.set(key, current);
  });
  const ranked = [...books.values()].sort((a,b) => b.count - a.count || a.name.localeCompare(b.name));
  const best = ranked[0] || null;
  if (!best) return { name:'Sportsbook', count:0, total:legs.length, link:null, complete:false };
  return {
    ...best,
    total: legs.length,
    complete: best.count === legs.length,
    link: best.links[0]?.link || null,
  };
}

function groupLegs(legs) {
  const groups = new Map();
  legs.forEach((leg, index) => {
    const key = String(leg.gameId || leg.matchup || `${leg.sport || 'SPORT'}-${index}`);
    if (!groups.has(key)) groups.set(key, { key, legs:[], matchup:leg.matchup || null, sport:leg.sport || 'SPORT' });
    const group = groups.get(key);
    group.legs.push(leg);
    if (!group.matchup && leg.matchup) group.matchup = leg.matchup;
  });
  return [...groups.values()];
}

function renderPlayer(leg) {
  const image = safeHttps(leg.playerImageUrl);
  const avatar = image
    ? `<img class="player-photo" src="${esc(image)}" alt="" loading="lazy"/>`
    : `<span class="player-fallback">${esc(initials(leg.player))}</span>`;
  const teamLogo = safeHttps(leg.teamLogoUrl);
  return `<span class="player-avatar">${avatar}</span>${teamLogo ? `<img class="team-mini" src="${esc(teamLogo)}" alt="" loading="lazy"/>` : ''}`;
}

function renderLeg(leg) {
  const display = resolveLegDisplay(leg);
  const probability = display.displayProbabilityCompact;
  const status = String(display.status || 'PENDING').toLowerCase();
  const secondary = display.status === 'LIVE'
    ? (display.displayProgressText || display.badgeText)
    : ['HIT','MISS','PUSH','VOID','UNRESOLVED'].includes(display.status)
      ? display.badgeText
      : null;
  return `<div class="pick-row ${esc(status)}">
    <div class="pick-person">${renderPlayer(leg)}<div class="pick-copy"><strong>${esc(leg.player || 'Leg')} ${esc(displayMarket(leg))}</strong><span>${esc(leg.market || displayMarket(leg))}</span>${secondary ? `<small>${esc(secondary)}</small>` : ''}</div></div>
    <div class="pick-price"><strong>${esc(display.displayOddsText || '—')}</strong>${probability ? `<span>${esc(probability)}</span>` : (secondary ? `<span class="status-copy">${esc(display.badgeText || '')}</span>` : '')}<button class="kebab" type="button" aria-label="Bet options">⋮</button></div>
  </div>`;
}

function renderGameGroup(group, index) {
  const teams = [];
  for (const leg of group.legs) {
    const team = String(leg.team || '').trim();
    if (team && !teams.includes(team)) teams.push(team);
  }
  const matchup = group.matchup || (teams.length > 1 ? `${teams[0]} vs ${teams[1]}` : teams[0] || `${group.sport} matchup`);
  const logos = [];
  for (const leg of group.legs) {
    const url = safeHttps(leg.teamLogoUrl);
    if (url && !logos.includes(url)) logos.push(url);
  }
  const badgeA = logos[0] ? `<img src="${esc(logos[0])}" alt=""/>` : `<span>${esc((teams[0] || group.sport || '?').slice(0,3).toUpperCase())}</span>`;
  const badgeB = logos[1] ? `<img src="${esc(logos[1])}" alt=""/>` : `<span>${esc((teams[1] || 'VS').slice(0,3).toUpperCase())}</span>`;
  const accent = ['#ff416c','#8d48ff','#1de4d0','#ffc94a','#38a7ff'][index % 5];
  return `<section class="game-card" style="--game-accent:${accent}">
    <header class="game-head">
      <div class="matchup-logos"><span class="team-badge">${badgeA}</span><span class="versus">vs</span><span class="team-badge">${badgeB}</span></div>
      <div class="matchup-copy"><strong>${esc(matchup)}</strong><span>${esc(group.sport || '')}</span></div>
      <div class="game-count">${group.legs.length} bet${group.legs.length===1?'':'s'} <span>⌃</span></div>
    </header>
    <div class="game-picks">${group.legs.map(renderLeg).join('')}</div>
  </section>`;
}

function pageHtml({ slip, shareUrl, cardUrl, baseUrl, liveDataAvailable }) {
  const legs = Array.isArray(slip.legs) ? slip.legs : [];
  const groups = groupLegs(legs);
  const state = resolveSlipState(legs);
  const summary = summaryText(legs);
  const combinedOdds = slip.combinedOddsVerified ? formatOdds(slip.combinedOddsAmerican) : null;
  const title = `${legs.length}-Bet Parlay — ParlayPing`;
  const description = state === 'pregame' ? `Open this ${legs.length}-bet ParlayPing slip.` : `${summary}. Open the live ParlayPing slip.`;
  const xIntent = `https://x.com/intent/post?text=${encodeURIComponent('Check this ParlayPing betslip')}&url=${encodeURIComponent(shareUrl)}`;
  const smsIntent = `sms:?&body=${encodeURIComponent(`Check this ParlayPing betslip ${shareUrl}`)}`;
  const returnUrl = slip.returnUrl || null;
  const returnLabel = slip.returnLabel || 'The Sports Outpost';
  const canonicalHome = 'https://parlayping.net/';
  const homeUrl = `${String(baseUrl || canonicalHome).replace(/\/$/, '')}/`;
  const backControl = returnUrl
    ? `<a class="return-btn" href="${esc(returnUrl)}" aria-label="Back to ${esc(returnLabel)}">← <span>Back to ${esc(returnLabel)}</span></a>`
    : `<a class="return-btn history-fallback" href="${esc(homeUrl)}" aria-label="Back">← <span>Back</span></a>`;
  const closeControl = returnUrl
    ? `<a class="close-btn" href="${esc(returnUrl)}" aria-label="Close ParlayPing and return to ${esc(returnLabel)}">×</a>`
    : `<a class="close-btn history-fallback" href="${esc(homeUrl)}" aria-label="Close ParlayPing">×</a>`;
  const bestBook = bestBookForSlip(slip);
  const bookOdds = combinedOdds || '—';
  const bookInitials = bestBook.name === 'Sportsbook' ? 'SB' : bestBook.name.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();
  const ctaActive = Boolean(bestBook.complete && bestBook.link);
  const cta = ctaActive
    ? `<a class="book-cta" href="${esc(bestBook.link)}" target="_blank" rel="noopener noreferrer"><span class="bolt">ϟ</span><span><strong>PLACE ALL ${legs.length} BET${legs.length===1?'':'S'}</strong><small>Open in ${esc(bestBook.name)}</small></span><b>›</b></a>`
    : `<div class="book-cta disabled" aria-disabled="true"><span class="bolt">ϟ</span><span><strong>${bestBook.complete ? `PLACE ALL ${legs.length} BET${legs.length===1?'':'S'}` : 'BOOK LINK UNAVAILABLE'}</strong><small>${bestBook.complete ? `No verified ${esc(bestBook.name)} deep link was provided` : 'A single book does not cover every leg in this slip'}</small></span><b>›</b></div>`;
  const refresh = state === 'mixed_live' ? `<script>setTimeout(()=>location.reload(),30000)</script>` : '';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(title)}</title><meta name="description" content="${esc(description)}"/><meta property="og:type" content="website"/><meta property="og:site_name" content="ParlayPing"/><meta property="og:title" content="${esc(title)}"/><meta property="og:description" content="${esc(description)}"/><meta property="og:url" content="${esc(shareUrl)}"/><meta property="og:image" content="${esc(cardUrl)}"/><meta property="og:image:width" content="1200"/><meta property="og:image:height" content="675"/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="${esc(title)}"/><meta name="twitter:description" content="${esc(description)}"/><meta name="twitter:image" content="${esc(cardUrl)}"/><meta name="theme-color" content="#041321"/><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet"/><style>
:root{color-scheme:dark;--bg:#03111e;--panel:#071a2b;--panel2:#0a2035;--line:#174761;--text:#f8fbff;--muted:#8eaac0;--cyan:#11dce9;--green:#29ef9e;--blue:#38a7ff}*{box-sizing:border-box}body{margin:0;background:#020e19;color:var(--text);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh}.app-header{height:102px;border-bottom:1px solid #153b54;background:linear-gradient(180deg,#031423,#03111e);display:flex;align-items:center}.header-inner{width:min(1180px,calc(100% - 44px));margin:0 auto;display:flex;align-items:center;gap:26px}.menu{width:36px;display:grid;gap:6px;background:none;border:0;padding:0}.menu i{display:block;height:3px;background:#d7e6f0;border-radius:8px}.brand-link{display:flex;align-items:center;text-decoration:none}.brand-logo{width:242px;max-width:42vw;height:auto;display:block}.header-spacer{flex:1}.round-tool{width:48px;height:48px;border:1px solid #17455c;border-radius:50%;display:grid;place-items:center;color:#e7f4fb;font-size:22px;text-decoration:none;background:#061827}.shell{width:min(1120px,calc(100% - 44px));margin:0 auto;padding:18px 0 72px}.handoff-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;min-height:42px}.return-btn{display:inline-flex;align-items:center;gap:8px;color:#a9c2d4;text-decoration:none;font-size:12px;font-weight:800;letter-spacing:.01em}.return-btn span{border-bottom:1px solid transparent}.return-btn:hover span{color:#e9faff;border-color:#3aa0c1}.close-btn{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;border:1px solid #17455c;color:#dff5ff;text-decoration:none;font-size:25px;background:#061827}.best-card{border:1px solid #17455c;border-radius:19px;padding:19px 19px 14px;background:linear-gradient(145deg,#061929,#071d30);box-shadow:0 18px 48px rgba(0,0,0,.18)}.best-top{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.best-top h1{font-family:"Space Grotesk",Inter,sans-serif;font-size:30px;letter-spacing:-1.1px;margin:0 0 4px}.best-top p{margin:0;color:var(--muted);font-size:14px}.legs-cap{white-space:nowrap;border:1px solid #00aa74;background:#063d36;color:#40f0ba;border-radius:999px;padding:11px 18px;font-weight:850;font-size:13px}.book-labels,.book-row{display:grid;grid-template-columns:minmax(0,1.3fr) .58fr .38fr;align-items:center;gap:18px}.book-labels{padding:20px 18px 8px;color:#88a6bd;font-size:11px;font-weight:800;letter-spacing:.24em}.book-row{border:1px solid #10d9e4;border-radius:14px;padding:13px 18px;background:#08223a}.book-name{display:flex;align-items:center;gap:13px;font-size:18px;font-weight:850}.book-mark{width:37px;height:37px;border-radius:50%;display:grid;place-items:center;background:#101f2b;border:1px solid #2b6178;color:#f6c634;font-weight:900;font-size:12px}.coverage{text-align:center;font-size:17px;font-weight:800;color:#b8ccda}.parlay-price{text-align:right;color:#18e9e2;font-size:23px;font-weight:900}.book-cta{margin-top:13px;min-height:91px;border-radius:14px;background:linear-gradient(90deg,#158e92,#249775);display:grid;grid-template-columns:54px 1fr 28px;align-items:center;padding:10px 27px;color:#031322;text-decoration:none}.book-cta .bolt{font-size:46px;font-weight:900;line-height:1}.book-cta>span:nth-child(2){text-align:center}.book-cta strong{display:block;font-family:"Space Grotesk",Inter,sans-serif;font-size:29px;letter-spacing:.01em}.book-cta small{display:block;font-size:16px}.book-cta b{font-size:46px}.book-cta.disabled{opacity:.62;filter:saturate(.65);cursor:not-allowed}.slip-heading{display:flex;align-items:center;gap:20px;margin:28px 2px 12px}.slip-heading h2{font-family:"Space Grotesk",Inter,sans-serif;font-size:31px;letter-spacing:-1px;margin:0}.slip-heading p{margin:4px 0 0;color:var(--muted);font-size:15px}.tune-btn{margin-left:auto;border:1px solid #1ea6d7;border-radius:12px;background:#071b2b;color:#eaf9ff;padding:15px 24px;font-weight:850;font-size:16px;display:inline-flex;align-items:center;gap:11px;cursor:pointer}.tune-btn i{color:#18e8db;font-style:normal;font-size:21px}.game-card{position:relative;border:1px solid #18465e;border-radius:18px;background:#071a2b;margin:11px 0;overflow:hidden}.game-card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--game-accent)}.game-head{min-height:70px;display:flex;align-items:center;padding:12px 18px;border-bottom:1px solid #17384d;gap:13px}.matchup-logos{display:flex;align-items:center;gap:8px}.team-badge{width:35px;height:35px;display:grid;place-items:center;border-radius:50%;background:#0b263a;border:1px solid #28566c;color:#a9c8d9;font-size:9px;font-weight:850}.team-badge img{max-width:27px;max-height:27px}.versus{font-size:12px;color:#8aa8bb}.matchup-copy strong{display:block;font-size:17px}.matchup-copy span{display:block;color:#6f91a9;font-size:11px;margin-top:3px}.game-count{margin-left:auto;border:1px solid #1b5470;border-radius:999px;padding:8px 12px;color:#bad2e0;font-size:12px}.pick-row{min-height:82px;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:12px 18px}.pick-row+.pick-row{border-top:1px solid #15364b}.pick-person{display:flex;align-items:center;gap:10px;min-width:0}.player-avatar{width:46px;height:46px;flex:0 0 46px;border-radius:50%;overflow:hidden;border:1px solid #1d5872;background:#0d2a3e;display:grid;place-items:center}.player-photo{width:100%;height:100%;object-fit:cover}.player-fallback{font-weight:900;color:#cfe9f4}.team-mini{width:25px;height:25px;object-fit:contain;margin-left:-15px;margin-right:4px;align-self:flex-end;background:#071827;border-radius:50%;padding:2px}.pick-copy{min-width:0}.pick-copy strong{display:block;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pick-copy span{display:block;color:#9db5c6;font-size:12px;margin-top:3px}.pick-copy small{display:block;color:#18dacb;font-size:10px;font-weight:800;margin-top:3px}.pick-price{display:grid;grid-template-columns:auto 22px;grid-template-rows:auto auto;align-items:center;column-gap:10px;text-align:right;flex:0 0 auto}.pick-price strong{font-size:20px;grid-column:1}.pick-price span{font-size:13px;color:#c7d9e4;grid-column:1;font-weight:750}.pick-price .status-copy{color:#f0c873}.kebab{grid-column:2;grid-row:1/3;background:transparent;border:0;color:#8bb2c8;font-size:23px;padding:0}.share-wrap{margin-top:62px}.share-title{display:flex;align-items:center;gap:17px;color:#b6c9d7;font-size:12px;font-weight:750;letter-spacing:.28em;white-space:nowrap}.share-title:before,.share-title:after{content:"";height:1px;background:#21445a;flex:1}.share-actions{display:flex;justify-content:center;gap:38px;margin-top:25px;flex-wrap:wrap}.share-action{width:72px;text-align:center;color:#edf8fd;text-decoration:none;background:none;border:0;font:inherit;cursor:pointer}.share-icon{width:54px;height:54px;margin:0 auto 9px;border-radius:50%;border:1px solid #215472;background:#082039;display:grid;place-items:center;font-size:24px;color:#dceef7}.share-action span:last-child{font-size:11px}.notice,.fine{color:#6f8fa5;font-size:11px;line-height:1.55}.notice{margin:18px 4px 0}.fine{margin:28px auto 0;max-width:870px;text-align:center}.toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(16px);opacity:0;pointer-events:none;background:#0b2a3d;border:1px solid #1a6077;color:#eaffff;border-radius:999px;padding:11px 18px;font-size:12px;font-weight:750;transition:.2s}.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
@media(max-width:760px){.app-header{height:78px}.header-inner,.shell{width:min(100% - 24px,1120px)}.brand-logo{width:190px}.round-tool{width:40px;height:40px}.header-inner{gap:14px}.menu{width:30px}.best-card{padding:16px 12px 12px}.best-top h1{font-size:24px}.legs-cap{padding:8px 11px;font-size:11px}.book-labels{display:none}.book-row{grid-template-columns:1fr auto;padding:12px}.coverage{display:none}.parlay-price{font-size:20px}.book-cta{min-height:78px;grid-template-columns:34px 1fr 18px;padding:9px 15px}.book-cta .bolt{font-size:32px}.book-cta strong{font-size:20px}.book-cta small{font-size:12px}.book-cta b{font-size:31px}.slip-heading{align-items:flex-end}.slip-heading h2{font-size:25px}.tune-btn{padding:11px 13px;font-size:13px}.game-head{padding:10px 12px}.matchup-copy strong{font-size:14px}.pick-row{padding:11px 12px}.pick-copy strong{font-size:14px}.pick-price strong{font-size:18px}.share-actions{gap:17px}.share-action{width:58px}.share-icon{width:48px;height:48px}.return-btn span{display:none}}
</style></head><body>
<header class="app-header"><div class="header-inner"><button class="menu" type="button" aria-label="Menu"><i></i><i></i><i></i></button><a class="brand-link" href="${esc(homeUrl)}">${logoMarkup()}</a><div class="header-spacer"></div><span class="round-tool" aria-hidden="true">♢</span><a class="round-tool" href="${esc(homeUrl)}account.html" aria-label="Account">♙</a></div></header>
<main class="shell"><div class="handoff-bar">${backControl}${closeControl}</div>
<section class="best-card"><div class="best-top"><div><h1>Best Book for This Parlay</h1><p>Compare your full slip across top books</p></div><div class="legs-cap">ϟ&nbsp; Supports up to 25 legs</div></div><div class="book-labels"><span>SPORTSBOOK</span><span style="text-align:center">AVAILABLE BETS</span><span style="text-align:right">PARLAY ODDS</span></div><div class="book-row"><div class="book-name"><span class="book-mark">${esc(bookInitials)}</span><span>${esc(bestBook.name)}</span></div><div class="coverage">${bestBook.count}/${legs.length} bets</div><div class="parlay-price">${esc(bookOdds)}</div></div>${cta}</section>
<section class="slip-heading"><div><h2>Your ${legs.length}-Bet Parlay</h2><p>Grouped by game for a cleaner view</p></div><button class="tune-btn" id="tuneBtn" type="button"><i>☷</i> Parlay Tune</button></section>
<div class="game-list">${groups.map(renderGameGroup).join('')}</div>
${state!=='pregame' ? `<p class="notice">${esc(summary)}</p>` : ''}${!liveDataAvailable ? `<p class="notice">Live data could not be refreshed for this request, so ParlayPing is showing the safest saved status rather than inventing progress.</p>` : ''}
<section class="share-wrap"><div class="share-title">SHARE YOUR BETSLIP</div><div class="share-actions"><button class="share-action" id="copyBtn" type="button"><span class="share-icon">↗</span><span>Copy Link</span></button><a class="share-action" href="${esc(xIntent)}" target="_blank" rel="noreferrer"><span class="share-icon">𝕏</span><span>X (Twitter)</span></a><button class="share-action" id="messageBtn" type="button"><span class="share-icon">•••</span><span>Messages</span></button><a class="share-action" href="${esc(smsIntent)}"><span class="share-icon">▰</span><span>SMS</span></a><button class="share-action" id="moreBtn" type="button"><span class="share-icon">•••</span><span>More</span></button></div></section>
<p class="fine">Probabilities are model estimates, not guarantees. Combined parlay odds appear only when they were explicitly verified or supplied; ParlayPing does not multiply correlated or same-game legs into a fabricated price. Sports betting involves risk. 21+ where applicable. Bet responsibly.</p></main><div class="toast" id="toast"></div><script>
const url=${JSON.stringify(shareUrl)};const title=${JSON.stringify(title)};const toast=document.getElementById('toast');function say(text){toast.textContent=text;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1500)}async function copyLink(){try{await navigator.clipboard.writeText(url);say('Link copied')}catch{prompt('Copy this link',url)}}async function nativeShare(){if(navigator.share){try{await navigator.share({title,text:'Check this ParlayPing betslip',url});return}catch(error){if(error&&error.name==='AbortError')return}}await copyLink()}document.getElementById('copyBtn')?.addEventListener('click',copyLink);document.getElementById('messageBtn')?.addEventListener('click',nativeShare);document.getElementById('moreBtn')?.addEventListener('click',nativeShare);document.getElementById('tuneBtn')?.addEventListener('click',()=>say('Parlay Tune uses only verified available alternate lines.'));document.querySelectorAll('.history-fallback').forEach(control=>control.addEventListener('click',event=>{if(window.history.length>1){event.preventDefault();window.history.back();}}));
</script>${refresh}</body></html>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).send('Use GET.');
  const token = tokenFromRequest(req);
  if (!token) return res.status(400).send('Missing share token.');
  try {
    const requestBase = requestBaseUrl(req);
    const slip = decodeShareSlip(token);
    const hydrated = await hydrateSharedSlip(slip, { baseUrl: requestBase });
    const publicBase = String(process.env.PUBLIC_BASE_URL || 'https://parlayping.net').replace(/\/$/, '');
    const shareUrl = buildShareUrl(token, publicBase);
    const cardUrl = buildCardUrl(token, publicBase);
    const html = pageHtml({ slip: hydrated.slip, shareUrl, cardUrl, baseUrl: publicBase, liveDataAvailable: hydrated.liveDataAvailable });
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','text/html; charset=utf-8');
    if (req.method === 'HEAD') return res.status(200).send('');
    return res.status(200).send(html);
  } catch (error) {
    console.error('ParlayPing share page error', error);
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    return res.status(400).send(error?.message || 'Invalid ParlayPing share link.');
  }
};

module.exports.pageHtml = pageHtml;
module.exports.tokenFromRequest = tokenFromRequest;
module.exports.requestBaseUrl = requestBaseUrl;
module.exports.bestBookForSlip = bestBookForSlip;
module.exports.groupLegs = groupLegs;
