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
