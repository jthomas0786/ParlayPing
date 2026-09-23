const { analyzeMultiSport } = require('./sport-router');
const { mergeAnalysisIntoSlip } = require('./share-slip');
const { enrichShareAssets } = require('./share-assets');
const { ensureHeadshots } = require('./headshot-ensure');
const { ensureNflOfficialHeadshots } = require('./nfl-headshot-fallback');

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
    const merged = mergeAnalysisIntoSlip(slip, analysis);
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

module.exports = { hydrateSharedSlip, withAssets };
