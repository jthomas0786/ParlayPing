const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/x-worker');

function makeRes(){
  return {
    statusCode:200,headers:{},payload:null,
    setHeader(k,v){this.headers[String(k).toLowerCase()]=v;},
    status(code){this.statusCode=code;return this;},
    json(payload){this.payload=payload;return this;}
  };
}

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

test('X worker remains safely idle unless both approval gates are true',async()=>{
  await withEnv({X_WORKER_SECRET:'test-secret',X_AI_REPLY_APPROVED:'false',X_AUTOREPLY_ENABLED:'false'},async()=>{
    const req={headers:{'x-parlayping-secret':'test-secret'}};
    const res=makeRes();
    await handler(req,res);
    assert.equal(res.statusCode,200);
    assert.equal(res.payload.ok,true);
    assert.equal(res.payload.active,false);
    assert.equal(res.payload.dryRun,true);
    assert.equal(res.payload.reason,'posting-gates-disabled');
    assert.equal(res.payload.processed,0);
    assert.deepEqual(res.payload.candidates,[]);
  });
});

test('one X approval gate alone is never enough to activate posting',async()=>{
  for(const [approved,enabled] of [['true','false'],['false','true']]){
    await withEnv({X_WORKER_SECRET:'test-secret',X_AI_REPLY_APPROVED:approved,X_AUTOREPLY_ENABLED:enabled},async()=>{
      const req={headers:{'x-parlayping-secret':'test-secret'}};
      const res=makeRes();
      await handler(req,res);
      assert.equal(res.payload.active,false);
      assert.equal(res.payload.reason,'posting-gates-disabled');
    });
  }
});

test('active X posting refuses to run without durable idempotency secret',async()=>{
  await withEnv({X_WORKER_SECRET:'test-secret',X_AI_REPLY_APPROVED:'true',X_AUTOREPLY_ENABLED:'true'},async()=>{
    const req={headers:{'x-parlayping-secret':'test-secret'}};
    const res=makeRes();
    await handler(req,res);
    assert.equal(res.statusCode,409);
    assert.equal(res.payload.ok,false);
    assert.equal(res.payload.active,false);
    assert.equal(res.payload.reason,'idempotency-secret-missing');
    assert.match(res.payload.error,/Durable idempotency/);
  });
});

test('X worker launch metadata advertises every staged analysis adapter while gates are off',async()=>{
  await withEnv({X_WORKER_SECRET:'test-secret',X_AI_REPLY_APPROVED:'false',X_AUTOREPLY_ENABLED:'false'},async()=>{
    const req={headers:{'x-parlayping-secret':'test-secret'}};
    const res=makeRes();
    await handler(req,res);
    const adapters=new Set(res.payload.analysisAdapters||[]);
    for(const sport of ['NFL','NCAAF','MLB','NHL','NBA','NCAAB','WNBA','SOCCER','TENNIS','MMA','ESPORTS','TABLE_TENNIS','VOLLEYBALL','CRICKET','RUGBY_LEAGUE','AFL','BOXING','GOLF']){
      assert.equal(adapters.has(sport),true,`${sport} missing from X worker adapter metadata`);
    }
  });
});

test('protected X auth probe verifies user context without enabling or posting',async()=>{
  const calls=[];
  const mockFetch=async(url,options={})=>{
    calls.push({url:String(url),method:options.method||'GET',body:options.body||null});
    return {ok:true,status:200,headers:{get(){return null;}},async text(){return JSON.stringify({data:{id:'12345',username:'ParlayPing',name:'ParlayPing'}});}};
  };
  await withFetch(mockFetch,async()=>withEnv({
    X_WORKER_SECRET:'test-secret',X_AI_REPLY_APPROVED:'false',X_AUTOREPLY_ENABLED:'false',
    X_API_KEY:'key',X_API_SECRET:'secret',X_ACCESS_TOKEN:'token',X_ACCESS_TOKEN_SECRET:'token-secret',X_USERNAME:'ParlayPing'
  },async()=>{
    const req={headers:{'x-parlayping-secret':'test-secret'},query:{probe:'auth'}};
    const res=makeRes();
    await handler(req,res);
    assert.equal(res.statusCode,200);
    assert.equal(res.payload.ok,true);
    assert.equal(res.payload.probe,'auth');
    assert.equal(res.payload.probeOnly,true);
    assert.equal(res.payload.xAuthReady,true);
    assert.equal(res.payload.postingActive,false);
    assert.equal(res.payload.xApprovalRecorded,false);
    assert.equal(res.payload.autoReplyEnabled,false);
    assert.equal(calls.length,1);
    assert.equal(calls[0].method,'GET');
    assert.match(calls[0].url,/\/2\/users\/me\?/);
    assert.equal(calls[0].body,null);
  }));
});

