const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/x-worker');

test('recognized reply commands are kept out of the source slip parser text',()=>{
  const parent={id:'p1',text:'Tucker Kraft over 44.5 receiving yards',created_at:'2026-09-25T12:00:00Z',attachments:{media_keys:['a']}};
  const mention={id:'m1',text:'@ParlayPing water down by 2',created_at:'2026-09-25T12:01:00Z',attachments:{media_keys:['b']}};
  const media=new Map([
    ['a',{url:'https://pbs.twimg.com/media/parent.jpg'}],
    ['b',{url:'https://pbs.twimg.com/media/reply.jpg'}]
  ]);
  const input=handler.buildMentionInput(mention,parent,media);
  assert.equal(input.command.recognized,true);
  assert.equal(input.command.commandText,'water down by 2');
  assert.equal(input.text,parent.text);
  assert.deepEqual(input.mediaUrls,['https://pbs.twimg.com/media/parent.jpg','https://pbs.twimg.com/media/reply.jpg']);
});

test('non-command replies preserve the existing parent-plus-mention parsing behavior',()=>{
  const parent={id:'p1',text:'NFL slip',created_at:'2026-09-25T12:00:00Z'};
  const mention={id:'m1',text:'@ParlayPing how is this looking?',created_at:'2026-09-25T12:01:00Z'};
  const input=handler.buildMentionInput(mention,parent,new Map());
  assert.equal(input.command.recognized,false);
  assert.equal(input.text,'NFL slip\n@ParlayPing how is this looking?');
});

test('direct screenshot commands leave command words out of OCR/vision slip text',()=>{
  const mention={id:'m1',text:'@ParlayPing just the rushing yards',created_at:'2026-09-25T12:01:00Z',attachments:{media_keys:['a']}};
  const media=new Map([['a',{url:'https://pbs.twimg.com/media/slip.jpg'}]]);
  const input=handler.buildMentionInput(mention,null,media);
  assert.equal(input.command.recognized,true);
  assert.equal(input.text,'');
  assert.deepEqual(input.mediaUrls,['https://pbs.twimg.com/media/slip.jpg']);
});
