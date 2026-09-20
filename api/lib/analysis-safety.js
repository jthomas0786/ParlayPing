function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function correlationGroups(results) {
  const pending = (Array.isArray(results) ? results : []).filter(r => r && r.status === 'PENDING');
  const groups = [];

  const byGame = new Map();
  for (const row of pending) {
    const key = row.gameId ? String(row.gameId) : null;
    if (!key) continue;
    if (!byGame.has(key)) byGame.set(key, []);
    byGame.get(key).push(row);
  }

  for (const [gameId, rows] of byGame.entries()) {
    if (rows.length < 2) continue;
    const samePlayer = new Map();
    for (const row of rows) {
      const player = norm(row.player);
      if (!samePlayer.has(player)) samePlayer.set(player, []);
      samePlayer.get(player).push(row);
    }
    const repeatedPlayers = [...samePlayer.entries()]
      .filter(([, playerRows]) => playerRows.length > 1)
      .map(([player]) => player)
      .filter(Boolean);

    groups.push({
      gameId,
      legIds: rows.map(r => r.id).filter(Boolean),
      players: [...new Set(rows.map(r => r.player).filter(Boolean))],
      repeatedPlayers,
      type: repeatedPlayers.length ? 'same-player-same-game' : 'same-game'
    });
  }

  return groups;
}

function applyCorrelationSafety(analysis) {
  if (!analysis || typeof analysis !== 'object') return analysis;
  const groups = correlationGroups(analysis.results);
  const hasCorrelationRisk = groups.length > 0;
  const next = { ...analysis };

  next.correlation = {
    hasRisk: hasCorrelationRisk,
    groups,
    note: hasCorrelationRisk
      ? 'Combined probability is withheld because two or more remaining legs share a game and may be correlated.'
      : 'No same-game correlation was detected among remaining legs.'
  };

  if (hasCorrelationRisk) {
    next.combinedTailProbability = null;
    next.combinedTailProbabilityPct = null;
    next.combinedTailProbabilityMethod = 'withheld-correlated-legs';
  } else if (Number.isFinite(analysis.combinedTailProbability)) {
    next.combinedTailProbabilityMethod = 'independence-product-distinct-games';
  } else {
    next.combinedTailProbabilityMethod = null;
  }

  return next;
}

function replyReadiness(analysis) {
  const results = Array.isArray(analysis?.results) ? analysis.results : [];
  const unresolved = results.filter(r => r?.status === 'UNRESOLVED');
  const resolved = results.filter(r => r && r.status !== 'UNRESOLVED');

  if (!results.length) {
    return { ready: false, reason: 'no-analysis-results', unresolvedCount: 0, resolvedCount: 0 };
  }
  if (unresolved.length) {
    return {
      ready: false,
      reason: 'unresolved-legs',
      unresolvedCount: unresolved.length,
      resolvedCount: resolved.length
    };
  }
  if (!resolved.length) {
    return { ready: false, reason: 'no-resolved-legs', unresolvedCount: 0, resolvedCount: 0 };
  }
  return { ready: true, reason: null, unresolvedCount: 0, resolvedCount: resolved.length };
}

function buildPublicReply(analysis, options = {}) {
  const readiness = replyReadiness(analysis);
  if (!readiness.ready) return null;

  const rows = (analysis?.results || []).filter(r => r?.status !== 'UNRESOLVED');
  const counts = analysis?.counts || {};
  const maxLegs = Math.max(1, Number(options.maxLegs) || 3);
  const ordered = [
    ...rows.filter(r => r.status === 'LIVE'),
    ...rows.filter(r => r.status === 'PENDING'),
    ...rows.filter(r => r.status === 'HIT'),
    ...rows.filter(r => r.status === 'MISS')
  ].slice(0, maxLegs);

  const compact = row => {
    const icon = row.status === 'HIT' ? '✅' : row.status === 'MISS' ? '❌' : row.status === 'LIVE' ? '🔴' : '⏳';
    const lastName = String(row.player || '').trim().split(/\s+/).slice(-1)[0] || row.player || 'Leg';
    const progress = row.status === 'LIVE' ? ` ${row.current}/${row.target}` : '';
    const prob = ['LIVE', 'PENDING'].includes(row.status) && Number.isFinite(row.probability)
      ? ` · ${Math.round(row.probability * 100)}%`
      : '';
    return `${icon} ${lastName} ${row.displayMarket || ''}${progress}${prob}`.trim();
  };

  const summary = `✅ ${counts.hit || 0} hit · 🔴 ${counts.live || 0} live · ⏳ ${counts.pending || 0} left${counts.miss ? ` · ❌ ${counts.miss}` : ''}`;
  const lines = ['🔔 PARLAYPING LIVE', summary];
  if (ordered.length) lines.push('', ...ordered.map(compact));

  if (analysis?.correlation?.hasRisk) {
    lines.push('', '🎯 Combined model withheld — remaining legs are correlated.');
  } else if (Number.isFinite(analysis?.combinedTailProbability)) {
    lines.push('', `🎯 Remaining model: ${Math.round(analysis.combinedTailProbability * 100)}%`);
  }

  if (analysis?.tailUrl) lines.push(`Tail what's left → ${analysis.tailUrl}`);
  let text = lines.join('\n');
  if (text.length > 280) {
    const shorter = ['🔔 PARLAYPING LIVE', summary];
    if (analysis?.correlation?.hasRisk) shorter.push('🎯 Combined model withheld — correlated legs.');
    else if (Number.isFinite(analysis?.combinedTailProbability)) shorter.push(`🎯 Remaining model: ${Math.round(analysis.combinedTailProbability * 100)}%`);
    if (analysis?.tailUrl) shorter.push(`Tail what's left → ${analysis.tailUrl}`);
    text = shorter.join('\n');
  }
  return text.slice(0, 280);
}

module.exports = { correlationGroups, applyCorrelationSafety, replyReadiness, buildPublicReply };