test('X auth probe refuses credentials for the wrong account',async()=>{
  const mockFetch=async()=>({ok:true,status:200,headers:{get(){return null;}},async text(){return JSON.stringify({data:{id:'999',username:'SomeoneElse',name:'Wrong'}});}});
  await withFetch(mockFetch,async()=>withEnv({
    X_WORKER_SECRET:'test-secret',X_API_KEY:'key',X_API_SECRET:'secret',X_ACCESS_TOKEN:'token',X_ACCESS_TOKEN_SECRET:'token-secret',X_USERNAME:'ParlayPing'
  },async()=>{
    const req={headers:{'x-parlayping-secret':'test-secret'},query:{probe:'auth'}};
    const res=makeRes();
    await handler(req,res);
    assert.equal(res.statusCode,500);
    assert.equal(res.payload.ok,false);
    assert.match(res.payload.error,/not @ParlayPing/);
  }));
});

test('direct X mention with no parent is actionable unless it is sensitive, already replied, or opted out',()=>{
  const mention={id:'m1',text:'@ParlayPing check this slip',possibly_sensitive:false};
  assert.equal(handler.isActionableMention(mention,new Set()),true);
  assert.equal(handler.isActionableMention({...mention,possibly_sensitive:true},new Set()),false);
  assert.equal(handler.isActionableMention({...mention,text:'@ParlayPing STOP'},new Set()),false);
  assert.equal(handler.isActionableMention(mention,new Set(['m1'])),false);
});

test('direct X mention input carries its own screenshot and timestamp into parsing',()=>{
  const mention={id:'m1',text:'@ParlayPing check this slip',created_at:'2026-09-20T20:00:00Z',attachments:{media_keys:['a']}};
  const media=new Map([['a',{media_key:'a',url:'https://pbs.twimg.com/media/direct.jpg'}]]);
  const input=handler.buildMentionInput(mention,null,media);
  assert.equal(input.sourceMode,'direct-mention');
  assert.equal(input.referenceTime,'2026-09-20T20:00:00Z');
  assert.equal(input.text,'@ParlayPing check this slip');
  assert.deepEqual(input.mediaUrls,['https://pbs.twimg.com/media/direct.jpg']);
});

test('reply mention input merges parent and mention screenshots without duplicate media',()=>{
  const parent={id:'p1',text:'NFL slip',created_at:'2026-09-20T19:55:00Z',attachments:{media_keys:['a','b','c']}};
  const mention={id:'m1',text:'@ParlayPing how is this looking?',created_at:'2026-09-20T20:00:00Z',attachments:{media_keys:['c','d','e']}};
  const media=new Map([
    ['a',{url:'https://pbs.twimg.com/media/a.jpg'}],['b',{url:'https://pbs.twimg.com/media/b.jpg'}],
    ['c',{url:'https://pbs.twimg.com/media/c.jpg'}],['d',{url:'https://pbs.twimg.com/media/d.jpg'}],
    ['e',{url:'https://pbs.twimg.com/media/e.jpg'}]
  ]);
  const input=handler.buildMentionInput(mention,parent,media);
  assert.equal(input.sourceMode,'parent-plus-mention');
  assert.equal(input.referenceTime,'2026-09-20T19:55:00Z');
  assert.equal(input.text,'NFL slip\n@ParlayPing how is this looking?');
  assert.deepEqual(input.mediaUrls,[
    'https://pbs.twimg.com/media/a.jpg','https://pbs.twimg.com/media/b.jpg',
    'https://pbs.twimg.com/media/c.jpg','https://pbs.twimg.com/media/d.jpg'
  ]);
});
