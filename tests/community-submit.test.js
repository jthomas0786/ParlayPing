const test=require('node:test');
const assert=require('node:assert/strict');
const submit=require('../server/api/community-submit');

test('community submit accepts supported image data URLs within limit',()=>{
  assert.equal(submit.validImageDataUrl('data:image/jpeg;base64,QUJDRA=='),true);
  assert.equal(submit.validImageDataUrl('data:text/plain;base64,QUJDRA=='),false);
});

test('community submit only accepts X source URLs',()=>{
  assert.equal(submit.cleanSourceUrl('https://x.com/example/status/123'),'https://x.com/example/status/123');
  assert.equal(submit.cleanSourceUrl('https://twitter.com/example/status/123'),'https://twitter.com/example/status/123');
  assert.equal(submit.cleanSourceUrl('https://example.com/status/123'),null);
});

test('community submit requires every analyzed leg to be pending and future',()=>{
  const future=new Date(Date.now()+60*60*1000).toISOString();
  const good=submit.futurePending({results:[{status:'PENDING',startTimeUTC:future},{status:'PENDING',startTimeUTC:future}]},2);
  assert.equal(good.ok,true);
  const unresolved=submit.futurePending({results:[{status:'PENDING',startTimeUTC:future},{status:'UNRESOLVED',startTimeUTC:future}]},2);
  assert.equal(unresolved.ok,false);
  const missing=submit.futurePending({results:[{status:'PENDING',startTimeUTC:future}]},2);
  assert.equal(missing.ok,false);
});
