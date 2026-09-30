const test=require('node:test');
const assert=require('node:assert/strict');
const worker=require('../server/api/x-worker');

function mention(overrides={}){
  return {
    id:'mention-1',
    author_id:'user-1',
    text:'@ParlayPing check this slip',
    possibly_sensitive:false,
    conversation_id:'conversation-1',
    referenced_tweets:[],
    ...overrides
  };
}

test('production mention gate accepts direct and quote mentions with bot user id',()=>{
  const botUserId='bot-1';
  assert.equal(worker.isActionableMention(mention(),new Set(),botUserId),true);
  assert.equal(worker.isActionableMention(mention({id:'mention-2',referenced_tweets:[{type:'quoted',id:'tweet-1'}]}),new Set(),botUserId),true);
});

test('production mention gate keeps core safety protections',()=>{
  const botUserId='bot-1';
  assert.equal(worker.isActionableMention(mention({author_id:botUserId}),new Set(),botUserId),false);
  assert.equal(worker.isActionableMention(mention({text:'check this slip'}),new Set(),botUserId),false);
  assert.equal(worker.isActionableMention(mention({id:'mention-3'}),new Set(['mention-3']),botUserId),false);
  assert.equal(worker.isActionableMention(mention({possibly_sensitive:true}),new Set(),botUserId),false);
});
