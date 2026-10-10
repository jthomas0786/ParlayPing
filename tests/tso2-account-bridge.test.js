const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {requireHostUser}=require('../server/api/lib/tso-auth');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('TSO embed loads identity bridge before original Parlay Ping scripts',()=>{
  const render=read('render-server.js');
  const shell=read('tso2-shell.js');
  const bridge=read('tso2-account-bridge.js');
  assert.match(render,/src="\/tso2-account-bridge\.js\?v=20261010sso"/);
  assert.ok(render.indexOf('tso2-account-bridge.js')<render.indexOf('tso2-shell.js?v=20261010-inline'));
  assert.match(shell,/tso2-parlayping-open-profile/);
  assert.match(bridge,/allowedParents=new Set/);
  assert.match(bridge,/event\.source!==window\.parent/);
  assert.match(bridge,/allowedParents\.has\(event\.origin\)/);
  assert.match(bridge,/\/auth\/v1\/user/);
  assert.doesNotMatch(bridge,/localStorage\.setItem\(/);
  assert.doesNotMatch(bridge,/accessToken.*location\.assign/);
});

test('Embedded betslip tracking uses verified TSO session and independent per-user storage',()=>{
  const builder=read('builder-tracking.js');
  const profile=read('profile.js');
  const submit=read('submit-page.js');
  assert.match(builder,/tso\.requestSignIn\(\)/);
  assert.match(builder,/if\(tso\?\.enabled\)return tso\.sb/);
  assert.match(profile,/if\(tso\?\.enabled\)return tso\.sb/);
  assert.match(submit,/if\(tso\?\.enabled\)return tso\.sb/);
  assert.match(submit,/'x-parlayping-identity':'tso2'/);
  assert.match(profile,/'x-parlayping-identity':'tso2'/);
  assert.match(read('server/api/community-submit.js'),/requireHostUser\(req\)/);
  assert.match(read('server/api/tracking-refresh.js'),/requireHostUser\(req\)/);
});

test('TSO API authentication fails closed when token missing or invalid',async()=>{
  const old=global.fetch;
  const good='Bearer '+('a'.repeat(70));
  let sentUrl='',sentHeaders=null;
  global.fetch=async(url,options)=>{
    sentUrl=String(url);sentHeaders=options.headers;
    return new Response(JSON.stringify({id:'12345678-1234-1234-1234-123456789abc',email:'test@sample.invalid'}),{status:200});
  };
  try{
    await assert.rejects(()=>requireHostUser({headers:{'x-parlayping-identity':'tso2'}}),e=>e.status===401);
    const verified=await requireHostUser({headers:{'x-parlayping-identity':'tso2',authorization:good}});
    assert.equal(verified.user.id,'12345678-1234-1234-1234-123456789abc');
    assert.equal(verified.identityProvider,'tso2');
    assert.match(sentUrl,/hjhfbhpuuxnrexddplxd\.supabase\.co\/auth\/v1\/user/);
    assert.equal(sentHeaders.authorization,good);
    global.fetch=async()=>new Response('{}',{status:401});
    await assert.rejects(()=>requireHostUser({headers:{'x-parlayping-identity':'tso2',authorization:good}}),e=>e.status===401);
  }finally{global.fetch=old;}
});

test('TSO account is not fabricated from client-provided user IDs',()=>{
  const src=read('server/api/lib/tso-auth.js');
  assert.match(src,/user=await response\.json\(\)/);
  assert.doesNotMatch(src,/req\.body\.(?:userId|user_id|email)/);
  assert.doesNotMatch(src,/JSON\.parse\(.*Bearer/);
});
