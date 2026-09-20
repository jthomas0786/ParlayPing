const { parseSlip } = require('./lib/slip-parser');
const { analyzeSlip } = require('./lib/parlay-engine');

const X_API = 'https://api.x.com/2';
const X_USERNAME = process.env.X_USERNAME || 'ParlayPing';

function authHeaders() {
  const token = process.env.X_USER_ACCESS_TOKEN;
  if (!token) throw new Error('X_USER_ACCESS_TOKEN is not configured.');
  return { authorization: `Bearer ${token}` };
}

async function xGet(path) {
  const response = await fetch(`${X_API}${path}`, { headers: authHeaders() });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.detail || payload?.title || `X API GET failed (${response.status})`);
  return payload;
}

async function xPost(path, body) {
  const response = await fetch(`${X_API}${path}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'content-type':'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.detail || payload?.title || `X API POST failed (${response.status})`);
  return payload;
}

async function resolveBotUserId() {
  if (process.env.X_USER_ID) return String(process.env.X_USER_ID);
  const user = await xGet(`/users/by/username/${encodeURIComponent(X_USERNAME)}?user.fields=id,username`);
  const id = user?.data?.id;
  if (!id) throw new Error(`Unable to resolve @${X_USERNAME} user ID from X.`);
  return String(id);
}

function replyTarget(tweet) {
  return (tweet?.referenced_tweets || []).find(r => r.type === 'replied_to')?.id ||
    (tweet?.referenced_tweets || []).find(r => r.type === 'quoted')?.id || null;
}

function collectMediaUrls(tweet, mediaByKey) {
  const out = [];
  for (const key of tweet?.attachments?.media_keys || []) {
    const media = mediaByKey.get(key);
    const url = media?.url || media?.preview_image_url;
    if (url) out.push(url);
  }
  return out;
}

function compactLine(result) {
  const icon = result.status === 'HIT' ? '✅' : result.status === 'MISS' ? '❌' : result.status === 'LIVE' ? '🔴' : '⏳';
  const name = String(result.player || '').split(/\s+/).slice(-1)[0] || result.player;
  const progress = result.status === 'LIVE' ? ` ${result.current}/${result.target}` : '';
  const prob = ['LIVE','PENDING'].includes(result.status) && Number.isFinite(result.probability) ? ` · ${Math.round(result.probability * 100)}%` : '';
  return `${icon} ${name} ${result.displayMarket}${progress}${prob}`;
}

function buildXReply(analysis) {
  const c = analysis.counts || {};
  const rows = analysis.results.filter(r => r.status !== 'UNRESOLVED');
  const featured = [
    ...rows.filter(r => r.status === 'LIVE'),
    ...rows.filter(r => r.status === 'PENDING'),
    ...rows.filter(r => r.status === 'HIT'),
    ...rows.filter(r => r.status === 'MISS')
  ].slice(0, 3);
  const summary = `✅ ${c.hit || 0} hit · 🔴 ${c.live || 0} live · ⏳ ${c.pending || 0} left${c.miss ? ` · ❌ ${c.miss}` : ''}`;
  const remaining = Number.isFinite(analysis.combinedTailProbability) ? `\n🎯 Remaining model: ${Math.round(analysis.combinedTailProbability * 100)}%` : '';
  const link = analysis.tailUrl ? `\nTail what's left → ${analysis.tailUrl}` : '';
  let text = `🔔 PARLAYPING LIVE\n${summary}`;
  if (featured.length) text += `\n\n${featured.map(compactLine).join('\n')}`;
  text += remaining + link;
  if (text.length > 278) text = `🔔 PARLAYPING LIVE\n${summary}${remaining}${link}`;
  return text.slice(0, 280);
}

async function getContext(userId) {
  const q = new URLSearchParams({
    max_results: '20',
    'tweet.fields': 'author_id,attachments,created_at,conversation_id,possibly_sensitive,referenced_tweets,text',
    expansions: 'author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.attachments.media_keys',
    'media.fields': 'media_key,type,url,preview_image_url',
    'user.fields': 'username,name'
  });
  const mentions = await xGet(`/users/${userId}/mentions?${q}`);
  const own = await xGet(`/users/${userId}/tweets?max_results=100&tweet.fields=referenced_tweets,created_at`);
  const replied = new Set();
  for (const tweet of own.data || []) {
    for (const ref of tweet.referenced_tweets || []) if (ref.type === 'replied_to') replied.add(String(ref.id));
  }
  return { mentions, replied };
}

async function processMentions({ dryRun }) {
  const userId = await resolveBotUserId();
  const { mentions, replied } = await getContext(userId);
  const includesTweets = new Map((mentions.includes?.tweets || []).map(t => [String(t.id), t]));
  const mediaByKey = new Map((mentions.includes?.media || []).map(m => [String(m.media_key), m]));
  const candidates = [];

  for (const mention of [...(mentions.data || [])].reverse()) {
    if (replied.has(String(mention.id))) continue;
    if (mention.possibly_sensitive) continue;
    if (/\b(stop|unsubscribe|opt\s*out)\b/i.test(mention.text || '')) continue;
    const parentId = replyTarget(mention);
    if (!parentId) continue;
    const parent = includesTweets.get(String(parentId));
    if (!parent) continue;
    const mediaUrls = collectMediaUrls(parent, mediaByKey);
    const parsed = await parseSlip({ text: parent.text || '', mediaUrls });
    if (!parsed.legs.length) {
      candidates.push({ mentionId:mention.id, parentId, status:'unparsed', parser:parsed.method, mediaCount:mediaUrls.length });
      continue;
    }
    const analysis = await analyzeSlip(parsed.legs, { baseUrl: process.env.PUBLIC_BASE_URL || 'https://parlayping.net' });
    const replyText = buildXReply(analysis);
    const row = { mentionId:mention.id, parentId, status:'ready', parser:parsed.method, replyText, counts:analysis.counts, tailUrl:analysis.tailUrl };
    if (!dryRun) {
      const posted = await xPost('/tweets', { text: replyText, reply: { in_reply_to_tweet_id: String(mention.id) } });
      row.status = 'replied';
      row.replyId = posted?.data?.id || null;
    }
    candidates.push(row);
  }
  return candidates;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  try {
    const workerSecret = process.env.X_WORKER_SECRET;
    const supplied = req.headers['x-parlayping-secret'] || req.query?.secret;
    if (workerSecret && supplied !== workerSecret) return res.status(401).json({ ok:false, error:'Unauthorized.' });

    const approved = String(process.env.X_AI_REPLY_APPROVED || '').toLowerCase() === 'true';
    const enabled = String(process.env.X_AUTOREPLY_ENABLED || '').toLowerCase() === 'true';
    const dryRun = !(approved && enabled);
    const candidates = await processMentions({ dryRun });
    return res.status(200).json({ ok:true, dryRun, username:X_USERNAME, xApprovalRecorded:approved, autoReplyEnabled:enabled, processed:candidates.length, candidates });
  } catch (error) {
    console.error('ParlayPing X worker', error);
    return res.status(500).json({ ok:false, error:error?.message || 'X worker failed.' });
  }
};
