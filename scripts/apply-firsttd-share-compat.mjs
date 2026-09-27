import fs from 'node:fs';

function replaceOnce(file,before,after,label){
  const source=fs.readFileSync(file,'utf8');
  if(source.includes(after))return false;
  if(!source.includes(before))throw new Error(`${label}: target not found in ${file}`);
  fs.writeFileSync(file,source.replace(before,after));
  return true;
}

replaceOnce(
  'server/api/lib/share-slip.js',
  `function canonicalLeg(input = {}, index = 0) {\n  const line = finiteOrNull(input.line);\n  const oddsAmerican = finiteOrNull(input.oddsAmerican ?? input.odds ?? input.price);\n`,
  `function canonicalLeg(input = {}, index = 0) {\n  const line = finiteOrNull(input.line);\n  const originalText = cleanText(input.originalText, 300);\n  const rawMarket = cleanText(input.market ?? input.prop_key ?? input.propKey, 120);\n  const firstTdText = /\\b(first|1st)\\s+(?:touchdown|td)(?:\\s+scorer)?\\b/i.test(String(originalText || input.displayMarket || input.selectionText || ''));\n  const market = firstTdText && /^(?:atd|anytime(?:td|touchdown)?)$/i.test(String(rawMarket || '')) ? 'firstTd' : rawMarket;\n  const displayMarket = market === 'firstTd' ? '1ST TD' : cleanText(input.displayMarket ?? input.selectionText, 180);\n  const oddsAmerican = finiteOrNull(input.oddsAmerican ?? input.odds ?? input.price);\n`,
  'infer legacy First TD market'
);

replaceOnce(
  'server/api/lib/share-slip.js',
  `    market: cleanText(input.market ?? input.prop_key ?? input.propKey, 120),\n    displayMarket: cleanText(input.displayMarket ?? input.selectionText, 180),\n    side: cleanText(input.side ?? input.selection, 24),\n    line,\n    inclusive: Boolean(input.inclusive),\n    originalText: cleanText(input.originalText, 300),\n`,
  `    market,\n    displayMarket,\n    side: cleanText(input.side ?? input.selection, 24),\n    line,\n    inclusive: Boolean(input.inclusive),\n    originalText,\n`,
  'use inferred First TD market'
);

const testFile='tests/firsttd-share-compat.test.js';
fs.writeFileSync(testFile,`const test=require('node:test');\nconst assert=require('node:assert/strict');\nconst {canonicalLeg}=require('../server/api/lib/share-slip');\n\ntest('legacy X First TD tokens are upgraded before sportsbook enrichment',()=>{\n  const leg=canonicalLeg({sport:'NFL',player:'Jahmyr Gibbs',market:'atd',displayMarket:'ATD',originalText:'Jahmyr Gibbs First Touchdown Scorer',oddsAmerican:270});\n  assert.equal(leg.market,'firstTd');\n  assert.equal(leg.displayMarket,'1ST TD');\n  assert.equal(leg.oddsAmerican,270);\n});\n\ntest('true anytime TD legs stay ATD',()=>{\n  const leg=canonicalLeg({sport:'NFL',player:'Jahmyr Gibbs',market:'atd',displayMarket:'ATD',originalText:'Jahmyr Gibbs Anytime Touchdown Scorer'});\n  assert.equal(leg.market,'atd');\n});\n`);

console.log('First TD share compatibility patch applied');
