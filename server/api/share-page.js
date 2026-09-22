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

function logoMarkup() {
  return `<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 64 64"><defs><linearGradient id="ppg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4af5a2"/><stop offset="1" stop-color="#19dcff"/></linearGradient></defs><path d="M10 6H42C53 6 61 14 61 25c0 10-6 18-15 21H34v11H10Z" fill="#071725" stroke="url(#ppg)" stroke-width="3.2"/><path d="M16 15h21l-3 33-4-3-4 4-4-4-4 4-4-4Z" fill="#f7fbff"/><g fill="#20dfa7"><circle cx="21.5" cy="23" r="4"/><circle cx="21.5" cy="32" r="4"/><circle cx="21.5" cy="41" r="4"/></g><g fill="none" stroke="#071725" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m19.4 23.1 1.5 1.6 3.2-3.5"/><path d="m19.4 32.1 1.5 1.6 3.2-3.5"/><path d="m19.4 41.1 1.5 1.6 3.2-3.5"/></g><g stroke="#91a8b8" stroke-width="2.4" stroke-linecap="round"><path d="M29 22h6M29 31h5M29 40h4"/></g><circle cx="43" cy="28" r="5.4" fill="url(#ppg)"/><path d="M47 19c6 2 8 5 8 9 0 5-3 8-8 10M49 13c9 3 13 8 13 15 0 8-4 13-13 16" fill="none" stroke="url(#ppg)" stroke-width="3.2" stroke-linecap="round"/></svg></span><span class="brand-text">Parlay<span>Ping</span></span>`;
}

function renderLeg(leg) {
  const display = resolveLegDisplay(leg);
  const market = leg.displayMarket || [leg.side, leg.line, leg.market].filter(v=>v!==null&&v!==undefined&&v!=='').join(' ');
  const probability = display.displayProbabilityText || display.displayProbabilityCompact;
  const lower = display.displayProgressText || display.badgeText;
  const initials = String(leg.player||'?').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();
  return `<article class="leg ${esc(String(display.status||'').toLowerCase())}"><div class="leg-main"><div class="avatar">${esc(initials)}</div><div><h3>${esc(leg.player || 'Leg')}</h3><p>${esc(market || 'Prop')}</p><small>${esc(lower || '')}</small></div></div><div class="leg-price"><strong>${esc(display.displayOddsText || '—')}</strong>${probability?`<span>${esc(probability)}</span>`:''}</div></article>`;
}

