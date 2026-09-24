const test=require('node:test');
const assert=require('node:assert/strict');
const worker=require('../server/api/x-worker');

const BOT='999';
const replied=new Set();
function tweet(overrides={}){
  return {
    id:'m1',
    author_id:'123',
    conversation_id:'conv-1',
    text:'@justcallmejt_ @Playbook @ParlayPing analyze this',
    referenced_tweets:[{type:'replied_to',id:'parent-1'}],
    ...overrides,
  };
}

test('blocks inherited ParlayPing in a conversation where the bot already participated',()=>{
  const mention=tweet();
  const parent={id:'parent-1',author_id:'456'};
  const botConversations=new Set(['conv-1']);
  assert.equal(worker.isActionableMention(mention,replied,BOT,{parent,botConversations}),false);
});

test('blocks inherited ParlayPing even when X places it last in the leading recipient block',()=>{
  const mention=tweet({text:'@justcallmejt_ @Playbook @ParlayPing looks good'});
  const parent={id:'parent-1',author_id:'456'};
  const botConversations=new Set(['conv-1']);
  assert.equal(worker.isActionableMention(mention,replied,BOT,{parent,botConversations}),false);
});

test('allows a visible body summon inside an active bot conversation',()=>{
  const mention=tweet({text:'@justcallmejt_ @Playbook hey @ParlayPing check this'});
  const parent={id:'parent-1',author_id:'456'};
  const botConversations=new Set(['conv-1']);
  assert.equal(worker.isActionableMention(mention,replied,BOT,{parent,botConversations}),true);
});

test('allows a direct reply to a ParlayPing-authored parent',()=>{
  const mention=tweet({text:'@ParlayPing thanks'});
  const parent={id:'parent-1',author_id:BOT};
  const botConversations=new Set(['conv-1']);
  assert.equal(worker.isActionableMention(mention,replied,BOT,{parent,botConversations}),true);
});

test('keeps fresh-thread explicit ParlayPing replies actionable',()=>{
  const mention=tweet({conversation_id:'fresh-conv',text:'@justcallmejt_ @ParlayPing check this'});
  const parent={id:'parent-1',author_id:'456'};
  const botConversations=new Set();
  assert.equal(worker.isActionableMention(mention,replied,BOT,{parent,botConversations}),true);
});
