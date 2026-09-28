function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function exactLineMatches(leg, selection) {
  const requested = finiteNumber(leg?.line);
  if (requested == null) return true;
  const resolved = finiteNumber(selection?.line);
  if (resolved == null) return false;
  if (Math.abs(requested - resolved) < 1e-7) return true;
  if (!leg?.inclusive || !Number.isInteger(requested)) return false;

  const side = String(leg?.side || leg?.selection || 'over').toLowerCase();
  const expected = side === 'under' || side === 'no' ? requested + 0.5 : requested - 0.5;
  return Math.abs(expected - resolved) < 1e-7;
}

function validateResolvedSelections(legs, selections) {
  const rows = Array.isArray(legs) ? legs : [];
  const resolved = Array.isArray(selections) ? selections : [];
  if (!rows.length || resolved.length !== rows.length) return new Array(rows.length).fill(null);
  return rows.map((leg, index) => {
    const selection = resolved[index];
    return selection && exactLineMatches(leg, selection) ? selection : null;
  });
}

function hasFullExactCoverage(legs, selections, { requirePrice = false } = {}) {
  const validated = validateResolvedSelections(legs, selections);
  if (!validated.length || validated.some(selection => !selection)) return false;
  if (!requirePrice) return true;
  return validated.every(selection => finiteNumber(selection?.price) != null && Number(selection.price) !== 0);
}

function buildResolutionDiagnostics(legs, selections, { book = null, prefilled = false } = {}) {
  const rows = Array.isArray(legs) ? legs : [];
  const resolved = Array.isArray(selections) ? selections : [];
  const diagnostics = rows.map((leg, index) => {
    const selection = resolved[index] || null;
    const requestedLine = finiteNumber(leg?.line);
    const resolvedLine = finiteNumber(selection?.line);
    const price = finiteNumber(selection?.price);
    const exact = Boolean(selection && exactLineMatches(leg, selection));
    const priced = Boolean(exact && price != null && price !== 0);
    const hasSelectionLink = Boolean(selection?.selectionLink);
    const hasSelectionId = Boolean(selection?.selectionId);
    const hasMarketId = Boolean(selection?.marketId);
    let code = 'EXACT_SELECTION';
    if (!selection) code = 'SELECTION_NOT_FOUND';
    else if (!exact) code = resolvedLine == null ? 'LINE_MISSING' : 'LINE_MISMATCH';
    else if (!priced) code = 'PRICE_MISSING';

    return {
      index,
      player: leg?.player || null,
      market: leg?.market || leg?.displayMarket || null,
      side: leg?.side || leg?.selection || null,
      requestedLine,
      resolvedLine,
      price,
      inclusive: Boolean(leg?.inclusive),
      exact,
      priced,
      hasSelectionLink,
      hasSelectionId,
      hasMarketId,
      code,
    };
  });

  const exactMatched = diagnostics.filter(row => row.exact).length;
  const pricedMatched = diagnostics.filter(row => row.priced).length;
  const providerReferenceMatched = diagnostics.filter(row => row.hasSelectionLink || (row.hasSelectionId && row.hasMarketId)).length;
  const total = diagnostics.length;
  let code = 'EXACT_PREFILLED';
  if (!total) code = 'NO_LEGS';
  else if (exactMatched !== total) code = 'INCOMPLETE_EXACT_COVERAGE';
  else if (pricedMatched !== total) code = 'EXACT_PRICE_COVERAGE_INCOMPLETE';
  else if (!prefilled) code = 'EXACT_COVERAGE_DEEPLINK_UNAVAILABLE';

  return {
    book: book || null,
    code,
    totalLegs: total,
    exactCoverage: { matched: exactMatched, total },
    pricedCoverage: { matched: pricedMatched, total },
    providerReferenceCoverage: { matched: providerReferenceMatched, total },
    prefilled: Boolean(prefilled),
    legs: diagnostics,
  };
}

module.exports = {
  finiteNumber,
  exactLineMatches,
  validateResolvedSelections,
  hasFullExactCoverage,
  buildResolutionDiagnostics,
};
