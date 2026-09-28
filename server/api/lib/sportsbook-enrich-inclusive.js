const base = require('./sportsbook-enrich');

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function norm(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[.'’]/g,'').replace(/\b(jr|sr|ii|iii|iv|v)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}

function sportsbookEquivalentLeg(leg = {}) {
  const line = finite(leg.line);
  if (line == null || leg.inclusive !== true || !Number.isInteger(line)) return { ...leg };
  const side = String(leg.side || 'over').toLowerCase();
  if (side === 'over') return { ...leg, line: line - 0.5, inclusive: false };
  if (side === 'under') return { ...leg, line: line + 0.5, inclusive: false };
  return { ...leg };
}

function nativeFieldsFromLink(link, sid) {
  let selectionId = sid == null ? null : String(sid);
  let marketId = null;
  if (typeof link === 'string' && /^https:\/\//i.test(link)) {
    try {
      const url = new URL(link);
      selectionId = selectionId || url.searchParams.get('selectionId') || url.searchParams.get('selection_id') || null;
      marketId = url.searchParams.get('marketId') || url.searchParams.get('market_id') || null;
    } catch {}
  }
  return { selectionId, marketId };
}

function binaryMarket(market) {
  return ['atd','atg','hr','firstTd','pitcherWin'].includes(String(market || ''));
}

async function applyPrimaryNativeMetadata(leg, lookupLeg) {
  const doc = await base.loadSnapshot(lookupLeg?.sport);
  const rows = Array.isArray(doc?.rows) ? doc.rows : [];
  if (!rows.length) return leg;
  const wantedPlayer = norm(lookupLeg?.player);
  const wantedMarket = base.marketKey(lookupLeg);
  const side = ['under','no'].includes(String(lookupLeg?.side || 'over').toLowerCase()) ? 'under' : 'over';
  const offers = { ...(leg?.bookOffers || {}) };
  const alts = { ...(leg?.altLinesByBook || {}) };
  const candidates = rows.filter(row => {
    if (norm(row?.player) !== wantedPlayer) return false;
    if (base.marketKey({ market:row?.market || row?.marketKey }) !== wantedMarket) return false;
    if (!base.sameEvent(row, lookupLeg)) return false;
    if (binaryMarket(wantedMarket) && side === 'over') {
      const wanted = finite(lookupLeg?.line);
      return wanted == null || Math.abs(wanted - 0.5) < 1e-7;
    }
    return base.lineMatchesLeg(row?.line, lookupLeg);
  });
  for (const [bookName, offer] of Object.entries(offers)) {
    if (!offer || typeof offer !== 'object') continue;
    const price = finite(offer.oddsAmerican);
    const matches = candidates.filter(row => base.normBook(row?.book || row?.sportsbook) === bookName);
    const row = matches.find(candidate => finite(side === 'under' ? candidate?.underPrice : candidate?.overPrice) === price) || matches[0];
    if (!row) continue;
    const link = row?.[`${side}Link`] || row?.selectionLink || row?.deepLink || null;
    const sid = row?.[`${side}Sid`] || row?.selectionId || null;
    const native = nativeFieldsFromLink(link, sid);
    offers[bookName] = {
      ...offer,
      selectionLink: offer.selectionLink || link || null,
      selectionId: offer.selectionId || native.selectionId || null,
      marketId: offer.marketId || native.marketId || null,
      priceKind: offer.priceKind || row?.priceKind || (row?.preserved ? 'last-verified-pregame' : 'verified-snapshot'),
    };
    if (Array.isArray(alts[bookName])) {
      alts[bookName] = alts[bookName].map(alt => {
        if (finite(alt?.line) !== finite(row?.line) || (price != null && finite(alt?.oddsAmerican) !== price)) return alt;
        return { ...alt, selectionLink:alt.selectionLink || link || null, selectionId:alt.selectionId || native.selectionId || null, marketId:alt.marketId || native.marketId || null };
      });
    }
  }
  return { ...leg, bookOffers:offers, altLinesByBook:alts };
}

async function enrichSportsbookMarkets(slip = {}) {
  const originalLegs = Array.isArray(slip.legs) ? slip.legs : [];
  const lookupLegs = originalLegs.map(sportsbookEquivalentLeg);
  const enriched = await base.enrichSportsbookMarkets({ ...slip, legs: lookupLegs });
  const enrichedLegs = Array.isArray(enriched?.legs) ? enriched.legs : lookupLegs;
  const withNativeMetadata = await Promise.all(enrichedLegs.map((leg,index)=>applyPrimaryNativeMetadata(leg,lookupLegs[index]||{})));
  return {
    ...enriched,
    legs: withNativeMetadata.map((leg, index) => {
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
  applyPrimaryNativeMetadata,
  nativeFieldsFromLink,
};
