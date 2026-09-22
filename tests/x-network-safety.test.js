const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/x-worker');

function makeRes(){return{statusCode:200,payload:null,headers:{},setHeader(k,v){this.headers[String(k).toLowerCase()]=v;},status(code){this.statusCode=code;return this;},json(payload){this.payload=payload;return this;}};}
async function withEnv(values,fn){const prior={};for(const [k,v] of Object.entries(values)){prior[k]=process.env[k];if(v===undefined)delete process.env[k];else process.env[k]=v;}try{return await fn();}finally{for(const [k,v] of Object.entries(prior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}}
async function withFetch(mock,fn){const prior=global.fetch;global.fetch=mock;try{return await fn();}finally{global.fetch=prior;}}

const authEnv={X_WORKER_SECRET:'test-secret',X_API_KEY:'key',X_API_SECRET:'secret',X_ACCESS_TOKEN:'token',X_ACCESS_TOKEN_SECRET:'token-secret',X_USERNAME:'ParlayPing'};

test('X request timeout is bounded to launch-safe limits',async()=>{
  await withEnv({X_REQUEST_TIMEOUT_MS:undefined},async()=>assert.equal(handler.xTimeoutMs(),12000));
  await withEnv({X_REQUEST_TIMEOUT_MS:'100'},async()=>assert.equal(handler.xTimeoutMs(),3000));
  await withEnv({X_REQUEST_TIMEOUT_MS:'7000'},async()=>assert.equal(handler.xTimeoutMs(),7000));
  await withEnv({X_REQUEST_TIMEOUT_MS:'999999'},async()=>assert.equal(handler.xTimeoutMs(),30000));
});

test('X auth request carries an abort signal and never posts',async()=>{
  const calls=[];
  const mockFetch=async(url,options={})=>{
    calls.push({url:String(url),method:options.method,signal:options.signal,body:options.body});
    return{ok:true,status:200,headers:{get(){return null;}},async text(){return JSON.stringify({data:{id:'123',username:'ParlayPing'}});}};
  };
  await withFetch(mockFetch,async()=>withEnv(authEnv,async()=>{
    const res=makeRes();await handler({headers:{'x-parlayping-secret':'test-secret'},query:{probe:'auth'}},res);
    assert.equal(res.statusCode,200);
    assert.equal(calls.length,1);
    assert.equal(calls[0].method,'GET');
    assert.ok(calls[0].signal,'X request should have a timeout signal');
    assert.equal(calls[0].body,undefined);
  }));
});

test('X 429 is surfaced with Retry-After and does not trigger an in-run retry',async()=>{
  let calls=0;
  const mockFetch=async()=>{calls+=1;return{ok:false,status:429,headers:{get(name){return String(name).toLowerCase()==='retry-after'?'120':null;}},async text(){return JSON.stringify({detail:'Too Many Requests'});}};};
  await withFetch(mockFetch,async()=>withEnv(authEnv,async()=>{
    const res=makeRes();await handler({headers:{'x-parlayping-secret':'test-secret'},query:{probe:'auth'}},res);
    assert.equal(calls,1,'worker must not retry a rate-limited X call inside the same run');
    assert.equal(res.statusCode,429);
    assert.equal(res.payload.ok,false);
    assert.equal(res.payload.retryAfter,'120');
  }));
});
