import fs from 'node:fs';

function patch(path, oldText, newText) {
  const source = fs.readFileSync(path, 'utf8');
  if (source.includes(newText)) return;
  if (!source.includes(oldText)) throw new Error(`Expected block not found in ${path}: ${oldText.slice(0, 120)}`);
  fs.writeFileSync(path, source.replace(oldText, newText));
}

const ui = 'builder-sportsbook-open-final.js';
patch(ui,
  "  const BOOK_ORDER=['DraftKings','FanDuel','bet365','Caesars','theScore Bet','BetMGM','Fanatics'];",
  "  const BOOK_ORDER=['DraftKings','FanDuel','bet365','Caesars','theScore Bet','BetMGM','Fanatics','ESPN BET','Hard Rock Bet','BetRivers','Pinnacle','Parx Casino','Bovada','Fliff'];\n  const ACTUAL_SPORTSBOOKS=new Set(BOOK_ORDER);"
);
patch(ui,
  "    const aliases={draftkings:'DraftKings',draftkingssportsbook:'DraftKings',dk:'DraftKings',fanduel:'FanDuel',fanduelsportsbook:'FanDuel',fd:'FanDuel',bet365:'bet365','365':'bet365',caesars:'Caesars',williamhill:'Caesars',caesarssportsbook:'Caesars',thescorebet:'theScore Bet',thescore:'theScore Bet',betmgm:'BetMGM',mgm:'BetMGM',fanatics:'Fanatics',fanaticssportsbook:'Fanatics'};",
  "    const aliases={draftkings:'DraftKings',draftkingssportsbook:'DraftKings',dk:'DraftKings',fanduel:'FanDuel',fanduelsportsbook:'FanDuel',fd:'FanDuel',bet365:'bet365','365':'bet365',caesars:'Caesars',williamhill:'Caesars',caesarssportsbook:'Caesars',thescorebet:'theScore Bet',thescore:'theScore Bet',betmgm:'BetMGM',mgm:'BetMGM',fanatics:'Fanatics',fanaticssportsbook:'Fanatics',espnbet:'ESPN BET',espn:'ESPN BET',hardrock:'Hard Rock Bet',hardrockbet:'Hard Rock Bet',betrivers:'BetRivers',pinnacle:'Pinnacle',parx:'Parx Casino',parxcasino:'Parx Casino',bovada:'Bovada',fliff:'Fliff'};"
);
patch(ui,
  "  function safeHttps(value){try{const url=new URL(String(value||''));return url.protocol==='https:'?url.toString():null;}catch{return null;}}\n  function fmtOdds(value){const n=Number(value);if(!Number.isFinite(n))return '—';return n>0?`+${Math.round(n)}`:`${Math.round(n)}`;}",
  "  function sportsbookName(value){const book=normalizeBook(value);return book&&ACTUAL_SPORTSBOOKS.has(book)?book:null;}\n  function finiteOdds(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)&&n!==0?n:null;}\n  function safeHttps(value){try{const url=new URL(String(value||''));return url.protocol==='https:'?url.toString():null;}catch{return null;}}\n  function fmtOdds(value){const n=finiteOdds(value);if(n==null)return '—';return n>0?`+${Math.round(n)}`:`${Math.round(n)}`;}"
);
patch(ui,
  "      const book=normalizeBook(raw),url=safeHttps(value);\n      if(book&&url)out[book]=url;",
  "      const book=sportsbookName(raw),url=safeHttps(value);\n      if(book&&url)out[book]=url;"
);
patch(ui,
  "    const books=[...new Set(legs.map(leg=>normalizeBook(leg?.sportsbook)).filter(Boolean))];\n    for(const book of books){\n      if(out[book]||!legs.length||!legs.every(leg=>normalizeBook(leg?.sportsbook)===book))continue;",
  "    const books=[...new Set(legs.map(leg=>sportsbookName(leg?.sportsbook)).filter(Boolean))];\n    for(const book of books){\n      if(out[book]||!legs.length||!legs.every(leg=>sportsbookName(leg?.sportsbook)===book))continue;"
);
patch(ui,
  "      for(const [raw,offer] of Object.entries(leg?.bookOffers||{})){\n        if(Number.isFinite(Number(offer?.oddsAmerican))){const book=normalizeBook(raw);if(book)books.add(book);}\n      }\n      if(Number.isFinite(Number(leg?.oddsAmerican))){const book=normalizeBook(leg?.sportsbook);if(book)books.add(book);}\n    }\n    const requested=normalizeBook(slip?.sportsbook);if(requested)books.add(requested);",
  "      for(const [raw,offer] of Object.entries(leg?.bookOffers||{})){\n        if(finiteOdds(offer?.oddsAmerican)!=null){const book=sportsbookName(raw);if(book)books.add(book);}\n      }\n      if(finiteOdds(leg?.oddsAmerican)!=null){const book=sportsbookName(leg?.sportsbook);if(book)books.add(book);}\n    }"
);
patch(ui,
  "    const price=Number(offer?.oddsAmerican);\n    if(Number.isFinite(price))return price;\n    if(normalizeBook(leg?.sportsbook)===book&&Number.isFinite(Number(leg?.oddsAmerican)))return Number(leg.oddsAmerican);",
  "    const price=finiteOdds(offer?.oddsAmerican);\n    if(price!=null)return price;\n    const legPrice=finiteOdds(leg?.oddsAmerican);\n    if(sportsbookName(leg?.sportsbook)===sportsbookName(book)&&legPrice!=null)return legPrice;"
);
patch(ui,
  "    const normalized=normalizeBook(book);\n    if(!leg||!normalized)return [];",
  "    const normalized=sportsbookName(book);\n    if(!leg||!normalized)return [];"
);
patch(ui,
  ".filter(row=>row&&row.line!=null&&Number.isFinite(Number(row.oddsAmerican))&&(!row.side||String(row.side).toLowerCase()===side))",
  ".filter(row=>row&&row.line!=null&&finiteOdds(row.oddsAmerican)!=null&&(!row.side||String(row.side).toLowerCase()===side))"
);
patch(ui,
  "    const normalized=normalizeBook(book);\n    const item=button?.closest?.('.pp-leg-item');\n    if(!item||!normalized||normalizeBook(button.dataset.book)!==normalized)return;",
  "    const normalized=sportsbookName(book);\n    const item=button?.closest?.('.pp-leg-item');\n    if(!item||!normalized||sportsbookName(button.dataset.book)!==normalized)return;"
);
patch(ui,
  "  function canResolveExact(book){return Boolean(RESOLVABLE_BOOKS.has(normalizeBook(book))&&legs.length&&!exactSportsbookLinks()[normalizeBook(book)]);}",
  "  function canResolveExact(book){const normalized=sportsbookName(book);return Boolean(normalized&&RESOLVABLE_BOOKS.has(normalized)&&legs.length&&!exactSportsbookLinks()[normalized]);}"
);
patch(ui,
  "    const normalized=normalizeBook(book);\n    const existing=exactSportsbookLinks()[normalized];if(existing)return Promise.resolve(existing);",
  "    const normalized=sportsbookName(book);\n    const existing=normalized?exactSportsbookLinks()[normalized]:null;if(existing)return Promise.resolve(existing);"
);
patch(ui,
  "    const requested=normalizeBook(preferred)||normalizeBook(selectedBook)||normalizeBook(slip?.sportsbook);",
  "    const requested=sportsbookName(preferred)||sportsbookName(selectedBook)||sportsbookName(slip?.sportsbook);"
);
patch(ui,
  "      selectedBook=normalizeBook(card.dataset.book);",
  "      selectedBook=sportsbookName(card.dataset.book);"
);
patch(ui,
  "  window.__PP_SPORTSBOOK_OPEN_TEST__={normalizeBook,safeHttps,exactSportsbookLinks,pricedSportsbooks,orderedBooks,openTarget,legOddsForBook,altRowsForBook,mobileLike,resolverLeg,canResolveExact,applyResolvedSelections};",
  "  window.__PP_SPORTSBOOK_OPEN_TEST__={normalizeBook,sportsbookName,finiteOdds,safeHttps,fmtOdds,exactSportsbookLinks,pricedSportsbooks,orderedBooks,openTarget,legOddsForBook,altRowsForBook,mobileLike,resolverLeg,canResolveExact,applyResolvedSelections};"
);

