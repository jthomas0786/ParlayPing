const { canonicalSlip, mergeAnalysisIntoSlip, encodeShareSlip, buildCardUrl } = require('./share-slip');
const { buildPublicReply } = require('./analysis-safety');

const X_SHARE_CARD_VERSION = '20260923b';

function hasUnresolved(analysis) {
  return (Array.isArray(analysis?.results) ? analysis.results : []).some(row => row?.status === 'UNRESOLVED');
}

function builderUrl(token, baseUrl) {
  const root = String(baseUrl || process.env.PUBLIC_BASE_URL || 'https://parlayping.net').replace(/\/$/, '');
  return `${root}/build/${encodeURIComponent(token)}`;
}

function buildXShareBundle({ parsedLegs, analysis, sourceReference, baseUrl, maxReplyLegs = 3 } = {}) {
  if (!Array.isArray(parsedLegs) || !parsedLegs.length) {
    return { ready: false, reason: 'no-parsed-legs', shareUrl: null, cardUrl: null, xReplyCardUrl: null, replyText: null };
  }
  if (!analysis || !Array.isArray(analysis.results) || !analysis.results.length) {
    return { ready: false, reason: 'no-analysis-results', shareUrl: null, cardUrl: null, xReplyCardUrl: null, replyText: null };
  }
  if (hasUnresolved(analysis)) {
    return { ready: false, reason: 'unresolved-legs', shareUrl: null, cardUrl: null, xReplyCardUrl: null, replyText: null };
  }

  const saved = canonicalSlip({
    source: 'X @ParlayPing',
    sourceReference: sourceReference || null,
    legs: parsedLegs,
  });
  const hydrated = mergeAnalysisIntoSlip(saved, analysis);
  const token = encodeShareSlip(hydrated);
  const shareUrl = builderUrl(token, baseUrl);
  const cardUrl = buildCardUrl(token, baseUrl);
  const xReplyCardUrl = `${cardUrl}?context=x_reply&v=${X_SHARE_CARD_VERSION}`;

  const baseReply = buildPublicReply({ ...analysis, tailUrl: shareUrl }, { maxLegs: maxReplyLegs });
  const replyText = baseReply
    ? baseReply.replace("Tail what's left →", 'Open betslip →')
    : null;

  return {
    ready: Boolean(replyText),
    reason: replyText ? null : 'reply-not-ready',
    token,
    slip: hydrated,
    shareUrl,
    cardUrl,
    xReplyCardUrl,
    replyText,
  };
}

function tryBuildXShareBundle(input) {
  try {
    return buildXShareBundle(input);
  } catch (error) {
    return {
      ready: false,
      reason: 'share-bundle-unavailable',
      error: error?.message || 'Unable to create shared slip.',
      shareUrl: null,
      cardUrl: null,
      xReplyCardUrl: null,
      replyText: null,
    };
  }
}

module.exports = { buildXShareBundle, tryBuildXShareBundle, hasUnresolved, builderUrl, X_SHARE_CARD_VERSION };
