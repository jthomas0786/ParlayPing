const test = require('node:test');
const assert = require('node:assert/strict');

process.env.PARLAYPING_SHARE_SECRET = 'test-only-parlayping-share-secret-0123456789abcdef';
process.env.PUBLIC_BASE_URL = 'https://parlayping.net';

const shareRoute = require('../api/v1/share');
const sharePage = require('../api/share-page');
const shareCard = require('../api/share-card');

test('share API body parser accepts object and JSON string bodies', () => {
  assert.deepEqual(shareRoute.parseBody({ body:{ legs:[1] } }), { legs:[1] });
  assert.deepEqual(shareRoute.parseBody({ body:'{"legs":[1]}' }), { legs:[1] });
  assert.deepEqual(shareRoute.parseBody({ body:'not-json' }), {});
});

test('share URL request host helpers use forwarded HTTPS host', () => {
  const req = { headers:{ 'x-forwarded-host':'parlayping.net', 'x-forwarded-proto':'https' } };
  assert.equal(shareRoute.requestBaseUrl(req), 'https://parlayping.net');
});

test('share page and card token readers accept routed slip parameter', () => {
  const req = { query:{ slip:'s1.payload.signature' } };
  assert.equal(sharePage.tokenFromRequest(req), 's1.payload.signature');
  assert.equal(shareCard.tokenFromRequest(req), 's1.payload.signature');
});