const enrich = 'server/api/lib/sportsbook-enrich.js';
patch(enrich,
  "function sideOf(leg){const side=String(leg?.side||'over').toLowerCase();return side==='under'||side==='no'?'under':'over';}\nfunction marketKey(leg){",
  "function sideOf(leg){const side=String(leg?.side||'over').toLowerCase();return side==='under'||side==='no'?'under':'over';}\nfunction sportsbookLineForLeg(leg){\n  const line=finite(leg?.line);if(line==null)return null;\n  if(leg?.inclusive===true&&Number.isInteger(line)){\n    const side=sideOf(leg);\n    if(side==='over')return line-0.5;\n    if(side==='under')return line+0.5;\n  }\n  return line;\n}\nfunction lineMatchesLeg(rowLine,leg){const row=finite(rowLine),wanted=sportsbookLineForLeg(leg);return row!=null&&wanted!=null&&Math.abs(row-wanted)<1e-7;}\nfunction marketKey(leg){"
);
patch(enrich,
  "    const exact=binaryMatch||(line!=null&&finite(leg.line)!=null&&Math.abs(line-Number(leg.line))<1e-7);",
  "    const exact=binaryMatch||lineMatchesLeg(line,leg);"
);
patch(enrich,
  "const exact=finite(leg.line)!=null&&Math.abs(line-Number(leg.line))<1e-7;",
  "const exact=lineMatchesLeg(line,leg);"
);
patch(enrich,
  "module.exports={enrichSportsbookMarkets,enrichLeg,loadSnapshot,parseRowSnapshot,parseNestedSnapshot,parseMlbPublicSlate,marketKey,normBook,mlbGameMatches,sameEvent};",
  "module.exports={enrichSportsbookMarkets,enrichLeg,loadSnapshot,parseRowSnapshot,parseNestedSnapshot,parseMlbPublicSlate,marketKey,normBook,mlbGameMatches,sameEvent,sportsbookLineForLeg,lineMatchesLeg};"
);

