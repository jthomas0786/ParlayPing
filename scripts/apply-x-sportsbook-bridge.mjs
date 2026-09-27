import fs from 'node:fs';

function replaceOnce(file, before, after, label) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(after)) return false;
  if (!source.includes(before)) throw new Error(`${label}: target not found in ${file}`);
  fs.writeFileSync(file, source.replace(before, after));
  return true;
}

replaceOnce(
  'server/api/x-worker.js',
  `    const baseUrl=process.env.PUBLIC_BASE_URL||'https://parlayping.net';\n    let analysis=await analyzeLegs(parsed.legs,baseUrl,input.referenceTime);\n    const executed=await executeMentionCommand(parsed.legs,analysis,input.command);\n    let effectiveLegs=executed.effectiveLegs;\n`,
  `    const baseUrl=process.env.PUBLIC_BASE_URL||'https://parlayping.net';\n    let analysis=await analyzeLegs(parsed.legs,baseUrl,input.referenceTime);\n    const contextualLegs=mergeAnalyzedContext(parsed.legs,analysis);\n    const enrichedBase=await enrichSportsbookMarkets({legs:contextualLegs});\n    const mentionLegs=enrichedBase.legs;\n    const executed=await executeMentionCommand(mentionLegs,analysis,input.command);\n    let effectiveLegs=executed.effectiveLegs;\n`,
  'mention enrichment'
);

replaceOnce(
  'builder-acceptance-final.js',
  `  const BOOK_MARK={'DraftKings':'DK','FanDuel':'F','bet365':'bet','Caesars':'C','theScore Bet':'S','BetMGM':'M','Fanatics':'F'};\n`,
  `  const BOOK_MARK={'DraftKings':'DK','FanDuel':'F','bet365':'bet','Caesars':'C','theScore Bet':'S','BetMGM':'M','Fanatics':'F'};\n  const BOOK_HOME={'DraftKings':'https://sportsbook.draftkings.com/','FanDuel':'https://sportsbook.fanduel.com/','bet365':'https://www.bet365.com/','Caesars':'https://www.caesars.com/sportsbook-and-casino','BetMGM':'https://sports.betmgm.com/en/sports','Fanatics':'https://sportsbook.fanatics.com/'};\n`,
  'sportsbook home destinations'
);

replaceOnce(
  'builder-acceptance-final.js',
  `  function exactSportsbookLinks(){\n    const out={};\n    const explicit=slip.sportsbookLinks&&typeof slip.sportsbookLinks==='object'?slip.sportsbookLinks:{};\n    for(const [book,value] of Object.entries(explicit)){const name=normalizeBook(book);const url=safeHttps(value);if(name&&url)out[name]=url;}\n    const books=[...new Set(legs.map(leg=>normalizeBook(leg.sportsbook)).filter(Boolean))];\n    for(const book of books){\n      if(out[book])continue;\n      if(!legs.every(leg=>normalizeBook(leg.sportsbook)===book))continue;\n      const links=[...new Set(legs.map(leg=>safeHttps(leg.sportsbookLink)).filter(Boolean))];\n      if(links.length===1)out[book]=links[0];\n    }\n    return out;\n  }\n`,
  `  function exactSportsbookLinks(){\n    const out={};\n    const explicit=slip.sportsbookLinks&&typeof slip.sportsbookLinks==='object'?slip.sportsbookLinks:{};\n    for(const [book,value] of Object.entries(explicit)){const name=normalizeBook(book);const url=safeHttps(value);if(name&&url)out[name]=url;}\n    const books=[...new Set(legs.map(leg=>normalizeBook(leg.sportsbook)).filter(Boolean))];\n    for(const book of books){\n      if(out[book])continue;\n      if(!legs.every(leg=>normalizeBook(leg.sportsbook)===book))continue;\n      const links=[...new Set(legs.map(leg=>safeHttps(leg.sportsbookLink)).filter(Boolean))];\n      if(links.length===1)out[book]=links[0];\n    }\n    const offerBooks=new Set();\n    for(const leg of legs)for(const key of Object.keys(leg?.bookOffers||{})){const name=normalizeBook(key);if(name)offerBooks.add(name);}\n    for(const book of offerBooks){\n      if(out[book])continue;\n      const offers=legs.map(leg=>entryForBook(leg?.bookOffers,book));\n      if(!offers.every(offer=>Number.isFinite(Number(offer?.oddsAmerican))))continue;\n      const betslipUrls=[...new Set(offers.map(offer=>safeHttps(offer?.betslipUrl)).filter(Boolean))];\n      if(betslipUrls.length===1)out[book]=betslipUrls[0];\n      else if(BOOK_HOME[book])out[book]=BOOK_HOME[book];\n    }\n    return out;\n  }\n  function isSportsbookHomeFallback(book){return Boolean(book&&BOOK_HOME[book]&&activeBookLinks[book]===BOOK_HOME[book]);}\n`,
  'sportsbook destination discovery'
);

