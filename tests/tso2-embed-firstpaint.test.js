const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const root=join(__dirname,'..');
const server=readFileSync(join(root,'render-server.js'),'utf8');
const nav=readFileSync(join(root,'app-nav.js'),'utf8');
const shell=readFileSync(join(root,'tso2-shell.js'),'utf8');
const submit=readFileSync(join(root,'tso2-submit-broadcast.css'),'utf8');
const profile=readFileSync(join(root,'tso2-profile-broadcast.css'),'utf8');

test('Server delivers TSO 2.0 embed HTML marker and theme CSS before first paint',()=>{
  assert.match(server,/function isTsoEmbedRequest\(req,url\)/);
  assert.match(server,/url\.searchParams\.get\('tso_embed'\)==='1'/);
  assert.match(server,/function applyTsoEmbeddedHtml\(source,req,url\)/);
  assert.match(server,/data-tso2pp-embed="true"/);
  assert.match(server,/tso2-submit-broadcast\.css\?v=20261012-native/);
  assert.match(server,/tso2-profile-broadcast\.css\?v=20261012-native/);
  assert.match(server,/return res\.end\(applyTsoEmbeddedHtml\(page,req,url\)\)/);
  assert.match(server,/chunk = applyTsoEmbeddedHtml\(page,req,url\)/);
});

test('Standalone parlayping.net pages remain independent when not embedded',()=>{
  assert.match(server,/if\(!isTsoEmbedRequest\(req,url\)\)return page;/);
  assert.match(nav,/function insideTsoHost\(\)/);
  assert.match(nav,/if\(window\.self===window\.top\)return false/);
  assert.match(nav,/if\(insideTsoHost\(\)\)/);
});

test('Embedded renderer uses parent navigation and only the TSO functional tools',()=>{
  assert.match(shell,/document\.documentElement\.hasAttribute\('data-tso2pp-embed'\)/);
  assert.match(shell,/if\(inTsoWorkspace\)/);
  assert.match(shell,/postMessage\(\{type:'tso2-parlayping-size'/);
  assert.match(submit,/\.submit-hero\{display:none!important\}/);
  assert.match(profile,/\.profile-cover\{display:none!important\}/);
  assert.match(profile,/\.profile-tabs,/);
});
