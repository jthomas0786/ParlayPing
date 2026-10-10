const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('TSO 2.0 upload theme is loaded only for embedded submit pages',()=>{
  const shell=source('tso2-shell.js');
  const submit=source('submit.html');
  assert.match(shell,/if\(inTsoWorkspace\)/);
  assert.match(shell,/location\.pathname==='\/submit'/);
  assert.match(shell,/tso2-submit-embed\.css\?v=/);
  assert.doesNotMatch(submit,/tso2-submit-embed\.css/);
});

test('native Outpost blue/navy palette and compact layout replace old teal marketing only in iframe',()=>{
  const css=source('tso2-submit-embed.css');
  for(const color of ['#070b12','#0c121d','#101824','#2d7fff','#f5f8fc'])assert.ok(css.includes(color),color);
  for(const name of ['.submit-page','.submit-hero h1','.submit-shell','.submit-form-card','.submit-explainer','.dropzone','.verify-button','.account-state'])assert.ok(css.includes(name),name);
  assert.match(css,/\.founding-card\{display:none!important\}/);
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/@media\(max-width:520px\)/);
  assert.match(css,/html\[data-tso2pp-embed\]/);
});

test('functional submit/upload and existing stand-alone experience are preserved',()=>{
  const submit=source('submit-page.js');
  const growth=source('submit-growth.js');
  assert.match(submit,/const tso=window\.PP_TSO_AUTH/);
  assert.match(submit,/if\(tso\?\.enabled\)/);
  assert.match(submit,/const headline=document\.querySelector\('\.submit-hero h1'\)/);
  assert.match(submit,/Upload a screenshot/);
  assert.match(submit,/addEventListener\('click',submit\)/);
  assert.match(submit,/saveCommunity\(result\)/);
  assert.match(growth,/if\(window\.PP_TSO_AUTH\?\.enabled\)return/);
  assert.match(source('submit.html'),/id="betImage"/);
  assert.match(source('submit.html'),/id="verifyButton"/);
});
