import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { renderPng } = require('../server/api/share-card');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#071725"/><text x="80" y="170" font-family="Arial,sans-serif" font-size="72" font-weight="800" fill="#fff">ParlayPing Live</text><text x="80" y="270" font-family="Arial,sans-serif" font-size="48" fill="#fff">Reese O15.5 PTS · 52%</text></svg>`;
const png = await renderPng(svg);
assert.ok(Buffer.isBuffer(png));
assert.ok(png.length > 10_000, `PNG unexpectedly small: ${png.length}`);
console.log(`share-card-font-smoke: ${png.length} bytes`);
