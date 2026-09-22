const test = require('node:test');
const assert = require('node:assert/strict');

const { requestBaseUrl } = require('../api/v1/share');

test('share API returns canonical ParlayPing base URL instead of the Vercel request host', () => {
  const previous = process.env.PUBLIC_BASE_URL;
  try {
    delete process.env.PUBLIC_BASE_URL;
    assert.equal(
      requestBaseUrl({ headers: { 'x-forwarded-host':'parlayping-git-example.vercel.app', 'x-forwarded-proto':'https' } }),
      'https://parlayping.net',
    );

    process.env.PUBLIC_BASE_URL = 'https://parlayping.net/';
    assert.equal(requestBaseUrl({ headers: { host:'another-vercel-host.vercel.app' } }), 'https://parlayping.net');
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previous;
  }
});