function pageHtml({ slip, shareUrl, cardUrl, baseUrl, liveDataAvailable }) {
  const legs = Array.isArray(slip.legs) ? slip.legs : [];
  const state = resolveSlipState(legs);
  const summary = summaryText(legs);
  const combinedOdds = slip.combinedOddsVerified ? formatOdds(slip.combinedOddsAmerican) : null;
  const title = `${legs.length}-Leg Parlay — ParlayPing`;
  const description = state === 'pregame' ? `Open this ${legs.length}-leg ParlayPing betslip.` : `${summary}. Open the live ParlayPing betslip.`;
  const refresh = state === 'mixed_live' ? `<script>setTimeout(()=>location.reload(),30000)</script>` : '';
  const xIntent = `https://x.com/intent/post?text=${encodeURIComponent('Check this ParlayPing betslip')}&url=${encodeURIComponent(shareUrl)}`;
  const returnUrl = slip.returnUrl || null;
  const returnLabel = slip.returnLabel || 'The Sports Outpost';
  const homeUrl = `${String(baseUrl || 'https://parlayping.net').replace(/\/$/, '')}/`;
  const backControl = returnUrl
    ? `<a class="return-btn" href="${esc(returnUrl)}" aria-label="Back to ${esc(returnLabel)}"><span aria-hidden="true">←</span><span class="return-copy">Back to ${esc(returnLabel)}</span></a>`
    : `<a class="return-btn history-fallback" href="${esc(homeUrl)}" aria-label="Back"><span aria-hidden="true">←</span><span class="return-copy">Back</span></a>`;
  const closeControl = returnUrl
    ? `<a class="close-btn" href="${esc(returnUrl)}" aria-label="Close ParlayPing and return to ${esc(returnLabel)}">×</a>`
    : `<a class="close-btn history-fallback" href="${esc(homeUrl)}" aria-label="Close ParlayPing">×</a>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(title)}</title><meta name="description" content="${esc(description)}"/><meta property="og:type" content="website"/><meta property="og:site_name" content="ParlayPing"/><meta property="og:title" content="${esc(title)}"/><meta property="og:description" content="${esc(description)}"/><meta property="og:url" content="${esc(shareUrl)}"/><meta property="og:image" content="${esc(cardUrl)}"/><meta property="og:image:width" content="1200"/><meta property="og:image:height" content="675"/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="${esc(title)}"/><meta name="twitter:description" content="${esc(description)}"/><meta name="twitter:image" content="${esc(cardUrl)}"/><meta name="theme-color" content="#071725"/><style>
:root{color-scheme:dark;--bg:#03121f;--panel:#081f31;--line:#17455c;--text:#f7fbff;--muted:#92aec2;--aqua:#20e8c1;--green:#49f59f;--red:#ff667d;--amber:#f2c86b}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 0,#0a3445 0,transparent 35%),linear-gradient(145deg,#020d16,#061a2a 60%,#08233a);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh}.shell{max-width:1180px;margin:0 auto;padding:18px 20px 64px}.top{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:20px;margin-bottom:20px}.brand{display:inline-flex;align-items:center;justify-self:center;gap:10px;text-decoration:none;color:inherit}.brand-mark{width:52px;height:52px;display:inline-flex}.brand-mark svg{width:100%;height:100%}.brand-text{font-size:29px;font-weight:900;letter-spacing:-1px}.brand-text span{color:var(--aqua)}.return-btn{justify-self:start;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 14px;border:1px solid #1a536b;border-radius:999px;background:#071d2e;color:#dff7ff;text-decoration:none;font-weight:850;font-size:13px}.return-btn:hover,.close-btn:hover{border-color:var(--aqua);box-shadow:0 0 18px rgba(32,232,193,.16)}.close-btn{justify-self:end;width:44px;height:44px;border:1px solid #1a536b;border-radius:50%;display:grid;place-items:center;background:#071d2e;color:#e9faff;text-decoration:none;font-size:29px;line-height:1}.tag{display:inline-flex;margin:0 auto 10px;border:1px solid #1b5268;border-radius:999px;padding:9px 13px;color:#b6d2e1;font-size:13px;font-weight:800}.hero{text-align:center;margin:12px auto 24px}.hero h1{font-size:clamp(34px,5vw,58px);line-height:1;margin:0 0 12px;letter-spacing:-2px}.hero h1 span{color:var(--aqua)}.hero p{margin:0;color:var(--muted);font-size:17px}.summary{display:inline-flex;align-items:center;gap:9px;margin-top:15px;background:#0a2639;border:1px solid #17455c;border-radius:999px;padding:9px 14px;font-weight:800;color:#c4d9e5}.summary i{width:8px;height:8px;background:var(--aqua);border-radius:50%;box-shadow:0 0 16px var(--aqua)}.card-wrap{border:1px solid #15536a;border-radius:24px;padding:10px;background:#041522;box-shadow:0 0 32px rgba(25,220,255,.12);overflow:hidden}.card-wrap img{display:block;width:100%;height:auto;border-radius:16px}.actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}.action{appearance:none;border:1px solid #1a536b;background:#081f31;color:var(--text);border-radius:14px;padding:14px 16px;font-weight:850;font-size:15px;text-decoration:none;text-align:center;cursor:pointer}.action.primary{background:linear-gradient(90deg,#17d7df,#2af09b);color:#03131f;border-color:transparent}.url{background:#061a29;border:1px solid #164459;border-radius:14px;padding:12px 14px;color:#9fc0d2;font-size:13px;overflow:hidden}.url code{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.section-title{margin:34px 0 14px;font-size:20px}.legs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.leg{display:flex;align-items:center;justify-content:space-between;gap:14px;background:#081f31;border:1px solid #17455c;border-left:4px solid #8fa9bf;border-radius:16px;padding:14px}.leg.live{border-left-color:var(--aqua)}.leg.hit{border-left-color:var(--green)}.leg.miss{border-left-color:var(--red)}.leg.push,.leg.void,.leg.unresolved{border-left-color:var(--amber)}.leg-main{display:flex;align-items:center;gap:12px;min-width:0}.avatar{width:44px;height:44px;flex:0 0 44px;border-radius:50%;display:grid;place-items:center;background:#102b3f;border:1px solid #245d73;color:#cbe7f4;font-weight:900}.leg h3{font-size:16px;margin:0 0 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.leg p{font-size:13px;color:#9eb9cc;margin:0 0 5px}.leg small{font-size:11px;color:var(--aqua);font-weight:850}.leg-price{text-align:right;min-width:80px}.leg-price strong{display:block;font-size:19px}.leg-price span{display:block;color:var(--aqua);font-size:13px;font-weight:850;margin-top:4px}.fine{margin-top:30px;color:#6f8ba0;font-size:12px;line-height:1.5}.notice{margin-top:12px;color:#789bb0;font-size:12px}@media(max-width:760px){.shell{padding-inline:12px}.top{grid-template-columns:48px 1fr 48px;gap:8px}.return-btn{width:44px;height:44px;min-height:44px;padding:0;justify-content:center;border-radius:50%}.return-copy{display:none}.brand-mark{width:44px;height:44px}.brand-text{font-size:23px}.close-btn{width:42px;height:42px}.actions{grid-template-columns:1fr}.legs{grid-template-columns:1fr}.hero h1{font-size:38px}.card-wrap{padding:5px;border-radius:17px}}
</style></head><body><main class="shell"><header class="top">${backControl}<a class="brand" href="${esc(baseUrl)}/">${logoMarkup()}</a>${closeControl}</header><div class="tag">${esc(state==='final'?'FINAL':state==='pregame'?'PREGAME':'LIVE / MIXED')}</div><section class="hero"><h1>Your Shared <span>Betslip</span></h1><p>Compare • Tail • Win Together.</p>${state==='pregame'?'':`<div class="summary"><i></i>${esc(summary)}</div>`}</section><div class="card-wrap"><img src="${esc(cardUrl)}" alt="ParlayPing ${esc(String(legs.length))}-leg share card"/></div><div class="actions"><button class="action primary" id="shareBtn">Share</button><a class="action" href="${esc(xIntent)}" target="_blank" rel="noreferrer">Share on X</a><button class="action" id="copyBtn">Copy Link</button></div><div class="url"><code>${esc(shareUrl)}</code></div><h2 class="section-title">All ${esc(String(legs.length))} legs${combinedOdds?` • ${esc(combinedOdds)}`:''}</h2><section class="legs">${legs.map(renderLeg).join('')}</section>${!liveDataAvailable?`<p class="notice">Live data could not be refreshed for this request, so the page is showing the safest available saved status instead of inventing progress.</p>`:''}<p class="fine">Probabilities are model estimates, not guarantees. Live percentages are shown only when ParlayPing has a current conditional model for that leg; otherwise a pregame percentage is explicitly labeled as pregame. Sports betting involves risk. 21+ where applicable. Bet responsibly.</p></main><script>const url=${JSON.stringify(shareUrl)};const copy=document.getElementById('copyBtn');copy.addEventListener('click',async(e)=>{try{await navigator.clipboard.writeText(url);e.currentTarget.textContent='Copied';setTimeout(()=>e.currentTarget.textContent='Copy Link',1400)}catch{prompt('Copy this link',url)}});document.getElementById('shareBtn').addEventListener('click',async(e)=>{if(navigator.share){try{await navigator.share({title:${JSON.stringify(title)},text:'Open this ParlayPing betslip',url});return}catch(err){if(err&&err.name==='AbortError')return}}try{await navigator.clipboard.writeText(url);e.currentTarget.textContent='Link Copied';setTimeout(()=>e.currentTarget.textContent='Share',1400)}catch{location.href=${JSON.stringify(xIntent)}}});document.querySelectorAll('.history-fallback').forEach(control=>control.addEventListener('click',event=>{if(window.history.length>1){event.preventDefault();window.history.back();}}));</script>${refresh}</body></html>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).send('Use GET.');
  const token = tokenFromRequest(req);
  if (!token) return res.status(400).send('Missing share token.');
  try {
    const baseUrl = requestBaseUrl(req);
    const slip = decodeShareSlip(token);
    const hydrated = await hydrateSharedSlip(slip, { baseUrl });
    const shareUrl = buildShareUrl(token, baseUrl);
    const cardUrl = buildCardUrl(token, baseUrl);
    const html = pageHtml({ slip:hydrated.slip, shareUrl, cardUrl, baseUrl, liveDataAvailable:hydrated.liveDataAvailable });
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','public, max-age=20, s-maxage=20, stale-while-revalidate=40');
    return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(html);
  } catch (error) {
    console.error('ParlayPing share-page error', error);
    const code = /secret|configured/i.test(error?.message || '') ? 503 : 400;
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    return res.status(code).send(error?.message || 'Unable to open this ParlayPing slip.');
  }
};

module.exports.tokenFromRequest = tokenFromRequest;
module.exports.pageHtml = pageHtml;