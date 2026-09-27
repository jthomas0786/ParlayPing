const base = require('./sportsbook-enrich');

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sportsbookEquivalentLeg(leg = {}) {
  const line = finite(leg.line);
  if (line == null || leg.inclusive !== true || !Number.isInteger(line)) return { ...leg };
  const side = String(leg.side || 'over').toLowerCase();
  if (side === 'over') return { ...leg, line: line - 0.5, inclusive: false };
  if (side === 'under') return { ...leg, line: line + 0.5, inclusive: false };
  return { ...leg };
}

async function enrichSportsbookMarkets(slip = {}) {
  const originalLegs = Array.isArray(slip.legs) ? slip.legs : [];
  const lookupLegs = originalLegs.map(sportsbookEquivalentLeg);
  const enriched = await base.enrichSportsbookMarkets({ ...slip, legs: lookupLegs });
  const enrichedLegs = Array.isArray(enriched?.legs) ? enriched.legs : lookupLegs;
  return {
    ...enriched,
    legs: enrichedLegs.map((leg, index) => {
      const original = originalLegs[index] || {};
      return {
        ...leg,
        line: original.line,
        inclusive: Boolean(original.inclusive),
        displayMarket: original.displayMarket ?? leg.displayMarket,
        originalText: original.originalText ?? leg.originalText,
        target: original.target ?? leg.target,
      };
    }),
  };
}

module.exports = {
  ...base,
  enrichSportsbookMarkets,
  sportsbookEquivalentLeg,
};
