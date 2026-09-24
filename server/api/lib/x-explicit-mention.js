function escapeRegex(value){return String(value||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function mentionRegex(username){const handle=String(username||'').replace(/^@/,'').trim();return handle?new RegExp(`@${escapeRegex(handle)}\\b`,'i'):null;}
function leadingMentionHandles(text){
  const source=String(text||'').trimStart();
  const match=source.match(/^(?:@[A-Za-z0-9_]{1,15}\b(?:[,:])?\s*)+/);
  if(!match)return [];
  return [...match[0].matchAll(/@([A-Za-z0-9_]{1,15})\b/g)].map(row=>row[1]);
}
function leadingMentionBlockLength(text){
  const source=String(text||'').trimStart();
  return source.match(/^(?:@[A-Za-z0-9_]{1,15}\b(?:[,:])?\s*)+/)?.[0]?.length||0;
}
function visibleBodyText(text){
  const source=String(text||'').trimStart();
  return source.slice(leadingMentionBlockLength(source));
}
function hasVisibleBodyMention(text,username){
  const mentionRe=mentionRegex(username);if(!mentionRe)return false;
  return mentionRe.test(visibleBodyText(text));
}
function hasExplicitMention(text,username){
  const source=String(text||'').trimStart();
  const handle=String(username||'').replace(/^@/,'').trim();
  const mentionRe=mentionRegex(handle);
  if(!source||!handle||!mentionRe)return false;
  if(!mentionRe.test(source))return false;

  const prefixLength=leadingMentionBlockLength(source);
  if(!prefixLength)return true;

  if(mentionRe.test(source.slice(prefixLength)))return true;

  const leading=leadingMentionHandles(source);
  if(!leading.length)return true;

  // X can prepend hidden reply recipients to raw reply text. In a fresh
  // conversation, treating the final leading handle as user-added preserves
  // normal @ParlayPing summons. Once the bot has already participated in a
  // thread, x-worker applies a stricter conversation guard.
  return leading[leading.length-1].toLowerCase()===handle.toLowerCase();
}

module.exports={hasExplicitMention,hasVisibleBodyMention,visibleBodyText,leadingMentionHandles,leadingMentionBlockLength};
