const { analyzeMultiSport } = require('./sport-router');
const { mergeAnalysisIntoSlip } = require('./share-slip');

async function hydrateSharedSlip(slip, options = {}) {
  const baseUrl = String(options.baseUrl || process.env.PUBLIC_BASE_URL || 'https://parlayping.net').replace(/\/$/, '');
  try {
    const analysis = await analyzeMultiSport(slip.legs, {
      baseUrl,
      referenceTime: options.referenceTime || slip.createdAt || null,
      now: options.now,
    });
    return {
      slip: mergeAnalysisIntoSlip(slip, analysis),
      analysis,
      liveDataAvailable: true,
      error: null,
    };
  } catch (error) {
    return {
      slip: mergeAnalysisIntoSlip(slip, {}),
      analysis: null,
      liveDataAvailable: false,
      error: error?.message || 'Live analysis unavailable.',
    };
  }
}

module.exports = { hydrateSharedSlip };