replaceOnce(
  'builder-acceptance-final.js',
  `    grid.innerHTML=names.map(book=>\`<button class="book-card\${book===selectedBook?' active':''}" type="button" data-book="\${esc(book)}" data-exact-url="\${esc(activeBookLinks[book])}" role="listitem"><span class="book-logo \${esc(BOOK_CLASS[book]||'more')}">\${esc(BOOK_MARK[book]||book.slice(0,2).toUpperCase())}</span><span><strong>\${esc(book)}</strong><small>Open Exact Betslip</small></span></button>\`).join('');\n    const open=oldOpen.cloneNode(true);oldOpen.replaceWith(open);\n    const sync=()=>{const current=q('.book-card.active');selectedBook=current?.dataset.book||selectedBook||names[0];const currentLabel=q('#selectedBookLabel');if(currentLabel)currentLabel.textContent=selectedBook;open.disabled=!activeBookLinks[selectedBook];open.classList.toggle('unavailable',!activeBookLinks[selectedBook]);};\n`,
  `    grid.innerHTML=names.map(book=>{const homeFallback=BOOK_HOME[book]===activeBookLinks[book];return \`<button class="book-card\${book===selectedBook?' active':''}" type="button" data-book="\${esc(book)}" data-exact-url="\${esc(activeBookLinks[book])}" role="listitem"><span class="book-logo \${esc(BOOK_CLASS[book]||'more')}">\${esc(BOOK_MARK[book]||book.slice(0,2).toUpperCase())}</span><span><strong>\${esc(book)}</strong><small>\${homeFallback?'Verified prices · Open Sportsbook':'Open Exact Betslip'}</small></span></button>\`;}).join('');\n    const open=oldOpen.cloneNode(true);oldOpen.replaceWith(open);\n    const sync=()=>{const current=q('.book-card.active');selectedBook=current?.dataset.book||selectedBook||names[0];const currentLabel=q('#selectedBookLabel');if(currentLabel)currentLabel.textContent=selectedBook;const available=Boolean(activeBookLinks[selectedBook]);open.disabled=!available;open.classList.toggle('unavailable',!available);if(available){const homeFallback=isSportsbookHomeFallback(selectedBook);open.innerHTML=\`<span class="link-icon">↗</span> <strong>\${homeFallback?\`Open \${esc(selectedBook)}\`:'Open Exact Betslip'}</strong>\`;}};\n`,
  'sportsbook cards and open button'
);

const testFile='tests/x-mention-sportsbook-bridge.test.js';
if(!fs.existsSync(testFile)) fs.writeFileSync(testFile, `const test=require('node:test');\nconst assert=require('node:assert/strict');\nconst fs=require('node:fs');\n\ntest('normal X mentions enrich sportsbook markets before sharing',()=>{\n  const source=fs.readFileSync('server/api/x-worker.js','utf8');\n  assert.match(source,/const contextualLegs=mergeAnalyzedContext\\(parsed\\.legs,analysis\\)/);\n  assert.match(source,/const enrichedBase=await enrichSportsbookMarkets\\(\\{legs:contextualLegs\\}\\)/);\n  assert.match(source,/executeMentionCommand\\(mentionLegs,analysis,input\\.command\\)/);\n});\n\ntest('builder exposes verified common-book prices even without provider deep links',()=>{\n  const source=fs.readFileSync('builder-acceptance-final.js','utf8');\n  assert.match(source,/const BOOK_HOME=/);\n  assert.match(source,/Object\\.keys\\(leg\\?\\.bookOffers\\|\\|\\{\\}\\)/);\n  assert.match(source,/Verified prices · Open Sportsbook/);\n  assert.match(source,/Open Exact Betslip/);\n});\n`);

console.log('X sportsbook bridge patch applied');
