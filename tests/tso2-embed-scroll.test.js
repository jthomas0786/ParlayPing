#!/usr/bin/env node
// Regression: a long embedded betslip must report its full content height and
// send trusted messages to both staging and production TSO. No network needed.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','tso2-shell.js'),'utf8');
new vm.Script(source,{filename:'tso2-shell.js'}); // catches malformed /build/ regex

function scenario(origin){
 const messages=[],handlers={},rafs=[];
 const flush=()=>{while(rafs.length)rafs.shift()();};
 let bodyHeight=850,rootHeight=3800;
 const body={
  scrollHeight:bodyHeight,
  getBoundingClientRect:()=>({top:0,bottom:bodyHeight}),
  children:[{getBoundingClientRect:()=>({bottom:3000})}]
 };
 const document={
  referrer:origin+'/games',readyState:'complete',
  body,documentElement:{dataset:{},scrollHeight:rootHeight,hasAttribute:()=>false},
  head:{append:()=>{}},
  createElement:()=>({rel:'',href:''}),
  addEventListener:()=>{}
 };
 const window={
  self:{},top:{},parent:{postMessage:(message,target)=>messages.push({message,target})},
  addEventListener:(name,fn)=>{handlers[name]=fn},
  open:()=>{}
 };
 const session={getItem:()=>null,setItem:()=>{}};
 const sandbox={window,document,location:{
  href:'https://parlayping.thesportsoutpost.com/submit?tso_embed=1',
  pathname:'/submit',search:'?tso_embed=1',protocol:'https:',host:'parlayping.thesportsoutpost.com'
 },sessionStorage:session,URL,URLSearchParams,
 requestAnimationFrame:fn=>{rafs.push(fn);return 1;},
 getComputedStyle:()=>({display:'block',position:'static'}),
 ResizeObserver:class{observe(){}},MutationObserver:class{observe(){}},
 HTMLFormElement:class{},console};
 vm.runInNewContext(source,sandbox,{timeout:2000,filename:'tso2-shell.js'});
 flush();
 const initial=messages.filter(x=>x.message.type==='tso2-parlayping-size');
 assert.equal(initial.length,1,'Embed must emit initial content height');
 assert.equal(initial[0].message.height,3800,'Document scroll height wins over shorter body height');
 assert.equal(initial[0].target,origin,'Resize only sent to the verified TSO parent origin');
 document.documentElement.scrollHeight=9200;
 handlers.resize();
 flush();
 const sizes=messages.filter(x=>x.message.type==='tso2-parlayping-size');
 assert.equal(sizes.at(-1).message.height,9200,'Long 25-leg slip resizes dynamically');
 assert.equal(sizes.at(-1).target,origin);
 assert.ok(messages.some(x=>x.message.type==='tso2-parlayping-route'&&x.target===origin));
}
scenario('https://thesportsoutpost.com');
scenario('https://staging.thesportsoutpost.com');
console.log('TSO Parlay Ping scrolling: valid embedded script, root height, dynamic growth, and origin routing PASS');
