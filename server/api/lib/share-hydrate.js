const { analyzeMultiSport } = require('./sport-router');
const { mergeAnalysisIntoSlip } = require('./share-slip');
const { enrichShareAssets } = require('./share-assets');

async function withAssets(slip) {
  try {
    return await enrichShareAssets(slip);
  } catch (_) {
    return slip;
  }
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
      analysis: null,
      liveDataAvailable: false,
      error: error?.message || 'Live analysis unavailable.',
    };
  }
}

module.exports = { hydrateSharedSlip, withAssets };
