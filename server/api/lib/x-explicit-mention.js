function escapeRegex(value){return String(value||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
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
function hasExplicitMention(text,username){
  const source=String(text||'').trimStart();
  const handle=String(username||'').replace(/^@/,'').trim();
  if(!source||!handle)return false;
  const mentionRe=new RegExp(`@${escapeRegex(handle)}\\b`,'i');
  if(!mentionRe.test(source))return false;

  const prefixLength=leadingMentionBlockLength(source);
  if(!prefixLength)return true;

  const visibleBody=source.slice(prefixLength);
  if(mentionRe.test(visibleBody))return true;

  const leading=leadingMentionHandles(source);
  if(!leading.length)return true;

  // X can prepend hidden reply recipients to raw reply text. The handle the
  // user actually adds to the reply composer is the final leading mention.
  // Requiring ParlayPing to be that final leading handle prevents inherited
  // conversation participants from re-triggering the bot when someone only
  // tags another account such as @Playbook.
  return leading[leading.length-1].toLowerCase()===handle.toLowerCase();
}

module.exports={hasExplicitMention,leadingMentionHandles,leadingMentionBlockLength};
