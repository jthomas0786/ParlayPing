const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('Render serves in-TSO route controller on static and dynamically created betslips',()=>{
 const server=read('render-server.js');
 assert.match(server,/file\.ext === '\.html'/);
 assert.match(server,/src="\/tso2-shell\.js\?v=20261010-theme2"/);
 assert.match(server,/\/text\\\/html\/i\.test\(contentType\)/);
 assert.match(server,/html.*?tso2-shell\.js/s);
});
test('embedded Parlay Ping keeps internal links, popup and forms in the TSO tab',()=>{
 const shell=read('tso2-shell.js');
 assert.match(shell,/const inFrame=window\.self!==window\.top/);
 assert.match(shell,/sessionStorage\.setItem\('pp_tso2_embedded','1'\)/);
 assert.match(shell,/document\.addEventListener\('click',handleLink,true\)/);
 assert.match(shell,/event\.preventDefault\(\)/);
 assert.match(shell,/location\.assign\(target\.href\)/);
 assert.match(shell,/window\.open=function/);
 assert.match(shell,/form\.action=url\.href;form\.target='_self'/);
 assert.match(shell,/u\.pathname='\/submit'/);
 assert.match(shell,/parlayping\.net/);
 assert.match(shell,/inTsoWorkspace/);
});
test('separate standalone site navigation still works outside TSO embed',()=>{
 const shell=read('tso2-shell.js');
 assert.match(shell,/if\(inTsoWorkspace\)\{/);
 assert.match(shell,/return;\s*\}\s*const tso=/);
});
