const { analyzeMultiSport } = require('./sport-router');
const { mergeAnalysisIntoSlip, probabilityOrNull } = require('./share-slip');
const { enrichShareAssets } = require('./share-assets');
const { ensureHeadshots } = require('./headshot-ensure');
const { ensureNflOfficialHeadshots } = require('./nfl-headshot-fallback');

function preserveDisplayProbabilities(slip, analysis) {
  const legs = Array.isArray(slip?.legs) ? slip.legs : [];
  const results = Array.isArray(analysis?.results) ? analysis.results : [];
  if (!legs.length || !results.length) return slip;
  const byId = new Map(results.filter(row => row?.id).map(row => [String(row.id), row]));
  const nextLegs = legs.map((leg, index) => {
    const result = byId.get(String(leg?.id || '')) || results[index] || null;
    if (!result || String(leg?.status || '').toUpperCase() !== 'LIVE') return leg;
    if (probabilityOrNull(leg.liveProbability) != null || probabilityOrNull(leg.pregameProbability) != null) return leg;
    const probability = probabilityOrNull(result.probability);
    if (probability == null) return leg;
    const source = String(result.probabilitySource || result.probabilityKind || result.probabilityMethod || '').trim();
    const explicitlyLive = /live/i.test(source);
    return {
      ...leg,
      ...(explicitlyLive ? { liveProbability: probability } : { pregameProbability: probability }),
      probabilitySource: source || (explicitlyLive ? 'live_model' : 'pregame_model'),
    };
  });
  return { ...slip, legs: nextLegs };
}

async function withAssets(slip) {
  let enriched = slip;
  try {
    enriched = await enrichShareAssets(enriched);
  } catch (_) {}
  try {
    enriched = await ensureHeadshots(enriched);
  } catch (_) {}
  try {
    enriched = await ensureNflOfficialHeadshots(enriched);
  } catch (_) {}
  return enriched;
}

async function hydrateSharedSlip(slip, options = {}) {
  const baseUrl = String(options.baseUrl || process.env.PUBLIC_BASE_URL || 'https://parlayping.net').replace(/\/$/, '');
  try {
    const analysis = await analyzeMultiSport(slip.legs, {
      baseUrl,
      referenceTime: options.referenceTime || slip.createdAt || null,
      now: options.now,
    });
    const merged = preserveDisplayProbabilities(mergeAnalysisIntoSlip(slip, analysis), analysis);
    return {
      slip: await withAssets(merged),
      analysis,
      liveDataAvailable: true,
      error: null,
    };
  } catch (error) {
    const merged = mergeAnalysisIntoSlip(slip, {});
    return {
      slip: await withAssets(merged),
      analysis:null,
      liveDataAvailable:false,
      error:error?.message || 'Live analysis unavailable.',
    };
  }
}

module.exports = { hydrateSharedSlip, withAssets, preserveDisplayProbabilities };
