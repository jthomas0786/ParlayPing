const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/x-worker');

const BOT_ID='2086624322316120064';
function mention(overrides={}){
  return {
    id:'m1',
    author_id:'user-1',
    text:'@ParlayPing',
    possibly_sensitive:false,
    referenced_tweets:[{id:'parent-1',type:'replied_to'}],
    ...overrides,
  };
}

test('production X gate only accepts explicit current @ParlayPing reply mentions from another user',()=>{
  assert.equal(handler.isActionableMention(mention(),new Set(),BOT_ID),true);
  assert.equal(handler.isActionableMention(mention({text:'@Sports_Outpost check this'}),new Set(),BOT_ID),false);
  assert.equal(handler.isActionableMention(mention({text:'@DingerWatch check this'}),new Set(),BOT_ID),false);
  assert.equal(handler.isActionableMention(mention({author_id:BOT_ID}),new Set(),BOT_ID),false);
  assert.equal(handler.isActionableMention(mention({referenced_tweets:[]}),new Set(),BOT_ID),false);
  assert.equal(handler.isActionableMention(mention({referenced_tweets:[{id:'q1',type:'quoted'}]}),new Set(),BOT_ID),false);
});

test('current-handle gate keeps existing sensitivity, opt-out, and duplicate protections',()=>{
  assert.equal(handler.isActionableMention(mention({possibly_sensitive:true}),new Set(),BOT_ID),false);
  assert.equal(handler.isActionableMention(mention({text:'@ParlayPing STOP'}),new Set(),BOT_ID),false);
  assert.equal(handler.isActionableMention(mention(),new Set(['m1']),BOT_ID),false);
});
