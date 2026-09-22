const test=require('node:test');
const assert=require('node:assert/strict');
const legacy=require('../api/lib/slip-parser');
const wrapper=require('../lib/slip-parser-wrapper');

async function withEnv(values,fn){
  const prior={};
  for(const [key,value] of Object.entries(values)){
    prior[key]=process.env[key];
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
  try{return await fn();}
  finally{
    for(const [key,value] of Object.entries(prior)){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
}

async function withFetch(mock,fn){
  const prior=global.fetch;global.fetch=mock;
  try{return await fn();}finally{global.fetch=prior;}
}

test('vision failure falls back to explicit parseable text without guessing from the image',async()=>{
  let calls=0,signal=null;
  const mockFetch=async(_url,options={})=>{calls+=1;signal=options.signal||null;throw new Error('vision provider unavailable');};
  await withFetch(mockFetch,async()=>withEnv({OPENAI_API_KEY:'test-key',OPENAI_TIMEOUT_MS:'5000'},async()=>{
    const result=await legacy.parseSlip({text:'Bijan Robinson Anytime TD',mediaUrls:['https://pbs.twimg.com/media/slip.jpg']});
    assert.equal(calls,1);
    assert.ok(signal,'OpenAI request should carry an abort signal');
    assert.equal(result.method,'vision-fallback');
    assert.match(result.visionError,/vision provider unavailable/);
    assert.equal(result.legs.length,1);
    assert.equal(result.legs[0].player,'Bijan Robinson');
    assert.equal(result.legs[0].market,'atd');
  }));
});

test('image-only vision failure returns no legs and wrapper does not issue a second OpenAI request',async()=>{
  let calls=0;
  const mockFetch=async()=>{calls+=1;throw new Error('vision provider unavailable');};
  await withFetch(mockFetch,async()=>withEnv({OPENAI_API_KEY:'test-key'},async()=>{
    const result=await wrapper.parseSlip({text:'',mediaUrls:['https://pbs.twimg.com/media/slip.jpg']});
    assert.equal(calls,1,'legacy vision failure must not be followed by supplemental vision retry');
    assert.equal(result.method,'vision-fallback');
    assert.match(result.visionError,/vision provider unavailable/);
    assert.equal(result.legs.length,0);
  }));
});

test('OpenAI timeout configuration is bounded to launch-safe limits',async()=>{
  await withEnv({OPENAI_TIMEOUT_MS:undefined},async()=>assert.equal(legacy.openAiTimeoutMs(),12000));
  await withEnv({OPENAI_TIMEOUT_MS:'100'},async()=>assert.equal(legacy.openAiTimeoutMs(),3000));
  await withEnv({OPENAI_TIMEOUT_MS:'5000'},async()=>assert.equal(legacy.openAiTimeoutMs(),5000));
  await withEnv({OPENAI_TIMEOUT_MS:'999999'},async()=>assert.equal(legacy.openAiTimeoutMs(),30000));
});
