const { resolveSportsbookBetslip } = require('./odds-api-deeplink');

function finiteOdds(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? n : null;
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

function applyExactResolution(slip, book, result) {
  const legs = Array.isArray(slip?.legs) ? slip.legs : [];
  const selections = Array.isArray(result?.selections) ? result.selections : [];
  if (!result?.exact || !result?.url || !legs.length || selections.length !== legs.length || selections.some(row => !row)) return slip;

  const nextLegs = legs.map((leg, index) => {
    const selection = selections[index] || {};
    const price = finiteOdds(selection.price);
    const existingOffers = leg?.bookOffers && typeof leg.bookOffers === 'object' ? leg.bookOffers : {};
    const existing = bookOffer(leg, book) || {};
    return {
      ...leg,
      bookOffers: {
        ...existingOffers,
        [book]: {
          ...existing,
          ...(price != null ? { oddsAmerican: price } : {}),
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

  return {
    ...slip,
    sportsbookLinks: {
      ...(slip?.sportsbookLinks && typeof slip.sportsbookLinks === 'object' ? slip.sportsbookLinks : {}),
      [book]: result.url,
    },
    legs: nextLegs,
  };
}

async function enrichMissingExactSportsbooks(slip, options = {}) {
  let enriched = slip;
  const books = Array.isArray(options.books) && options.books.length ? options.books : ['FanDuel'];
  const resolve = typeof options.resolve === 'function' ? options.resolve : resolveSportsbookBetslip;

  for (const book of books) {
    if (hasFullBookPricing(enriched, book)) continue;
    try {
      const result = await resolve({ book, legs: Array.isArray(enriched?.legs) ? enriched.legs : [] });
      enriched = applyExactResolution(enriched, book, result);
    } catch (error) {
      if (options.log !== false) console.warn(`ParlayPing ${book} exact fallback unavailable:`, error?.message || error);
    }
  }
  return enriched;
}

module.exports = {
  finiteOdds,
  bookOffer,
  hasFullBookPricing,
  applyExactResolution,
  enrichMissingExactSportsbooks,
};
