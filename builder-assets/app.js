(() => {
  const bootstrapEl = document.getElementById('pp-builder-data');
  let bootstrap = null;
  try { bootstrap = JSON.parse(bootstrapEl?.textContent || 'null'); } catch { bootstrap = null; }

  const parlayPanel = document.querySelector('.parlay-panel');
  const tuneBtn = document.getElementById('tuneBtn');
  const saveBtn = document.getElementById('saveBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const addPickBtn = document.getElementById('addPickBtn');
  const picks = document.getElementById('picks');
  const legCount = document.getElementById('legCount');
  const combinedOdds = document.getElementById('combinedOdds');
  const impliedProbability = document.getElementById('impliedProbability');
  const toast = document.getElementById('toast');
  const selectedBookLabel = document.getElementById('selectedBookLabel');
  const openBookBtn = document.getElementById('openBookBtn');
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  const shareXBtn = document.getElementById('shareXBtn');
  const messageBtn = document.getElementById('messageBtn');
  const moreShareBtn = document.getElementById('moreShareBtn');
  const editTitleBtn = document.querySelector('.edit-title');
  const titleElement = document.getElementById('myParlayTitle');

  let toastTimer = null;
  const originalSlip = bootstrap?.slip || null;
  const shareUrl = bootstrap?.shareUrl || window.location.href;
  const storageKey = `parlayping_builder:${String(bootstrap?.token || 'local').slice(0, 80)}`;

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeHttps(value) {
    if (!value) return null;
    try {
      const url = new URL(String(value), window.location.origin);
      return url.protocol === 'https:' ? url.toString() : null;
    } catch {
      return null;
    }
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2)
      .map(part => part[0]?.toUpperCase()).join('') || '?';
  }

  function avatarData(name, bg = '#0d2c43', fg = '#dffaff') {
    const letters = esc(initials(name));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" rx="60" fill="${bg}"/><text x="60" y="70" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="38" fill="${fg}">${letters}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function formatOdds(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n > 0 ? `+${Math.round(n)}` : String(Math.round(n));
  }

  function impliedFromAmerican(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return null;
    return n > 0 ? 100 / (n + 100) : (-n) / ((-n) + 100);
  }

  function probabilityForLeg(leg) {
    const status = String(leg?.status || 'PENDING').toUpperCase();
    const candidate = status === 'LIVE' ? leg?.liveProbability : leg?.pregameProbability;
    const n = Number(candidate);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
  }

  function displayMarket(leg) {
    if (leg?.displayMarket) return String(leg.displayMarket);
    const market = String(leg?.market || '').trim();
    const side = String(leg?.side || '').trim();
    const line = leg?.line;
    if (side && line !== null && line !== undefined && line !== '') {
      return `${side.charAt(0).toUpperCase()}${side.slice(1)} ${line}${market ? ` ${market}` : ''}`;
    }
    return market || 'Prop';
  }

  function statusDetail(leg) {
    const status = String(leg?.status || 'PENDING').toUpperCase();
    if (status === 'LIVE') return leg?.progressText ? `LIVE • ${leg.progressText}` : 'LIVE';
    if (['HIT', 'MISS', 'PUSH', 'VOID', 'UNRESOLVED'].includes(status)) return status;
    return leg?.matchup || leg?.team || leg?.sport || '';
  }

  function formatStart(value) {
    if (!value) return { date: '', time: '' };
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return { date: '', time: '' };
    return {
      date: new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(d),
      time: new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d),
    };
  }

  function say(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1900);
  }

  function setTuneState(open) {
    parlayPanel?.classList.toggle('tune-open', open);
    tuneBtn?.classList.toggle('active', open);
    tuneBtn?.setAttribute('aria-expanded', String(open));
    document.querySelectorAll('.alt-lines').forEach(section => section.setAttribute('aria-hidden', String(!open)));
  }

  function teamPairMarkup(leg) {
    const firstLogo = safeHttps(leg?.teamLogoUrl);
    const first = firstLogo || avatarData(leg?.team || leg?.sport || 'T', '#092239', '#20e9e0');
    const second = avatarData('VS', '#092239', '#8eaac0');
    return `<div class="team-pair"><img src="${esc(first)}" alt=""/><img src="${esc(second)}" alt=""/></div>`;
  }

  function altLineMarkup(leg) {
    const line = leg?.line;
    const current = line === null || line === undefined || line === '' ? 'Base' : String(line);
    const p = probabilityForLeg(leg);
    const odds = formatOdds(leg?.oddsAmerican);
    const placeholders = Array.from({ length: 4 }, () => '<button class="alt-option" type="button" disabled aria-disabled="true">—</button>').join('');
    return `<div class="alt-lines" aria-hidden="true">
      <div class="alt-title">Alt Lines <span class="info-dot">i</span></div>
      <div class="alt-options" role="group" aria-label="${esc(leg?.player || 'Player')} alternate lines">
        <button class="alt-option selected" type="button" data-line="${esc(current)}" data-prob="${p == null ? '' : esc((p * 100).toFixed(1))}" data-odds="${esc(odds)}">${esc(current)}</button>
        ${placeholders}
      </div>
    </div>`;
  }

  function pickMarkup(leg, index) {
    const probability = probabilityForLeg(leg);
    const pct = probability == null ? null : Math.max(0, Math.min(100, probability * 100));
    const playerImage = safeHttps(leg?.playerImageUrl) || avatarData(leg?.player);
    const matchup = String(leg?.matchup || leg?.team || leg?.sport || 'Matchup');
    const start = formatStart(leg?.startTimeUTC);
    const dateBits = [start.date, start.time].filter(Boolean);
    const detail = statusDetail(leg);
    const pickId = String(leg?.id || `leg-${index + 1}`);
    return `<article class="pick-card" data-pick="${esc(pickId)}" data-base-prob="${pct == null ? '' : esc(pct.toFixed(1))}" data-base-odds="${esc(formatOdds(leg?.oddsAmerican))}">
      <header class="game-bar">
        ${teamPairMarkup(leg)}
        <strong>${esc(matchup)}</strong>
        ${dateBits[0] ? `<span>${esc(dateBits[0])}</span>` : ''}
        ${dateBits[1] ? `<i>•</i><span>${esc(dateBits[1])}</span>` : ''}
      </header>
      <div class="pick-main">
        <div class="player-block">
          <img class="player-photo" src="${esc(playerImage)}" alt="${esc(leg?.player || 'Player')}"/>
          <div class="player-copy"><strong>${esc(leg?.player || 'Leg')}</strong><span>${esc(displayMarket(leg))}</span><small>${esc(detail)}</small></div>
        </div>
        <div class="probability-meter">
          <span class="meter-track"><i style="--meter:${pct == null ? 0 : pct}%"></i></span>
          <strong class="pick-probability">${pct == null ? '—' : `${pct.toFixed(1)}%`}</strong>
        </div>
        <div class="pick-odds">${esc(formatOdds(leg?.oddsAmerican))}</div>
        <button class="kebab" type="button" aria-label="${esc(leg?.player || 'Player')} bet options">⋮</button>
      </div>
      ${altLineMarkup(leg)}
    </article>`;
  }

  function renderInsights(slip) {
    const list = document.querySelector('.insights-list');
    if (!list) return;
    const items = (slip?.legs || []).slice(0, 4).map(leg => {
      const status = String(leg?.status || 'PENDING').toUpperCase();
      const p = probabilityForLeg(leg);
      let text = `${leg?.player || 'Leg'}: ${status}`;
      if (status === 'LIVE' && leg?.progressText) text += ` • ${leg.progressText}`;
      else if (status === 'PENDING' && p != null) text += ` • PG ${(p * 100).toFixed(1)}%`;
      else if (status === 'PENDING') text += ' • no verified model probability available';
      return `<li><span>✓</span> ${esc(text)}</li>`;
    });
    list.innerHTML = items.length ? items.join('') : '<li><span>✓</span> No verified insights are available for this slip yet.</li>';
  }

  function renderSimilar() {
    const list = document.querySelector('.similar-list');
    if (!list) return;
    list.innerHTML = `<div class="similar-row"><div class="mini-avatars"></div><div><strong>Community comparisons</strong><small>Verified similar parlays will appear here as the community feature comes online.</small></div><span class="tails">—</span><button type="button" disabled aria-label="Community comparisons unavailable">＋</button></div>`;
  }

  function updateSummary(slip) {
    const legs = Array.isArray(slip?.legs) ? slip.legs : [];
    if (legCount) legCount.textContent = String(legs.length);
    if (slip?.combinedOddsVerified === true && Number.isFinite(Number(slip?.combinedOddsAmerican))) {
      const odds = Number(slip.combinedOddsAmerican);
      if (combinedOdds) combinedOdds.textContent = formatOdds(odds);
      const implied = impliedFromAmerican(odds);
      if (impliedProbability) impliedProbability.textContent = implied == null ? '—' : `${(implied * 100).toFixed(1)}%`;
    } else {
      if (combinedOdds) combinedOdds.textContent = '—';
      if (impliedProbability) impliedProbability.textContent = 'Unpriced';
    }
  }

  function renderSlip(slip) {
    const legs = Array.isArray(slip?.legs) ? slip.legs : [];
    if (picks) picks.innerHTML = legs.map(pickMarkup).join('') || '<div class="empty-state"><strong>Your parlay is empty.</strong><p>Add another pick to start a new build.</p></div>';
    updateSummary(slip);
    renderInsights(slip);
    renderSimilar();
    bindPickActions();
    selectInitialBook(slip);
  }

  function sameBookTarget(slip, book) {
    const rows = Array.isArray(slip?.legs) ? slip.legs : [];
    const target = String(book || '').toLowerCase();
    if (!rows.length || !target || target === 'more books') return null;
    const matching = rows.filter(row => String(row?.sportsbook || '').toLowerCase() === target);
    if (matching.length !== rows.length) return null;
    const links = [...new Set(matching.map(row => safeHttps(row?.sportsbookLink)).filter(Boolean))];
    return links.length === 1 ? links[0] : null;
  }

  function selectInitialBook(slip) {
    const named = String(slip?.sportsbook || slip?.legs?.[0]?.sportsbook || '').trim();
    const button = named ? [...document.querySelectorAll('.book-card')].find(card => String(card.dataset.book || '').toLowerCase() === named.toLowerCase()) : null;
    if (button) button.click();
  }

  function bindPickActions() {
    document.querySelectorAll('.kebab').forEach(button => button.addEventListener('click', () => say('Bet options are ready for the next builder action.')));
    document.querySelectorAll('.alt-option:not([disabled])').forEach(button => button.addEventListener('click', () => {
      const card = button.closest('.pick-card');
      card?.querySelectorAll('.alt-option').forEach(option => option.classList.remove('selected'));
      button.classList.add('selected');
      say(`${card?.querySelector('.player-copy strong')?.textContent || 'Pick'} line selected.`);
    }));
  }

  function injectReturnControls(slip) {
    if (!slip?.returnUrl) return;
    const url = safeHttps(slip.returnUrl);
    if (!url) return;
    const label = String(slip.returnLabel || 'The Sports Outpost');
    const style = document.createElement('style');
    style.textContent = `.pp-return-control{position:fixed;z-index:60;top:104px;border:1px solid #1b607b;background:#061928;color:#eef8fd;text-decoration:none;font:700 12px Inter,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25)}.pp-return-back{left:14px;padding:10px 13px;border-radius:999px}.pp-return-close{right:14px;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-size:24px}@media(max-width:1180px){.pp-return-control{top:auto;bottom:14px}.pp-return-back{left:14px}.pp-return-close{right:14px}}`;
    document.head.appendChild(style);
    const back = document.createElement('a');
    back.className = 'pp-return-control pp-return-back';
    back.href = url;
    back.textContent = `← Back to ${label}`;
    const close = document.createElement('a');
    close.className = 'pp-return-control pp-return-close';
    close.href = url;
    close.setAttribute('aria-label', `Close ParlayPing and return to ${label}`);
    close.textContent = '×';
    document.body.append(back, close);
  }

  function currentBuildState() {
    return {
      title: titleElement?.childNodes?.[0]?.textContent?.trim() || 'My Parlay',
      tuneOpen: Boolean(parlayPanel?.classList.contains('tune-open')),
      book: document.querySelector('.book-card.active')?.dataset.book || 'DraftKings',
    };
  }

  function restoreSavedBuild() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { saved = null; }
    if (!saved) return;
    if (saved.book) document.querySelector(`.book-card[data-book="${CSS.escape(saved.book)}"]`)?.click();
    if (saved.tuneOpen) setTuneState(true);
    if (saved.title && titleElement) titleElement.childNodes[0].textContent = `${saved.title} `;
  }

  tuneBtn?.addEventListener('click', () => {
    const next = !parlayPanel?.classList.contains('tune-open');
    setTuneState(next);
    say(next ? 'Parlay Tune opened.' : 'Parlay Tune closed.');
  });

  saveBtn?.addEventListener('click', () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(currentBuildState()));
      saveBtn.classList.add('saved');
      saveBtn.innerHTML = '<span>✓</span> Saved';
      say('Parlay saved on this device.');
    } catch {
      say('Unable to save in this browser.');
    }
  });

  clearAllBtn?.addEventListener('click', () => {
    if (picks) picks.innerHTML = '<div class="empty-state"><strong>Your parlay is clear.</strong><p>Add another pick to restore the signed build.</p></div>';
    if (legCount) legCount.textContent = '0';
    if (combinedOdds) combinedOdds.textContent = '—';
    if (impliedProbability) impliedProbability.textContent = '—';
    say('Parlay cleared.');
  });

  addPickBtn?.addEventListener('click', () => {
    if (!document.querySelector('.pick-card') && originalSlip) {
      renderSlip(originalSlip);
      setTuneState(Boolean(tuneBtn?.classList.contains('active')));
      say('Signed picks restored.');
      return;
    }
    say('Add Pick search is the next builder connection.');
  });

  editTitleBtn?.addEventListener('click', () => {
    const current = (titleElement?.childNodes?.[0]?.textContent || 'My Parlay').trim();
    const next = window.prompt('Name this parlay', current);
    if (!next?.trim() || !titleElement) return;
    titleElement.childNodes[0].textContent = `${next.trim()} `;
    say('Parlay name updated.');
  });

  document.querySelectorAll('.book-card').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.book-card').forEach(card => card.classList.remove('active'));
      button.classList.add('active');
      if (selectedBookLabel) selectedBookLabel.textContent = button.dataset.book === 'More Books' ? 'Your Sportsbook' : button.dataset.book;
    });
  });

  openBookBtn?.addEventListener('click', () => {
    const book = document.querySelector('.book-card.active')?.dataset.book || 'DraftKings';
    const target = sameBookTarget(originalSlip, book);
    if (target) {
      window.open(target, '_blank', 'noopener,noreferrer');
      return;
    }
    say(`${book}: no verified full-parlay deep link was supplied for this signed slip.`);
  });

  async function copyCurrentLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      say('Betslip link copied.');
    } catch {
      window.prompt('Copy this link', shareUrl);
    }
  }

  async function nativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'My ParlayPing Betslip', text: 'Check out my ParlayPing betslip', url: shareUrl });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    await copyCurrentLink();
  }

  copyLinkBtn?.addEventListener('click', copyCurrentLink);
  messageBtn?.addEventListener('click', nativeShare);
  moreShareBtn?.addEventListener('click', nativeShare);
  if (shareXBtn) shareXBtn.href = `https://x.com/intent/post?text=${encodeURIComponent('Check out my ParlayPing betslip')}&url=${encodeURIComponent(shareUrl)}`;

  document.querySelectorAll('.similar-row button').forEach(button => button.addEventListener('click', () => say('Community comparisons are not available yet.')));
  document.getElementById('analysisBtn')?.addEventListener('click', () => say('Full analysis is being connected to verified live research.'));
  document.querySelector('.search-button')?.addEventListener('click', () => say('Search will find players, markets, and parlays.'));
  document.querySelector('.notification-button')?.addEventListener('click', () => say('Notifications are coming soon.'));

  document.querySelector('.brand')?.setAttribute('href', '/');
  document.querySelector('.profile-button')?.setAttribute('href', '/account.html');

  if (bootstrap?.ok && originalSlip) {
    renderSlip(originalSlip);
    injectReturnControls(originalSlip);
    setTuneState(false);
    restoreSavedBuild();
  } else {
    if (picks) picks.innerHTML = '<div class="empty-state"><strong>This signed betslip could not be loaded.</strong><p>Return to the source and create a new ParlayPing link.</p></div>';
    updateSummary({ legs: [] });
  }

  document.body.classList.remove('pp-hydrating');
})();
