#!/usr/bin/env node
// Parlay Ping billing-browser QA: public real-browser smoke + isolated mocked
// customer interactions. NO real credentials, purchases or Stripe sessions.
// Mocked Stripe pages must never be described as a completed hosted payment.
'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'artifacts', 'billing-browser');
fs.mkdirSync(OUT, { recursive: true });
const SESSION = 'parlayping_supabase_session_v1';
const MISSING = {
  ok: true, isDeveloper: true, isOwner: false, sandboxCheckoutAllowed: true,
  subscription: null, apiKeys: [],
  usage: {plan: 'none', monthlyUsed: 0, monthlyLimit: 0, rateLimitPerMinute: 0, maxApiKeys: 0}
};
const PAID = {
  ...MISSING, subscription: {
    provider: 'stripe', plan_id: 'starter', status: 'active',
    provider_customer_id: 'cus_mock_browser',
    provider_subscription_id: 'sub_mock_browser',
    current_period_end: '2026-11-11T00:00:00Z'
  },
  usage: {plan: 'starter', monthlyUsed: 0, monthlyLimit: 5000, rateLimitPerMinute: 30, maxApiKeys: 2}
};
const CANCELED = {
  ...MISSING, sandboxCheckoutAllowed: false,
  subscription: {
    provider: 'stripe', plan_id: 'business', status: 'canceled',
    provider_customer_id: 'cus_mock_canceled',
    provider_subscription_id: 'sub_mock_canceled'
  }
};
const fixture = `<!doctype html><html><head><meta charset="utf-8">
<title>Parlay Ping isolated billing browser fixture</title></head><body>
<button id="devTab" data-profile-tab="dev">Developer</button>
<section id="trackingSection"></section><section id="communitySection"></section>
<section id="devSection" hidden>
  <span id="devAccessBadge"></span><span id="devPlanName"></span>
  <span id="devUsageUsed"></span><span id="devUsageLimit"></span>
  <span id="devMinuteLimit"></span><span id="devKeyLimit"></span>
  <div id="devKeysList"></div><div id="devBillingSummary"></div>
  <div id="devBillingFreeActions">
    <button id="devUpgradeStarter">Starter checkout</button>
    <button id="devUpgradePro">Pro checkout</button>
    <button id="devUpgradeBusiness">Business checkout</button>
  </div>
  <div id="devBillingPaidActions" hidden>
    <button id="devManageBilling">Manage billing</button>
  </div>
  <p id="devSandboxNote"></p><p id="devPlanHint"></p>
  <p id="devKeyHint"></p>
  <form id="devKeyForm"><input id="devKeyName"><button type="submit">Create key</button></form>
  <pre id="devNewKeyBox" hidden><span id="devNewKey"></span></pre>
  <div id="devStatus" hidden></div>
</section><script src="/profile-dev.js" defer></script></body></html>`;

