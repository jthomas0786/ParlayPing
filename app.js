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

const conceptSummary = Object.freeze({ odds: '+412', probability: '19.5%' });
const originalPicksMarkup = picks?.innerHTML || '';
let toastTimer = null;

function say(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1700);
}

function visiblePickCards() {
  return [...document.querySelectorAll('.pick-card')];
}

function setTuneState(open) {
  parlayPanel?.classList.toggle('tune-open', open);
  tuneBtn?.classList.toggle('active', open);
  tuneBtn?.setAttribute('aria-expanded', String(open));
  document.querySelectorAll('.alt-lines').forEach(section => section.setAttribute('aria-hidden', String(!open)));
}

function markBuildForReprice() {
  if (combinedOdds) combinedOdds.textContent = 'CUSTOM';
  if (impliedProbability) impliedProbability.textContent = 'Repricing';
}

function restoreConceptSummary() {
  const allDefault = [...document.querySelectorAll('.alt-options')].every(group => group.querySelector('.alt-option.selected')?.dataset.line === '0.5');
  if (allDefault) {
    if (combinedOdds) combinedOdds.textContent = conceptSummary.odds;
    if (impliedProbability) impliedProbability.textContent = conceptSummary.probability;
  }
}

function bindAltLineButtons(root = document) {
  root.querySelectorAll('.alt-option').forEach(button => {
    button.addEventListener('click', () => {
      const card = button.closest('.pick-card');
      card?.querySelectorAll('.alt-option').forEach(option => option.classList.remove('selected'));
      button.classList.add('selected');

      const probability = Number(button.dataset.prob || 0);
      const odds = button.dataset.odds || '—';
      const probabilityLabel = card?.querySelector('.pick-probability');
      const oddsLabel = card?.querySelector('.pick-odds');
      const meter = card?.querySelector('.meter-track i');
      if (probabilityLabel) probabilityLabel.textContent = `${probability.toFixed(1)}%`;
      if (oddsLabel) oddsLabel.textContent = odds;
      if (meter) meter.style.setProperty('--meter', `${Math.max(0, Math.min(100, probability))}%`);

      if (button.dataset.line === '0.5') restoreConceptSummary();
      else markBuildForReprice();
      say(`${card?.querySelector('.player-copy strong')?.textContent || 'Pick'} moved to ${button.dataset.line}`);
    });
  });
}

function bindPickKebabs(root = document) {
  root.querySelectorAll('.kebab').forEach(button => button.addEventListener('click', () => say('Bet options are ready for the next builder action.')));
}

function currentBuildState() {
  return {
    title: titleElement?.childNodes?.[0]?.textContent?.trim() || 'My Parlay',
    tuneOpen: Boolean(parlayPanel?.classList.contains('tune-open')),
    selections: visiblePickCards().map(card => ({
      id: card.dataset.pick,
      line: card.querySelector('.alt-option.selected')?.dataset.line || '0.5',
    })),
    book: document.querySelector('.book-card.active')?.dataset.book || 'DraftKings',
  };
}

function restoreSavedBuild() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem('parlayping_builder_concept') || 'null'); } catch { saved = null; }
  if (!saved || !Array.isArray(saved.selections)) return;
  saved.selections.forEach(selection => {
    const card = document.querySelector(`.pick-card[data-pick="${CSS.escape(selection.id)}"]`);
    const option = card?.querySelector(`.alt-option[data-line="${CSS.escape(selection.line)}"]`);
    if (option && !option.classList.contains('selected')) option.click();
  });
  if (saved.book) document.querySelector(`.book-card[data-book="${CSS.escape(saved.book)}"]`)?.click();
  if (saved.tuneOpen) setTuneState(true);
}

function resetPicksToConcept() {
  if (!picks) return;
  picks.innerHTML = originalPicksMarkup;
  bindAltLineButtons(picks);
  bindPickKebabs(picks);
  if (legCount) legCount.textContent = '3';
  if (combinedOdds) combinedOdds.textContent = conceptSummary.odds;
  if (impliedProbability) impliedProbability.textContent = conceptSummary.probability;
  setTuneState(Boolean(tuneBtn?.classList.contains('active')));
}

tuneBtn?.addEventListener('click', () => {
  const nextOpen = !parlayPanel?.classList.contains('tune-open');
  setTuneState(nextOpen);
  say(nextOpen ? 'Parlay Tune opened.' : 'Parlay Tune closed.');
});

saveBtn?.addEventListener('click', () => {
  try {
    localStorage.setItem('parlayping_builder_concept', JSON.stringify(currentBuildState()));
    saveBtn.classList.add('saved');
    saveBtn.innerHTML = '<span>✓</span> Saved';
    say('Parlay saved on this device.');
  } catch {
    say('Unable to save in this browser.');
  }
});

clearAllBtn?.addEventListener('click', () => {
  if (!picks) return;
  picks.innerHTML = '<div class="empty-state"><strong>Your parlay is clear.</strong><p>Add another pick to start a new build.</p></div>';
  if (legCount) legCount.textContent = '0';
  if (combinedOdds) combinedOdds.textContent = '—';
  if (impliedProbability) impliedProbability.textContent = '—';
  say('Parlay cleared.');
});

addPickBtn?.addEventListener('click', () => {
  if (!document.querySelector('.pick-card')) {
    resetPicksToConcept();
    say('Sample picks restored.');
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
  say(`${book}: verified betslip deep-link handoff will open here when connected.`);
});

async function copyCurrentLink() {
  const url = window.location.href;
  try {
    await navigator.clipboard.writeText(url);
    say('Betslip link copied.');
  } catch {
    window.prompt('Copy this link', url);
  }
}

async function nativeShare() {
  const url = window.location.href;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'My ParlayPing Betslip', text: 'Check out my ParlayPing betslip', url });
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

if (shareXBtn) {
  const url = encodeURIComponent(window.location.href);
  shareXBtn.href = `https://x.com/intent/post?text=${encodeURIComponent('Check out my ParlayPing betslip')}&url=${url}`;
}

document.querySelectorAll('.similar-row button').forEach(button => button.addEventListener('click', () => say('Similar parlay added to your compare queue.')));
document.getElementById('analysisBtn')?.addEventListener('click', () => say('Full analysis view is being connected to live research.'));
document.querySelector('.search-button')?.addEventListener('click', () => say('Search will find players, markets, and parlays.'));
document.querySelector('.notification-button')?.addEventListener('click', () => say('3 ParlayPing notifications.'));

bindAltLineButtons();
bindPickKebabs();
setTuneState(false);
restoreSavedBuild();
