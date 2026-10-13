#!/usr/bin/env node
// Real Chromium QA of TSO 2.0 native Parlay Ping embedded mode.
// This runs without credentials and never submits betting or account data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const output=path.join(__dirname,'..','artifacts','tso2-native-embed');
fs.mkdirSync(output,{recursive:true});
const PP='https://parlayping.thesportsoutpost.com';
const TSO='https://thesportsoutpost.com';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:940}});
 try{
  const page=await context.newPage();
  await page.goto(TSO+'/',{waitUntil:'domcontentloaded',timeout:45000});
  // The parent origin must be the real TSO origin. No privileged session used.
  await page.evaluate(pp=>{
    document.body.innerHTML='<iframe id="tsoParlayPingQa" title="Embedded Parlay Ping" style="width:100%;height:1200px;border:0;display:block" src="'+pp+'/submit?tso_embed=1"></iframe>';
    document.body.style.cssText='margin:0;padding:0;background:#05070a';
  },PP);
  const locator=page.frameLocator('#tsoParlayPingQa');
  await locator.locator('#dropzone').waitFor({state:'attached',timeout:45000});
  let frame=page.frames().find(f=>f.url().startsWith(PP+'/submit'));
  assert.ok(frame,'Embedded submit frame is missing');
  const diagnosis=await frame.evaluate(()=>({
    href:location.href,html:document.documentElement.outerHTML.slice(0,250),
    marker:document.documentElement.hasAttribute('data-tso2pp-embed'),
    scriptSources:[...document.scripts].map(s=>s.src).filter(s=>s.includes('tso2-shell')),
    stylesheetUrls:[...document.querySelectorAll('link[rel="stylesheet"]')].map(x=>x.href).filter(x=>x.includes('tso2')),
    frameWindow:window.self!==window.top
  }));
  console.log('Precheck embedded frame:',JSON.stringify(diagnosis));
  await frame.waitForFunction(()=>document.documentElement.hasAttribute('data-tso2pp-embed'),null,{timeout:7500});
  await frame.waitForFunction(()=>getComputedStyle(document.querySelector('.submit-hero')).display==='none',{timeout:18000});
  let info=await frame.evaluate(()=>{
    const display=s=>{const e=document.querySelector(s);return e?getComputedStyle(e).display:'absent'};
    const rgb=getComputedStyle(document.body).backgroundColor;
    return{
      href:location.href,mode:document.documentElement.hasAttribute('data-tso2pp-embed'),
      nav:display('header[data-pp-app-nav]'),builderNav:display('header.pp-builder-header'),
      hero:display('.submit-hero'),founding:display('.founding-card'),
      dropzone:display('#dropzone'),form:display('.submit-form-card'),
      background:rgb,toolDraft:display('.pp-tso-selection-panel')
    };
  });
  console.log('Embedded submit:',JSON.stringify(info));
  assert.equal(info.mode,true);
  assert.equal(info.hero,'none');
  assert.ok(['none','absent'].includes(info.nav)&&['none','absent'].includes(info.builderNav));
  assert.equal(info.founding,'none');
  assert.notEqual(info.dropzone,'none');
  assert.notEqual(info.form,'none');
  assert.equal(info.background,'rgb(5, 7, 10)');
  await page.screenshot({path:path.join(output,'tso2-embed-submit-desktop.png'),fullPage:false});
  console.log('PASS embedded submit page has native layout and no second navigation/hero');
  await page.evaluate(pp=>document.querySelector('#tsoParlayPingQa').src=pp+'/profile?tso_embed=1',PP);
  await locator.locator('#trackingSection').waitFor({state:'attached',timeout:45000});
  frame=page.frames().find(f=>f.url().startsWith(PP+'/profile'));
  assert.ok(frame);
  await frame.waitForFunction(()=>document.documentElement.hasAttribute('data-tso2pp-embed'),{timeout:18000});
  const profile=await frame.evaluate(()=>{
    const style=s=>{const e=document.querySelector(s);return e?getComputedStyle(e).display:'absent'};
    return{mode:document.documentElement.hasAttribute('data-tso2pp-embed'),nav:style('header[data-pp-app-nav]'),cover:style('.profile-cover'),tabs:style('.profile-tabs'),bg:getComputedStyle(document.body).backgroundColor};
  });
  console.log('Embedded profile:',JSON.stringify(profile));
  assert.equal(profile.mode,true);
  assert.ok(['none','absent'].includes(profile.nav));
  assert.equal(profile.cover,'none');
  assert.equal(profile.tabs,'none');
  assert.equal(profile.bg,'rgb(5, 7, 10)');
  await page.screenshot({path:path.join(output,'tso2-embed-profile-desktop.png'),fullPage:false});
  console.log('PASS embedded My Parlays removes standalone profile chrome');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(pp=>document.querySelector('#tsoParlayPingQa').src=pp+'/submit?tso_embed=1',PP);
  await locator.locator('#dropzone').waitFor({state:'attached',timeout:45000});
  frame=page.frames().find(f=>f.url().startsWith(PP+'/submit'));
  await frame.waitForFunction(()=>document.documentElement.hasAttribute('data-tso2pp-embed'),{timeout:18000});
  const mobile=await frame.evaluate(()=>({screenWidth:innerWidth,scrollWidth:document.documentElement.scrollWidth,hero:getComputedStyle(document.querySelector('.submit-hero')).display}));
  assert.equal(mobile.hero,'none');
  assert.ok(mobile.scrollWidth<=mobile.screenWidth+6,'Embedded mobile content overflows horizontally');
  await page.screenshot({path:path.join(output,'tso2-embed-submit-mobile.png'),fullPage:false});
  console.log('PASS embedded mobile view does not overflow or display standalone chrome');
  // Real production TSO parent must scroll after a dynamically long betslip.
  const integrated=await context.newPage();
  await integrated.goto(TSO+'/#parlays',{waitUntil:'domcontentloaded',timeout:45000});
  const embeddedFrame=integrated.locator('[data-parlayping-frame]');
  await embeddedFrame.waitFor({state:'attached',timeout:45000});
  await integrated.frameLocator('[data-parlayping-frame]').locator('#dropzone').waitFor({state:'attached',timeout:45000});
  const embeddedPage=integrated.frames().find(f=>f.url().startsWith(PP+'/submit'));
  assert.ok(embeddedPage,'The real TSO Parlay Ping iframe must load');
  await integrated.evaluate(()=>{
    window.__ppQaMessages=[];
    window.addEventListener('message',e=>{
      if(e.data?.type?.startsWith('tso2-parlayping-'))
        window.__ppQaMessages.push({type:e.data.type,origin:e.origin,height:e.data.height});
    });
  });
  await embeddedPage.evaluate(()=>{
    const test=document.createElement('section');
    test.id='qa-long-betslip';
    test.style.cssText='height:3200px;display:block;pointer-events:none';
    document.body.appendChild(test);
  });
  await wait(1800);
  const embeddedDiagnosis=await embeddedPage.evaluate(()=>({
    referrer:document.referrer,rootHeight:document.documentElement.scrollHeight,
    bodyHeight:document.body.scrollHeight,
    booted:window.__TSO2_PARLAYPING_SHELL__,
    scripts:[...document.scripts].map(s=>s.src).filter(s=>s.includes('tso2-shell'))
  }));
  const parentDiagnosis=await integrated.evaluate(()=>{
    const f=document.querySelector('[data-parlayping-frame]');
    return {styleHeight:f.style.height,computedHeight:f.getBoundingClientRect().height,
      messages:window.__ppQaMessages,scrollAttribute:f.getAttribute('scrolling')};
  });
  console.log('Long-slip resize diagnostics '+JSON.stringify({embeddedDiagnosis,parentDiagnosis}));
  await integrated.waitForFunction(()=>{
    const iframe=document.querySelector('[data-parlayping-frame]');
    return iframe&&Number.parseFloat(iframe.style.height)>=3200;
  },null,{timeout:16000});
  const size=await embeddedFrame.evaluate(el=>({iframeHeight:el.getBoundingClientRect().height,
    reportedHeight:el.style.height,scrollAttribute:el.getAttribute('scrolling')}));
  assert.equal(size.scrollAttribute,'auto','Native iframe scrolling must remain enabled');
  assert.ok(size.iframeHeight>=3200,'TSO iframe grows for a long betslip');
  await integrated.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  const scrolled=await integrated.evaluate(()=>({scrollY:window.scrollY,
    scrollHeight:document.documentElement.scrollHeight,innerHeight:window.innerHeight}));
  assert.ok(scrolled.scrollY>500,'Outer TSO page must scroll to long betslip content');
  console.log('PASS live TSO embedded long betslip scroll: '+JSON.stringify({size,scrolled}));
  await integrated.screenshot({path:path.join(output,'tso2-long-betslip-scroll.png'),fullPage:false});
  const solo=await context.newPage();
  await solo.goto('https://parlayping.net/submit',{waitUntil:'domcontentloaded',timeout:45000});
  const standalone=await solo.evaluate(()=>({
    flagged:document.documentElement.hasAttribute('data-tso2pp-embed'),
    hero:getComputedStyle(document.querySelector('.submit-hero')).display
  }));
  assert.equal(standalone.flagged,false);
  assert.notEqual(standalone.hero,'none');
  console.log('PASS standalone Parlay Ping remains independently branded');
  console.log('TSO 2.0 EMBED VISUAL QA PASSED');
 }finally{await context.close();await browser.close()}
})().catch(error=>{console.error('TSO 2.0 EMBED VISUAL QA FAILED:',error.stack||error);process.exitCode=1});
