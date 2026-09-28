const { resolveSportsbookBetslip } = require('./odds-api-deeplink');
const { validateResolvedSelections, hasFullExactCoverage, buildResolutionDiagnostics } = require('./exact-selection-validation');

const EXACT_RESOLUTION_CACHE_MS = 60_000;
const exactResolutionCache = new Map();
const exactResolutionInflight = new Map();

function finiteOdds(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function safeHttps(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function bookOffer(leg, book) {
  const offers = leg?.bookOffers && typeof leg.bookOffers === 'object' ? leg.bookOffers : {};
  const wanted = String(book || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [raw, offer] of Object.entries(offers)) {
    const key = String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key === wanted) return offer && typeof offer === 'object' ? offer : null;
  }
  return null;
}

function hasFullBookPricing(slip, book) {
  const legs = Array.isArray(slip?.legs) ? slip.legs : [];
  return Boolean(legs.length && legs.every(leg => finiteOdds(bookOffer(leg, book)?.oddsAmerican) != null));
}

function diagnosticLogPayload(diagnostics) {
  if (!diagnostics) return null;
  return {
    book: diagnostics.book,
    code: diagnostics.code,
    exactCoverage: diagnostics.exactCoverage,
    pricedCoverage: diagnostics.pricedCoverage,
    providerReferenceCoverage: diagnostics.providerReferenceCoverage,
    prefilled: diagnostics.prefilled,
    legs: (diagnostics.legs || []).map(row => ({
      index: row.index,
      player: row.player,
      market: row.market,
      code: row.code,
      requestedLine: row.requestedLine,
      resolvedLine: row.resolvedLine,
      price: row.price,
      hasSelectionLink: row.hasSelectionLink,
      hasSelectionId: row.hasSelectionId,
      hasMarketId: row.hasMarketId,
    })),
  };
}

function resolutionLegKey(leg) {
  return [
    String(leg?.sport || '').toUpperCase(),
    String(leg?.gameId || ''),
    String(leg?.matchup || ''),
    String(leg?.startTimeUTC || ''),
    String(leg?.player || '').toLowerCase(),
    String(leg?.market || leg?.displayMarket || '').toLowerCase(),
    String(leg?.side || leg?.selection || '').toLowerCase(),
    leg?.line == null ? '' : String(Number(leg.line)),
    leg?.inclusive ? '1' : '0',
  ].join('|');
}

function exactResolutionCacheKey(book, legs) {
  return `${String(book || '').toLowerCase()}::${(Array.isArray(legs) ? legs : []).map(resolutionLegKey).join(';;')}`;
}

function pruneExactResolutionCache(now = Date.now()) {
  for (const [key, entry] of exactResolutionCache.entries()) {
    if (!entry || entry.expiresAt <= now) exactResolutionCache.delete(key);
  }
}

function clearExactResolutionCache() {
  exactResolutionCache.clear();
  exactResolutionInflight.clear();
}

async function resolveWithCache({ book, legs, resolve, enabled = true, ttlMs = EXACT_RESOLUTION_CACHE_MS }) {
  if (!enabled) return resolve({ book, legs });
  const key = exactResolutionCacheKey(book, legs);
  const now = Date.now();
  const hit = exactResolutionCache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  if (exactResolutionInflight.has(key)) return exactResolutionInflight.get(key);

  pruneExactResolutionCache(now);
  const pending = Promise.resolve()
    .then(() => resolve({ book, legs }))
    .then(value => {
      exactResolutionCache.set(key, { value, expiresAt: Date.now() + Math.max(1_000, Number(ttlMs) || EXACT_RESOLUTION_CACHE_MS) });
      return value;
    })
    .finally(() => exactResolutionInflight.delete(key));
  exactResolutionInflight.set(key, pending);
  return pending;
}

function applyExactResolution(slip, book, result) {
  const legs = Array.isArray(slip?.legs) ? slip.legs : [];
  const selections = validateResolvedSelections(legs, result?.selections);
  if (!hasFullExactCoverage(legs, selections, { requirePrice: true })) return slip;

  const nextLegs = legs.map((leg, index) => {
    const selection = selections[index];
    const price = finiteOdds(selection?.price);
    const existingOffers = leg?.bookOffers && typeof leg.bookOffers === 'object' ? leg.bookOffers : {};
    const existing = bookOffer(leg, book) || {};
    return {
      ...leg,
      bookOffers: {
        ...existingOffers,
        [book]: {
          ...existing,
          oddsAmerican: price,
          ...(selection.selectionLink ? { selectionLink: selection.selectionLink } : {}),
          ...(selection.selectionId ? { selectionId: String(selection.selectionId) } : {}),
          ...(selection.marketId ? { marketId: String(selection.marketId) } : {}),
          ...(selection.marketKey ? { marketKey: String(selection.marketKey) } : {}),
          ...(selection.line != null ? { matchedLine: Number(selection.line) } : {}),
          priceKind: 'verified-exact-resolver',
        },
      },
    };
  });

  const url = safeHttps(result?.url);
  const next = { ...slip, legs: nextLegs };
  if (url) {
    next.sportsbookLinks = {
      ...(slip?.sportsbookLinks && typeof slip.sportsbookLinks === 'object' ? slip.sportsbookLinks : {}),
      [book]: url,
    };
  }
  return next;
}

async function enrichMissingExactSportsbooks(slip, options = {}) {
  let enriched = slip;
  const books = Array.isArray(options.books) && options.books.length ? options.books : ['FanDuel', 'DraftKings', 'BetMGM', 'BetRivers', 'Bovada', 'theScore Bet'];
  const resolve = typeof options.resolve === 'function' ? options.resolve : resolveSportsbookBetslip;
  const useCache = options.cache === true || (options.cache !== false && resolve === resolveSportsbookBetslip);
  const legs = Array.isArray(enriched?.legs) ? enriched.legs : [];
  const missingBooks = books.filter(book => !hasFullBookPricing(enriched, book));

  // Each sportsbook is independent. Resolve missing books concurrently, then merge only
  // full exact coverage back into the slip in stable book order.
  const attempts = await Promise.all(missingBooks.map(async book => {
    try {
      const result = await resolveWithCache({
        book,
        legs,
        resolve,
        enabled: useCache,
        ttlMs: options.cacheTtlMs,
      });
      const diagnostics = buildResolutionDiagnostics(legs, result?.selections, {
        book,
        prefilled: Boolean(safeHttps(result?.url)),
      });
      if (options.log !== false) {
        console.info('ParlayPing exact sportsbook fallback', JSON.stringify(diagnosticLogPayload(diagnostics)));
      }
      return { book, result };
    } catch (error) {
      if (options.log !== false) console.warn(`ParlayPing ${book} exact fallback unavailable:`, error?.message || error);
      return { book, result: null };
    }
  }));

  for (const { book, result } of attempts) {
    if (result) enriched = applyExactResolution(enriched, book, result);
  }
  return enriched;
}

module.exports = {
  EXACT_RESOLUTION_CACHE_MS,
  finiteOdds,
  bookOffer,
  hasFullBookPricing,
  diagnosticLogPayload,
  exactResolutionCacheKey,
  clearExactResolutionCache,
  resolveWithCache,
  applyExactResolution,
  enrichMissingExactSportsbooks,
};