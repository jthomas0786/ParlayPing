const { resolveSportsbookBetslip, resolveSportsbooksBetslip } = require('./odds-api-deeplink');
const { validateResolvedSelections, hasFullExactCoverage, buildResolutionDiagnostics } = require('./exact-selection-validation');

const EXACT_RESOLUTION_CACHE_MS = 60_000;
const exactResolutionCache = new Map();
const exactResolutionInflight = new Map();
const exactBatchInflight = new Map();

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

function exactBatchCacheKey(books, legs) {
  return `${(Array.isArray(books) ? books : []).map(book => String(book || '').toLowerCase()).sort().join(',')}::${(Array.isArray(legs) ? legs : []).map(resolutionLegKey).join(';;')}`;
}

function pruneExactResolutionCache(now = Date.now()) {
  for (const [key, entry] of exactResolutionCache.entries()) {
    if (!entry || entry.expiresAt <= now) exactResolutionCache.delete(key);
  }
}

function clearExactResolutionCache() {
  exactResolutionCache.clear();
  exactResolutionInflight.clear();
  exactBatchInflight.clear();
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

async function resolveBatchWithInflight({ books, legs }) {
  const key = exactBatchCacheKey(books, legs);
  if (exactBatchInflight.has(key)) return exactBatchInflight.get(key);
  const pending = Promise.resolve()
    .then(() => resolveSportsbooksBetslip({ books, legs }))
    .finally(() => exactBatchInflight.delete(key));
  exactBatchInflight.set(key, pending);
  return pending;
}

function applyExactResolution(slip, book, result) {
  const legs = Array.isArray(slip?.legs) ? slip.legs : [];
  const selections = validateResolvedSelections(legs, result?.selections);
  if (!hasFullExactCoverage(legs, selections, { requirePrice: true })) return slip;

  const nextLegs = legs.map((leg, index) => {
    const selection = selections[index];
    const fallbackPrice = finiteOdds(selection?.price);
    const existingOffers = leg?.bookOffers && typeof leg.bookOffers === 'object' ? leg.bookOffers : {};
    const existing = bookOffer(leg, book) || {};
    const primaryPrice = finiteOdds(existing?.oddsAmerican);
    const preservePrimaryPrice = primaryPrice != null;
    const hasProviderReference = Boolean(selection.selectionLink || selection.selectionId || selection.marketId);
    return {
      ...leg,
      bookOffers: {
        ...existingOffers,
        [book]: {
          ...existing,
          // Sports Outpost / ParlayAPI and uploaded-slip exact prices are primary.
          // The Odds API fallback may only fill a missing price; it must never
          // replace an exact price we already have for this same book + leg.
          oddsAmerican: preservePrimaryPrice ? primaryPrice : fallbackPrice,
          ...(selection.selectionLink ? { selectionLink: selection.selectionLink } : {}),
          ...(selection.selectionId ? { selectionId: String(selection.selectionId) } : {}),
          ...(selection.marketId ? { marketId: String(selection.marketId) } : {}),
          ...(selection.marketKey ? { marketKey: String(selection.marketKey) } : {}),
          ...(selection.line != null ? { matchedLine: Number(selection.line) } : {}),
          priceKind: preservePrimaryPrice ? (existing.priceKind || 'primary-exact-price') : 'verified-exact-resolver',
          ...(preservePrimaryPrice
            ? (existing.priceSource ? { priceSource: existing.priceSource } : {})
            : { priceSource: 'TheOddsAPI' }),
          ...(hasProviderReference ? { referenceSource: 'TheOddsAPI' } : {}),
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

function logResolution(book, legs, result, options) {
  const diagnostics = buildResolutionDiagnostics(legs, result?.selections, {
    book,
    prefilled: Boolean(safeHttps(result?.url)),
  });
  if (options.log !== false) {
    console.info('ParlayPing exact sportsbook fallback', JSON.stringify(diagnosticLogPayload(diagnostics)));
  }
}

async function enrichMissingExactSportsbooks(slip, options = {}) {
  let enriched = slip;
  const books = Array.isArray(options.books) && options.books.length ? options.books : ['FanDuel', 'DraftKings', 'BetMGM', 'BetRivers', 'Bovada', 'theScore Bet'];
  const resolve = typeof options.resolve === 'function' ? options.resolve : resolveSportsbookBetslip;
  const useDefaultBatch = resolve === resolveSportsbookBetslip && options.batch !== false;
  const useCache = options.cache === true || (options.cache !== false && resolve === resolveSportsbookBetslip);
  const legs = Array.isArray(enriched?.legs) ? enriched.legs : [];
  const missingBooks = books.filter(book => !hasFullBookPricing(enriched, book));
  if (!missingBooks.length) return enriched;

  if (useDefaultBatch) {
    try {
      // The Odds API is secondary. Resolve only books that are still missing
      // full exact pricing after the primary Sports Outpost / ParlayAPI snapshot.
      const results = await resolveBatchWithInflight({ books: missingBooks, legs });
      for (const book of missingBooks) {
        const result = results?.[book] || null;
        if (!result) continue;
        logResolution(book, legs, result, options);
        enriched = applyExactResolution(enriched, book, result);
      }
      return enriched;
    } catch (error) {
      if (options.log !== false) console.warn('ParlayPing batched exact sportsbook fallback unavailable:', error?.message || error);
      return enriched;
    }
  }

  // Custom/test resolvers remain independently concurrent so regression fixtures can
  // exercise individual sportsbook behavior without requiring a provider batch API.
  const attempts = await Promise.all(missingBooks.map(async book => {
    try {
      const result = await resolveWithCache({
        book,
        legs,
        resolve,
        enabled: useCache,
        ttlMs: options.cacheTtlMs,
      });
      logResolution(book, legs, result, options);
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
  exactBatchCacheKey,
  clearExactResolutionCache,
  resolveWithCache,
  resolveBatchWithInflight,
  applyExactResolution,
  enrichMissingExactSportsbooks,
};