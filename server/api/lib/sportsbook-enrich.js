const SNAPSHOT_BASE=String(process.env.SPORTS_OUTPOST_BASE_URL||'https://thesportsoutpost.com').replace(/\/$/,'');
const CACHE_MS=45_000;
const cache=new Map();
const FILES={NFL:'nfl-odds.json',NBA:'nba-odds.json',WNBA:'wnba-odds.json',NCAAB:'ncaab-odds.json',NHL:'nhl-odds.json',MLB:'mlb-odds.json'};

const finite=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const norm=s=>String(s||'').toLowerCase().replace(/[.'’]/g,'').replace(/\b(jr|sr|ii|iii|iv|v)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const compact=s=>norm(s).replace(/\s+/g,'');
function normBook(value){
  const raw=String(value||'').trim(),key=raw.toLowerCase().replace(/[^a-z0-9]/g,'');
  const map={draftkings:'DraftKings',dk:'DraftKings',fanduel:'FanDuel',fd:'FanDuel',bet365:'bet365','365':'bet365',caesars:'Caesars',williamhill:'Caesars',caesarssportsbook:'Caesars',thescorebet:'theScore Bet',thescore:'theScore Bet',betmgm:'BetMGM',mgm:'BetMGM',fanatics:'Fanatics',fanaticssportsbook:'Fanatics'};
  return map[key]||raw||null;
}
function sideOf(leg){const side=String(leg?.side||'over').toLowerCase();return side==='under'||side==='no'?'under':'over';}
function marketKey(leg){
  const key=compact(leg?.market||leg?.displayMarket||'');
  if(/passingyards|passyards|passyds/.test(key))return 'passYds';
  if(/rushingyards|rushyards|rushyds/.test(key))return 'rushYds';
  if(/receivingyards|recyards|recyds/.test(key))return 'recYds';
  if(/receptions|catches/.test(key))return 'receptions';
  if(/passingtouchdowns|passingtds|passtds/.test(key))return 'passTds';
  if(/completions/.test(key))return 'completions';
  if(/anytimetouchdown|atd/.test(key))return 'atd';
  if(/firsttouchdown|firsttd/.test(key))return 'firstTd';
  if(/rebounds/.test(key))return 'rebounds';
  if(/assists/.test(key))return 'assists';
  if(/three|3pt|threes/.test(key))return 'threes';
  if(/pointsassists|ptsasts/.test(key))return 'ptsAsts';
  if(/pointsrebounds|ptsrebs/.test(key))return 'ptsRebs';
  if(/reboundsassists|rebsasts/.test(key))return 'rebsAsts';
  if(/points/.test(key))return 'points';
  if(/strikeouts|pitcherks/.test(key))return 'strikeouts';
  if(/hits/.test(key))return 'hits';
  if(/homerun|hr/.test(key))return 'hr';
  if(/shotsongoal|sog/.test(key))return 'shots';
  if(/anytimegoal|atg/.test(key))return 'atg';
  return key;
}
function sameEvent(row,leg){
  const a=String(row?.eventId||row?.gameId||row?.game_pk||''),b=String(leg?.gameId||'');
  if(a&&b&&a===b)return true;
  const rowMatch=norm(`${row?.awayTeam||row?.away?.abbr||row?.away?.name||''} @ ${row?.homeTeam||row?.home?.abbr||row?.home?.name||''}`),legMatch=norm(leg?.matchup||'');
  if(rowMatch&&legMatch&&rowMatch===legMatch)return true;
  const rt=Date.parse(row?.commenceTime||row?.startTimeUTC||row?.startTime||''),lt=Date.parse(leg?.startTimeUTC||'');
  return Number.isFinite(rt)&&Number.isFinite(lt)&&Math.abs(rt-lt)<=8*3600_000;
}
async function loadSnapshot(sport){
  const upper=String(sport||'').toUpperCase(),file=FILES[upper];if(!file)return null;
  const hit=cache.get(upper);if(hit&&Date.now()-hit.ts<CACHE_MS)return hit.value;
  try{
    const response=await fetch(`${SNAPSHOT_BASE}/slates/${file}`,{headers:{accept:'application/json','user-agent':'ParlayPing/1.0'},cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!response.ok)return null;
    const value=await response.json();cache.set(upper,{ts:Date.now(),value});return value;
  }catch{return null;}
}
function pushAlt(out,book,row){
  const name=normBook(book),line=finite(row?.line),odds=finite(row?.oddsAmerican??row?.price??row?.odds);if(!name||line==null||odds==null)return;
  if(!out[name])out[name]=[];
  const side=String(row?.side||'').toLowerCase()||null;
  if(out[name].some(x=>x.line===line&&(x.side||null)===(side||null)))return;
  out[name].push({line,oddsAmerican:odds,probability:finite(row?.probability),side,selectionLink:row?.selectionLink||row?.link||null,sportsbook:name});
}
function parseRowSnapshot(doc,leg){
  const rows=Array.isArray(doc?.rows)?doc.rows:[];if(!rows.length)return null;
  const name=norm(leg.player),market=marketKey(leg),side=sideOf(leg),altLinesByBook={},bookOffers={};
  const hits=rows.filter(row=>norm(row?.player)===name&&marketKey({market:row?.market||row?.marketKey})===market&&sameEvent(row,leg));
  for(const row of hits){
    const book=normBook(row.book||row.sportsbook);if(!book)continue;
    const line=finite(row.line),price=finite(side==='under'?row.underPrice:row.overPrice);
    if(line!=null&&price!=null)pushAlt(altLinesByBook,book,{line,oddsAmerican:price,side});
    if(line!=null&&finite(leg.line)!=null&&Math.abs(line-Number(leg.line))<1e-7&&price!=null)bookOffers[book]={...(bookOffers[book]||{}),oddsAmerican:price,selectionLink:row.deepLink||null,betslipUrl:null};
  }
  return {altLinesByBook,bookOffers};
}
function allOffers(branch){
  if(!branch)return[];const rows=[];if(branch.best)rows.push(branch.best);if(Array.isArray(branch.all))rows.push(...branch.all);return rows;
}
function findNestedPlayer(doc,leg){
  const wanted=norm(leg.player);let fallback=null;
  for(const game of doc?.games||[]){
    const eventLike={eventId:game.eventId||game.fixtureId||game.id,commenceTime:game.commenceTime||game.startTimeUTC||game.startTime,awayTeam:game.awayTeam||game.away?.abbr||game.away?.name,homeTeam:game.homeTeam||game.home?.abbr||game.home?.name};
    if(!sameEvent(eventLike,leg))continue;
    for(const player of game.players||[]){if(norm(player?.name)!==wanted)continue;const hit={game,player};if(leg.team&&compact(player?.team)===compact(leg.team))return hit;if(!fallback)fallback=hit;}
  }
  return fallback;
}
function parseNestedSnapshot(doc,leg){
  const hit=findNestedPlayer(doc,leg);if(!hit)return null;
  const slot=hit.player?.odds?.[marketKey(leg)];if(!slot)return null;
  const side=sideOf(leg),altLinesByBook={},bookOffers={};
  const source=Array.isArray(slot.alternates)&&slot.alternates.length?slot.alternates:(finite(slot.line)!=null?[{line:Number(slot.line),over:slot.over,under:slot.under}]:[]);
  for(const row of source){
    const line=finite(row?.line);if(line==null)continue;
    for(const offer of allOffers(row?.[side])){const book=normBook(offer?.book||offer?.sportsbook);const price=finite(offer?.price??offer?.oddsAmerican);if(!book||price==null)continue;pushAlt(altLinesByBook,book,{line,oddsAmerican:price,side,selectionLink:offer?.link||offer?.deepLink||null});if(finite(leg.line)!=null&&Math.abs(line-Number(leg.line))<1e-7)bookOffers[book]={oddsAmerican:price,selectionLink:offer?.link||offer?.deepLink||null,betslipUrl:null};}
  }
  return {altLinesByBook,bookOffers};
}
function mergeMaps(existing={},fresh={}){const out={...existing};for(const [key,value] of Object.entries(fresh||{})){if(Array.isArray(value)){out[key]=value;}else if(value&&typeof value==='object'){out[key]={...(out[key]||{}),...value};}else out[key]=value;}return out;}
async function enrichLeg(leg){
  const doc=await loadSnapshot(leg?.sport);if(!doc)return leg;
  const parsed=parseRowSnapshot(doc,leg)||parseNestedSnapshot(doc,leg);if(!parsed)return leg;
  return {...leg,bookOffers:mergeMaps(leg.bookOffers,parsed.bookOffers),altLinesByBook:mergeMaps(leg.altLinesByBook,parsed.altLinesByBook)};
}
async function enrichSportsbookMarkets(slip){
  const legs=Array.isArray(slip?.legs)?slip.legs:[];
  const enriched=await Promise.all(legs.map(enrichLeg));
  return {...slip,legs:enriched};
}
module.exports={enrichSportsbookMarkets,loadSnapshot,parseRowSnapshot,parseNestedSnapshot,marketKey,normBook};
