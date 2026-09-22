function publicBaseUrl(value) {
  return String(value || process.env.PUBLIC_BASE_URL || 'https://parlayping.net').replace(/\/+$/, '');
}

function buildBuilderUrl(token, value) {
  return `${publicBaseUrl(value)}/build/s/${encodeURIComponent(token)}`;
}

module.exports = { publicBaseUrl, buildBuilderUrl };
