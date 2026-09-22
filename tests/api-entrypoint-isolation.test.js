const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');

test('consolidated API entrypoint does not eagerly load route handlers',()=>{
  const originalLoad=Module._load;
  const loaded=[];
  try{
    Module._load=function(request,parent,isMain){
      if(String(request).includes('server/api/'))loaded.push(String(request));
      return originalLoad.apply(this,arguments);
    };
    delete require.cache[require.resolve('../api/index')];
    require('../api/index');
  }finally{
    Module._load=originalLoad;
  }
  assert.deepEqual(loaded,[],'api/index must lazy-load only the requested route');
});
