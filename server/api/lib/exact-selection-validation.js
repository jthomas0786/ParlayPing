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

module.exports = {
  finiteNumber,
  exactLineMatches,
  validateResolvedSelections,
  hasFullExactCoverage,
};