patch('server/api/builder-page.js',
  '<script src="/builder-sportsbook-open-final.js?v=20260924b"></script>',
  '<script src="/builder-sportsbook-open-final.js?v=20260927c"></script>'
);

const uiTestPath = 'tests/sportsbook-open-final.test.js';
let uiTests = fs.readFileSync(uiTestPath, 'utf8');
if (!uiTests.includes('non-sportsbook source brands never render as books')) {
  uiTests += `\n\ntest('non-sportsbook source brands never render as books and missing prices stay unavailable',()=>{\n  const slip={sportsbook:'Playbook',legs:[{id:'mahomes',sportsbook:'Playbook',oddsAmerican:null,bookOffers:{}}]};\n  const api=runOpenFinal(slip);\n  assert.deepEqual([...api.orderedBooks()],[]);\n  assert.equal(api.sportsbookName('Playbook'),null);\n  assert.equal(api.finiteOdds(null),null);\n  assert.equal(api.finiteOdds(0),null);\n  assert.equal(api.fmtOdds(null),'—');\n  assert.equal(api.legOddsForBook(slip.legs[0],'Playbook'),null);\n});\n`;
  fs.writeFileSync(uiTestPath, uiTests);
}

fs.writeFileSync('tests/sportsbook-inclusive-threshold.test.js', `const test=require('node:test');\nconst assert=require('node:assert/strict');\nconst {parseNestedSnapshot,sportsbookLineForLeg,lineMatchesLeg}=require('../server/api/lib/sportsbook-enrich');\n\nfunction nflDoc(){\n  return {games:[{\n    gameId:'kc-mia',away:'KC',home:'MIA',\n    players:[{name:'Patrick Mahomes',team:'KC',odds:{passYds:{\n      line:224.5,\n      over:{best:{book:'FanDuel',price:-110},all:[{book:'FanDuel',price:-110},{book:'DraftKings',price:-112}]},\n      under:{best:{book:'FanDuel',price:-110},all:[{book:'FanDuel',price:-110}]},\n      alternates:[{line:224.5,over:{best:{book:'FanDuel',price:-110},all:[{book:'FanDuel',price:-110},{book:'DraftKings',price:-112}]},under:{best:{book:'FanDuel',price:-110},all:[{book:'FanDuel',price:-110}]}}]\n    }}}]\n  }]};\n}\n\ntest('whole-number plus thresholds map to the exact sportsbook half-line',()=>{\n  const leg={sport:'NFL',player:'Patrick Mahomes',team:'KC',gameId:'kc-mia',market:'passYds',side:'over',line:225,inclusive:true};\n  assert.equal(sportsbookLineForLeg(leg),224.5);\n  assert.equal(lineMatchesLeg(224.5,leg),true);\n  const parsed=parseNestedSnapshot(nflDoc(),leg);\n  assert.equal(parsed.bookOffers.FanDuel.oddsAmerican,-110);\n  assert.equal(parsed.bookOffers.DraftKings.oddsAmerican,-112);\n});\n\ntest('non-inclusive 225 does not silently substitute over 224.5',()=>{\n  const leg={sport:'NFL',player:'Patrick Mahomes',team:'KC',gameId:'kc-mia',market:'passYds',side:'over',line:225,inclusive:false};\n  assert.equal(sportsbookLineForLeg(leg),225);\n  assert.equal(lineMatchesLeg(224.5,leg),false);\n  const parsed=parseNestedSnapshot(nflDoc(),leg);\n  assert.equal(parsed.bookOffers.FanDuel,undefined);\n});\n\ntest('inclusive under thresholds map upward by a half point',()=>{\n  const leg={market:'rushYds',side:'under',line:70,inclusive:true};\n  assert.equal(sportsbookLineForLeg(leg),70.5);\n  assert.equal(lineMatchesLeg(70.5,leg),true);\n});\n`);

console.log('Sportsbook hotfix applied.');
