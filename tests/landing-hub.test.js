const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('landing page loads the ParlayPing bet creation hub',()=>{
  const app=read('app.js');
  const hub=read('landing-hub.js');
  const css=read('landing-hub.css');
  const intelCss=read('landing-insights-trends.css');
  assert.match(app,/landing-hub\.js\?v=20260924b/);
  assert.match(hub,/Image to Betslip/);
  assert.match(hub,/Trending betslips/);
  assert.match(hub,/LIVE COMMUNITY INSIGHTS/);
  assert.match(hub,/parlayping-approved-lockup\.svg/);
  assert.match(hub,/\/api\/landing-create/);
  assert.match(css,/\.pp-home-header/);
  assert.match(css,/\.pp-bet-composer/);
  assert.match(intelCss,/\.pp-intel-section/);
  assert.match(intelCss,/\.pp-trend-filter/);
});

test('landing insights and trends are derived from real public community builds',()=>{
  const hub=read('landing-hub.js');
  assert.match(hub,/community_parlays\?is_active=eq\.true/);
  assert.match(hub,/select=id,builder_url,title,author_name,x_username,sport,leg_count,legs,sportsbook,created_at/);
  assert.match(hub,/function computeIntel\(/);
  assert.match(hub,/function trendScore\(/);
  assert.match(hub,/function trendReason\(/);
  assert.match(hub,/data-pp-trend-sport/);
  assert.match(hub,/data-pp-insight-prompt/);
  assert.match(hub,/data-pp-intel-refresh/);
  assert.match(hub,/No public build data yet/);
  assert.doesNotMatch(hub,/POPULAR BUILD/);
  assert.doesNotMatch(hub,/Sunday player props/);
});

test('landing creator is routed through Vercel and the API router',()=>{
  const api=read('api/index.js');
  const vercel=read('vercel.json');
  assert.match(api,/'landing-create'/);
  assert.match(vercel,/\/api\/landing-create/);
});

test('typed bet creates a signed real builder URL',async()=>{
  process.env.PARLAYPING_SHARE_SECRET='landing-hub-test-secret-that-is-long-enough-123456';
  process.env.PUBLIC_BASE_URL='https://parlayping.net';
  delete process.env.OPENAI_API_KEY;
  const handler=require('../server/api/landing-create');
  const req={method:'POST',body:{text:'NFL\nCeeDee Lamb over 109.5 receiving yards'},headers:{}};
  const state={status:200,payload:null};
  const res={setHeader(){},status(code){state.status=code;return this;},json(payload){state.payload=payload;return payload;},end(){}};
  await handler(req,res);
  assert.equal(state.status,200);
  assert.equal(state.payload.ok,true);
  assert.equal(state.payload.legCount,1);
  assert.match(state.payload.builderUrl,/^https:\/\/parlayping\.net\/build\/s1\./);
});

test('landing creator refuses unsupported image payloads',async()=>{
  process.env.PARLAYPING_SHARE_SECRET='landing-hub-test-secret-that-is-long-enough-123456';
  const handler=require('../server/api/landing-create');
  const req={method:'POST',body:{imageData:'data:text/plain;base64,SGVsbG8='},headers:{}};
  const state={status:200,payload:null};
  const res={setHeader(){},status(code){state.status=code;return this;},json(payload){state.payload=payload;return payload;},end(){}};
  await handler(req,res);
  assert.equal(state.status,400);
  assert.match(state.payload.error,/PNG, JPG or WebP/i);
});
