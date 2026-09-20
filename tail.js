const params = new URLSearchParams(location.search);
const slipToken = params.get('slip');
const app = document.getElementById('tailApp');
const errorBox = document.getElementById('errorBox');
const statusList = document.getElementById('statusList');
const tailLegs = document.getElementById('tailLegs');
const combinedEl = document.getElementById('tailCombined');
const summaryEl = document.getElementById('tailSummary');
const stampEl = document.getElementById('refreshStamp');
const presetButtons = [...document.querySelectorAll('#tailPresets button')];

let originalLegs = [];
let analysis = null;
let selections = new Map();
let currentMode = 'balanced';

function decodeBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return decodeURIComponent(Array.prototype.map.call(atob(padded), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
}

function readSlip() {
  if (!slipToken) throw new Error('This Tail link is missing its slip data.');
  const decoded = JSON.parse(decodeBase64Url(slipToken));
  if (!decoded || !Array.isArray(decoded.legs) || !decoded.legs.length) throw new Error('This Tail link is invalid.');
  return decoded.legs;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function iconFor(status) {
  return status === 'HIT' ? '✓' : status === 'MISS' ? '×' : status === 'LIVE' ? '●' : status === 'PENDING' ? '◷' : '?';
}

function classFor(status) {
  return String(status || '').toLowerCase();
}

function marketTitle(result) {
  return `${result.player} · ${result.displayMarket}`;
}

function statusDetail(result) {
  if (result.status === 'HIT') return `${result.matchup || ''} · HIT`;
  if (result.status === 'MISS') return `${result.matchup || ''} · MISSED`;
  if (result.status === 'LIVE') return `${result.matchup || ''} · ${result.current}/${result.target} · LIVE`;
  if (result.status === 'PENDING') return `${result.matchup || ''} · HAS NOT STARTED`;
  return 'Could not match this leg to a supported live data source';
}

function renderStatus() {
  statusList.innerHTML = analysis.results.map(result => {
    const prob = ['LIVE','PENDING'].includes(result.status) && Number.isFinite(result.probabilityPct) ? `${Math.round(result.probabilityPct)}%` : '';
    return `<div class="tail-status-row ${classFor(result.status)}">
      <span class="tail-status-icon">${iconFor(result.status)}</span>
      <div><strong>${esc(marketTitle(result))}</strong><small>${esc(statusDetail(result))}</small></div>
      <b>${esc(prob)}</b>
    </div>`;
  }).join('');
}

function nearestOriginalIndex(result) {
  const opts = result.marketOptions || [];
  if (!opts.length) return 0;
  let best = 0, delta = Infinity;
  opts.forEach((opt, idx) => {
    const d = Math.abs(Number(opt.line) - Number(result.line));
    if (d < delta) { delta = d; best = idx; }
  });
  return best;
}

function pickIndex(result, mode) {
  const opts = result.marketOptions || [];
  if (!opts.length) return 0;
  if (mode === 'balanced') return nearestOriginalIndex(result);
  const indexed = opts.map((opt, idx) => ({ idx, p: Number(opt.probability) })).filter(x => Number.isFinite(x.p));
  if (!indexed.length) return nearestOriginalIndex(result);
  indexed.sort((a,b) => a.p - b.p);
  return mode === 'safe' ? indexed[indexed.length - 1].idx : indexed[0].idx;
}

function selectedOption(result) {
  const opts = result.marketOptions || [];
  if (!opts.length) return null;
  const idx = Math.max(0, Math.min(opts.length - 1, Number(selections.get(result.id) ?? nearestOriginalIndex(result))));
  return opts[idx];
}

function optionLabel(result, opt) {
  if (result.market === 'atd') return 'Anytime TD';
  if (result.market === 'anytimeGoal') return 'Anytime Goal';
  const prefix = result.side === 'under' ? 'Under ' : '';
  const suffix = result.side === 'under' ? '' : '+';
  return `${prefix}${opt.line}${suffix} ${String(result.displayMarket || '').replace(/^O?U?\d+(\.\d+)?\+?\s*/,'')}`.trim();
}

function renderBuilder() {
  const pending = analysis.results.filter(r => r.status === 'PENDING');
  if (!pending.length) {
    tailLegs.innerHTML = '<div class="tail-empty">There are no unstarted legs available to rebuild right now. The original slip may be fully underway or completed.</div>';
    combinedEl.textContent = '—';
    summaryEl.textContent = 'Nothing left to tail';
    return;
  }

  tailLegs.innerHTML = pending.map(result => {
    const opts = result.marketOptions || [];
    if (!opts.length) {
      return `<div class="tail-live-leg"><div class="tail-leg-top"><div class="tail-leg-name"><strong>${esc(result.player)}</strong><small>${esc(result.displayMarket)}</small></div></div><div class="tail-no-options">No currently available sportsbook alternatives were found for this leg. ParlayPing will not invent a line.</div></div>`;
    }
    const idx = Math.max(0, Math.min(opts.length - 1, Number(selections.get(result.id) ?? nearestOriginalIndex(result))));
    const opt = opts[idx];
    const prob = Number.isFinite(opt.probability) ? `${Math.round(opt.probability * 100)}% model` : 'Model unavailable';
    const price = opt.price == null ? 'Price unavailable' : `${opt.price > 0 ? '+' : ''}${opt.price} · ${opt.book || 'book'}`;
    return `<div class="tail-live-leg" data-leg-id="${esc(result.id)}">
      <div class="tail-leg-top">
        <div class="tail-leg-name"><strong>${esc(result.player)}</strong><small>${esc(result.matchup || '')}</small></div>
        <div class="tail-leg-value"><strong data-role="line">${esc(optionLabel(result,opt))}</strong><small data-role="prob">${esc(prob)}</small></div>
      </div>
      <input class="tail-slider" type="range" min="0" max="${opts.length - 1}" value="${idx}" step="1" aria-label="Risk for ${esc(result.player)}" />
      <div class="tail-option-meta"><span>SAFER</span><span class="book-price" data-role="book">${esc(price)}</span><span>MORE PAYOUT</span></div>
    </div>`;
  }).join('');

  document.querySelectorAll('.tail-live-leg[data-leg-id]').forEach(node => {
    const id = node.dataset.legId;
    const result = pending.find(r => r.id === id);
    const slider = node.querySelector('.tail-slider');
    if (!result || !slider) return;
    slider.addEventListener('input', () => {
      selections.set(id, Number(slider.value));
      currentMode = 'custom';
      presetButtons.forEach(b => b.classList.remove('active'));
      const opt = selectedOption(result);
      node.querySelector('[data-role="line"]').textContent = optionLabel(result,opt);
      node.querySelector('[data-role="prob"]').textContent = Number.isFinite(opt?.probability) ? `${Math.round(opt.probability * 100)}% model` : 'Model unavailable';
      node.querySelector('[data-role="book"]').textContent = opt?.price == null ? 'Price unavailable' : `${opt.price > 0 ? '+' : ''}${opt.price} · ${opt.book || 'book'}`;
      updateCombined();
    });
  });
  updateCombined();
}

function updateCombined() {
  const pending = analysis.results.filter(r => r.status === 'PENDING');
  const chosen = pending.map(r => ({ result:r, opt:selectedOption(r) })).filter(x => x.opt);
  const probs = chosen.map(x => Number(x.opt.probability));
  const valid = chosen.length && probs.every(Number.isFinite);
  const combined = valid ? probs.reduce((a,b) => a*b, 1) : null;
  combinedEl.textContent = combined == null ? '—' : `${Math.round(combined * 100)}%`;
  summaryEl.textContent = chosen.length ? chosen.map(({result,opt}) => `${result.player} ${optionLabel(result,opt)}`).join(' · ') : 'No currently listed markets';
}

function setMode(mode) {
  currentMode = mode;
  presetButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
  for (const result of analysis.results.filter(r => r.status === 'PENDING')) selections.set(result.id, pickIndex(result, mode));
  renderBuilder();
}

async function refresh({preserveSelections=true} = {}) {
  try {
    stampEl.textContent = 'Refreshing current game and market data…';
    const response = await fetch('/api/analyze', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ legs: originalLegs }) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to analyze this slip.');
    analysis = data;
    if (!preserveSelections) selections.clear();
    for (const result of analysis.results.filter(r => r.status === 'PENDING')) {
      if (!selections.has(result.id)) selections.set(result.id, pickIndex(result, currentMode === 'custom' ? 'balanced' : currentMode));
    }
    renderStatus();
    renderBuilder();
    errorBox.hidden = true;
    app.hidden = false;
    stampEl.textContent = `Live model refreshed ${new Date(data.generatedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit'})}`;
  } catch (error) {
    errorBox.textContent = error.message || 'Unable to load this Tail link.';
    errorBox.hidden = false;
    stampEl.textContent = 'Unable to refresh live data';
  }
}

presetButtons.forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));

try {
  originalLegs = readSlip();
  refresh({preserveSelections:false});
  setInterval(() => refresh({preserveSelections:true}), 30_000);
} catch (error) {
  errorBox.textContent = error.message;
  errorBox.hidden = false;
  stampEl.textContent = 'Invalid Tail link';
}
