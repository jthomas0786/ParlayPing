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
