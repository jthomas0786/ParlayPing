const base = require('./sport-router');
const { analyzeSlip: analyzeLiveNflSlip } = require('./parlay-engine-live');

function normalizedSport(value) {
  return base.normalizeSport ? base.normalizeSport(value) : String(value || 'NFL').toUpperCase();
}

async function analyzeMultiSport(rawLegs, options = {}) {
  const legs = Array.isArray(rawLegs) ? rawLegs : [];
  if (legs.length && legs.every(leg => normalizedSport(leg?.sport) === 'NFL')) {
    const analysis = await analyzeLiveNflSlip(legs, options);
    return {
      ...analysis,
      sports: ['NFL'],
      supportedSports: ['NFL'],
      unsupportedSports: []
    };
  }
  return base.analyzeMultiSport(rawLegs, options);
}

module.exports = { ...base, analyzeMultiSport };