const calls = [];
let returned = MISSING;
let responses = [MISSING];
let rejectCheckoutUrl = false;
let accountRequests = 0;
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || '/', 'http://127.0.0.1');
  const send = (code, content, mime='application/json') => {
    res.writeHead(code, {'content-type': mime, 'cache-control': 'no-store'});
    res.end(mime === 'application/json' ? JSON.stringify(content) : content);
  };
  if (u.pathname === '/profile') return send(200, fixture, 'text/html');
  if (u.pathname === '/profile-dev.js') return send(200, fs.readFileSync(path.join(ROOT, 'profile-dev.js'), 'utf8'), 'application/javascript');
  if (u.pathname === '/api/account') {
    const index = Math.min(accountRequests++, responses.length - 1);
    returned = responses[index];
    return send(200, returned);
  }
  if (u.pathname === '/api/billing-checkout' || u.pathname === '/api/billing-portal') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const json = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    calls.push({route: u.pathname, body: json, auth: req.headers.authorization?.startsWith('Bearer ')});
    if (u.pathname.endsWith('checkout'))
      return send(200, {ok: true, url: rejectCheckoutUrl ? 'https://not-stripe.example/pay' : 'https://checkout.stripe.com/c/pay/mock-browser'});
    return send(200, {ok: true, url: 'https://billing.stripe.com/p/mock-browser'});
  }
  return send(404, {error: 'Unknown fixture path'});
});
function state(items, invalidUrl=false) {
  calls.length = 0;
  accountRequests = 0;
  responses = items;
  rejectCheckoutUrl = invalidUrl;
}
async function visit(browser, origin, pagePath='/profile?tab=dev') {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}});
  await context.addInitScript(({name}) => {
    try {
      localStorage.setItem(name, JSON.stringify({access_token: 'mock_browser_test_only',
        expires_at: Math.floor(Date.now() / 1000) + 1800}));
    } catch {}
  }, {name: SESSION});
  await context.route('https://checkout.stripe.com/**', async route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><title>Mock Stripe Checkout (not real)</title><h1>Mock hosted redirect</h1>'
  }));
  await context.route('https://billing.stripe.com/**', async route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><title>Mock Stripe Portal (not real)</title><h1>Mock hosted portal</h1>'
  }));
  const page = await context.newPage();
  await page.goto(origin + pagePath);
  await page.locator('#devPlanName').waitFor({state: 'visible', timeout: 12000});
  return {page, context};
}
async function closeContext(obj) { await obj.context.close(); }
async function testMockedDashboard(browser, origin) {
  for (const plan of ['Starter', 'Pro', 'Business']) {
    state([MISSING]);
    const obj = await visit(browser, origin);
    await obj.page.waitForFunction(() => document.querySelector('#devUpgradeStarter')?.disabled === false);
    await obj.page.evaluate(id => {
      const button = document.getElementById(id);
      button.click(); button.click(); // simulated double click
    }, 'devUpgrade' + plan);
    await obj.page.waitForURL(url => url.hostname === 'checkout.stripe.com', {timeout: 12000});
    assert.equal(calls.length, 1, plan + ' must open exactly one checkout per double click');
    assert.deepEqual(calls[0].body, {plan: plan.toLowerCase()});
    assert.equal(calls[0].auth, true);
    console.log('PASS mocked browser: ' + plan + ' starts one authenticated Stripe-hosted redirect');
    await closeContext(obj);
  }
  state([MISSING], true);
  const invalid = await visit(browser, origin);
  await invalid.page.locator('#devUpgradeStarter').click();
  await invalid.page.locator('#devStatus').getByText('verified hosted URL', {exact: false}).waitFor();
  assert.equal(invalid.page.url().startsWith(origin), true);
  console.log('PASS mocked browser: untrusted checkout redirect rejected');
  await closeContext(invalid);

  state([{...MISSING, sandboxCheckoutAllowed: false}]);
  const blocked = await visit(browser, origin);
  assert.equal(await blocked.page.locator('#devUpgradeStarter').isDisabled(), true);
  assert.equal(await blocked.page.locator('#devManageBilling').isDisabled(), true);
  assert.equal(calls.length, 0);
  console.log('PASS mocked browser: public non-tester cannot open checkout or portal');
  await closeContext(blocked);

  state([CANCELED]);
  const canceled = await visit(browser, origin);
  await canceled.page.getByRole('button', {name: 'View invoices & billing history'}).waitFor();
  assert.equal(await canceled.page.locator('#devManageBilling').isDisabled(), false);
  assert.equal(await canceled.page.locator('#devUpgradeStarter').isDisabled(), true);
  await canceled.page.locator('#devManageBilling').click();
  await canceled.page.waitForURL(url => url.hostname === 'billing.stripe.com', {timeout: 12000});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].route, '/api/billing-portal');
  console.log('PASS mocked browser: canceled test customer retains invoice-history link');
  await closeContext(canceled);

  state([MISSING, PAID]);
  const returned = await visit(browser, origin, '/profile?tab=dev&billing=success&session_id=cs_fake');
  await returned.page.waitForFunction(() => !location.search.includes('session_id='));
  await returned.page.locator('#devStatus').getByText('subscription verified', {exact: false}).waitFor({timeout: 12000});
  assert.equal(await returned.page.locator('#devPlanName').innerText(), 'STARTER');
  assert.equal(await returned.page.locator('#devKeyName').isDisabled(), false);
  assert.equal(calls.length, 0, 'Checkout return must never create an API key');
  console.log('PASS mocked browser: Checkout return waits for authoritative subscribed account response');
  await closeContext(returned);
}
async function testActualPublicWebsite(browser) {
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  const page = await context.newPage();
  for (const [route,filename] of [['/developers', 'developers-desktop.png'], ['/account', 'account-desktop.png']]) {
    const target = 'https://parlayping.net' + route;
    let error;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await page.goto(target, {waitUntil: 'domcontentloaded', timeout: 45000});
        assert.equal(response?.status(), 200, route + ' must respond 200');
        error = null; break;
      } catch (e) { error = e; await page.waitForTimeout(3000); }
    }
    if (error) throw error;
    await page.screenshot({path: path.join(OUT, filename), fullPage: true});
    if (route === '/developers') {
      for (const price of ['$20', '$70', '$120'])
        assert.ok((await page.locator('body').innerText()).includes(price), 'Missing approved ' + price);
    } else {
      assert.ok(await page.locator('#signInForm').isVisible());
      assert.ok(await page.locator('#signUpForm').isVisible());
    }
    console.log('PASS public real browser: ' + route + ' loaded and captured');
  }
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('https://parlayping.net/developers', {waitUntil: 'domcontentloaded', timeout: 45000});
  await page.screenshot({path: path.join(OUT, 'developers-mobile.png'), fullPage: true});
  assert.ok((await page.locator('body').innerText()).includes('$20'));
  console.log('PASS public real browser: mobile Developer API pricing');
  await context.close();
}

(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless: true});
  try {
    await testMockedDashboard(browser, origin);
    await testActualPublicWebsite(browser);
    console.log('BROWSER QA PASS: real public page rendering and mock-only billing browser flows.');
    console.log('NOTICE: no authenticated hosted Stripe Checkout card entry was performed.');
  } finally { await browser.close(); server.close(); }
})().catch(error => {
  console.error('BROWSER QA FAILED: ' + (error?.stack || error));
  server.close();
  process.exitCode = 1;
});
