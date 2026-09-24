const SNAPSHOT_BASE=String(process.env.SPORTS_OUTPOST_BASE_URL||'https://thesportsoutpost.com').replace(/\/$/,'');
const CACHE_MS=45_000;
const cache=new Map();
const SOURCES={NFL:'slates/nfl-odds.json',NBA:'slates/nba-odds.json',WNBA:'slates/wnba-odds.json',NCAAB:'slates/ncaab-odds.json',NHL:'slates/nhl-odds.json',MLB:'slates/mlb-odds.json'};

const finite=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[.'’]/g,'').replace(/\b(jr|sr|ii|iii|iv|v)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const compact=s=>norm(s).replace(/\s+/g,'');
const MLB_INTERNAL_MARKETS={
  homerun:'hr',hits:'hits',totalbases:'tb',rbi:'rbi',hrr:'hrr',stolenbases:'sb',runs:'runs',singles:'singles',doubles:'doubles',triples:'triples',walks:'walks',
  batterstrikeouts:'batterStrikeouts',hitsruns:'hitsRuns',hitsrbi:'hitsRbi',runsrbi:'runsRbi',extrabasehits:'extraBaseHits',
  pitcherstrikeouts:'pitcherStrikeouts',pitchingouts:'pitchingOuts',hitsallowed:'hitsAllowed',earnedruns:'earnedRuns',walksallowed:'walksAllowed',homerunsallowed:'homeRunsAllowed',pitcherwin:'pitcherWin'
};
function normBook(value){
  const raw=String(value||'').trim(),key=raw.toLowerCase().replace(/[^a-z0-9]/g,'');
  const map={draftkings:'DraftKings',dk:'DraftKings',fanduel:'FanDuel',fd:'FanDuel',bet365:'bet365','365':'bet365',caesars:'Caesars',williamhill:'Caesars',caesarssportsbook:'Caesars',thescorebet:'theScore Bet',thescore:'theScore Bet',betmgm:'BetMGM',mgm:'BetMGM',fanatics:'Fanatics',fanaticssportsbook:'Fanatics',espnbet:'ESPN BET',espn:'ESPN BET',hardrock:'Hard Rock',hardrockbet:'Hard Rock',betrivers:'BetRivers',pinnacle:'Pinnacle',parx:'Parx',bovada:'Bovada'};
  return map[key]||raw||null;
}
function sideOf(leg){const side=String(leg?.side||'over').toLowerCase();return side==='under'||side==='no'?'under':'over';}
function marketKey(leg){
  const key=compact(leg?.market||leg?.displayMarket||'');
  if(MLB_INTERNAL_MARKETS[key])return MLB_INTERNAL_MARKETS[key];
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
  if(/pitcherstrikeouts|pitcherks/.test(key))return 'pitcherStrikeouts';
  if(/totalbases|battertotalbases|\btb\b/.test(key))return 'tb';
  if(/stolenbases|batterstolenbases|\bsb\b/.test(key))return 'sb';
  if(/runsbattedin|batterrbis|\brbi/.test(key))return 'rbi';
  if(/homerun|batterhomeruns|\bhr\b/.test(key))return 'hr';
  if(/hitsrunsrbis|hitsrunsrbi/.test(key))return 'hrr';
  if(/hitsallowed/.test(key))return 'hitsAllowed';
  if(/earnedruns/.test(key))return 'earnedRuns';
  if(/pitchingouts|pitcherouts/.test(key))return 'pitchingOuts';
  if(/runs|battersrunsscored/.test(key))return 'runs';
  if(/hits/.test(key))return 'hits';
  if(/shotsongoal|sog/.test(key))return 'shots';
  if(/anytimegoal|atg/.test(key))return 'atg';
  return key;
}
function teamMatches(a,b){const x=compact(a),y=compact(b);return Boolean(x&&y&&(x===y||x.includes(y)||y.includes(x)));}
function sameEvent(row,leg){
  const ids=[row?.eventId,row?.gameId,row?.fixtureId,row?.gamePk,row?.game_pk,row?.providerEventId].filter(v=>v!=null&&String(v));
  const b=String(leg?.gameId||'');
  if(b&&ids.some(a=>String(a)===b))return true;
  const away=row?.awayTeam||row?.away?.abbr||row?.away?.name||row?.awayName||(typeof row?.away==='string'?row.away:'')||'';
  const home=row?.homeTeam||row?.home?.abbr||row?.home?.name||row?.homeName||(typeof row?.home==='string'?row.home:'')||'';
  const rowMatch=norm(`${away} @ ${home}`),legMatch=norm(leg?.matchup||'');
  if(rowMatch&&legMatch&&(rowMatch===legMatch||rowMatch.replace(/ at /g,' ')===legMatch.replace(/ at /g,' ')))return true;
  const rt=Date.parse(row?.commenceTime||row?.startDateUTC||row?.startTimeUTC||row?.startTime||''),lt=Date.parse(leg?.startTimeUTC||'');
  return Number.isFinite(rt)&&Number.isFinite(lt)&&Math.abs(rt-lt)<=20*60_000;
}
async function loadSnapshot(sport){
  const upper=String(sport||'').toUpperCase(),path=SOURCES[upper];if(!path)return null;
  const hit=cache.get(upper);if(hit&&Date.now()-hit.ts<CACHE_MS)return hit.value;
  try{
    const response=await fetch(`${SNAPSHOT_BASE}/${path}`,{headers:{accept:'application/json','user-agent':'ParlayPing/1.2'},cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!response.ok)return null;
    const value=await response.json();cache.set(upper,{ts:Date.now(),value});return value;
  }catch{return null;}
}
function pushAlt(out,book,row){
  const name=normBook(book),line=finite(row?.line),odds=finite(row?.oddsAmerican??row?.price??row?.odds);if(!name||line==null||odds==null)return;
  if(!out[name])out[name]=[];
  const side=String(row?.side||'').toLowerCase()||null;
  if(out[name].some(x=>x.line===line&&(x.side||null)===(side||null)))return;
  out[name].push({line,oddsAmerican:odds,probability:finite(row?.probability),side,selectionLink:row?.selectionLink||row?.link||null,sportsbook:name,snapshotTime:row?.snapshotTime||null,preserved:Boolean(row?.preserved)});
}
function binaryMarket(market){return ['atd','atg','hr','firstTd','pitcherWin'].includes(market);}
function parseRowSnapshot(doc,leg){
  const rows=Array.isArray(doc?.rows)?doc.rows:[];if(!rows.length)return null;
  const name=norm(leg.player),market=marketKey(leg),side=sideOf(leg),altLinesByBook={},bookOffers={};
  let preferred=null;
  const hits=rows.filter(row=>norm(row?.player)===name&&marketKey({market:row?.market||row?.marketKey})===market&&sameEvent(row,leg));
  for(const row of hits){
    const book=normBook(row.book||row.sportsbook);if(!book)continue;
    const line=finite(row.line),price=finite(side==='under'?row.underPrice:row.overPrice);
    if(line!=null&&price!=null)pushAlt(altLinesByBook,book,{line,oddsAmerican:price,side,snapshotTime:row.snapshotTime,preserved:row.preserved});
    const binaryMatch=binaryMarket(market)&&side==='over'&&(finite(leg.line)==null||Math.abs(Number(leg.line)-0.5)<1e-7);
    const exact=binaryMatch||(line!=null&&finite(leg.line)!=null&&Math.abs(line-Number(leg.line))<1e-7);
    if(exact&&price!=null){
      const offer={oddsAmerican:price,selectionLink:row.deepLink||row.selectionLink||null,betslipUrl:null,snapshotTime:row.snapshotTime||null,preserved:Boolean(row.preserved),priceKind:row.preserved?'last-verified-pregame':'verified-snapshot'};
      const existing=bookOffers[book];
      if(!existing||price>existing.oddsAmerican)bookOffers[book]={...(existing||{}),...offer};
      if(!preferred||price>preferred.oddsAmerican)preferred={sportsbook:book,oddsAmerican:price,sportsbookLink:offer.selectionLink,snapshotTime:offer.snapshotTime,preserved:offer.preserved};
    }
  }
  return Object.keys(bookOffers).length||Object.keys(altLinesByBook).length?{altLinesByBook,bookOffers,preferred}:null;
}
function allOffers(branch){
  if(!branch)return[];const rows=[];if(branch.best)rows.push(branch.best);if(Array.isArray(branch.all))rows.push(...branch.all);return rows;
}
function findNestedPlayer(doc,leg){
  const wanted=norm(leg.player);let fallback=null;
  for(const game of doc?.games||[]){
    const eventLike={eventId:game.eventId||game.id,gameId:game.gameId||null,providerEventId:game.fixtureId||null,commenceTime:game.commenceTime||game.startDateUTC||game.startTimeUTC||game.startTime,awayTeam:game.awayTeam||game.away?.abbr||game.away?.name||game.awayName||(typeof game.away==='string'?game.away:null),homeTeam:game.homeTeam||game.home?.abbr||game.home?.name||game.homeName||(typeof game.home==='string'?game.home:null)};
    if(!sameEvent(eventLike,leg))continue;
    for(const player of game.players||[]){if(norm(player?.name)!==wanted)continue;const hit={game,player};if(leg.team&&teamMatches(player?.team,leg.team))return hit;if(!fallback)fallback=hit;}
  }
  return fallback;
}
function parseNestedSnapshot(doc,leg){
  const hit=findNestedPlayer(doc,leg);if(!hit)return null;
  const market=marketKey(leg),slot=hit.player?.odds?.[market];if(!slot)return null;
  const side=sideOf(leg),altLinesByBook={},bookOffers={};let preferred=null;
  if(binaryMarket(market)&&side==='over'){
    const line=finite(leg.line)??0.5;
    const binarySide=String(leg?.side||'yes').toLowerCase()==='no'?'no':'yes';
    for(const offer of allOffers(slot)){
      const book=normBook(offer?.book||offer?.sportsbook),price=finite(offer?.price??offer?.oddsAmerican),selectionLink=offer?.link||offer?.deepLink||offer?.selectionLink||null;
      if(!book||price==null)continue;
      pushAlt(altLinesByBook,book,{line,oddsAmerican:price,side:binarySide,selectionLink});
      const existing=bookOffers[book];
      if(!existing||price>existing.oddsAmerican)bookOffers[book]={oddsAmerican:price,selectionLink,betslipUrl:null};
      if(!preferred||price>preferred.oddsAmerican)preferred={sportsbook:book,oddsAmerican:price,sportsbookLink:selectionLink};
    }
    return Object.keys(bookOffers).length?{altLinesByBook,bookOffers,preferred,gameId:String(hit.game?.gameId||''),startTimeUTC:hit.game?.startDateUTC||hit.game?.startTimeUTC||null}:null;
  }
  const source=Array.isArray(slot.alternates)&&slot.alternates.length?slot.alternates:(finite(slot.line)!=null?[{line:Number(slot.line),over:slot.over,under:slot.under}]:[]);
  for(const row of source){
    const line=finite(row?.line);if(line==null)continue;
    for(const offer of allOffers(row?.[side])){const book=normBook(offer?.book||offer?.sportsbook);const price=finite(offer?.price??offer?.oddsAmerican);if(!book||price==null)continue;pushAlt(altLinesByBook,book,{line,oddsAmerican:price,side,selectionLink:offer?.link||offer?.deepLink||null});const exact=finite(leg.line)!=null&&Math.abs(line-Number(leg.line))<1e-7;if(exact){const existing=bookOffers[book];if(!existing||price>existing.oddsAmerican)bookOffers[book]={oddsAmerican:price,selectionLink:offer?.link||offer?.deepLink||null,betslipUrl:null};if(!preferred||price>preferred.oddsAmerican)preferred={sportsbook:book,oddsAmerican:price,sportsbookLink:offer?.link||offer?.deepLink||null};}}
  }
  return Object.keys(bookOffers).length||Object.keys(altLinesByBook).length?{altLinesByBook,bookOffers,preferred,gameId:String(hit.game?.gameId||''),startTimeUTC:hit.game?.startDateUTC||hit.game?.startTimeUTC||null}:null;
}
function mlbGameMatches(game,leg){
  if(!game)return false;
  const gameId=String(game.gamePk||game.gameId||game.id||''),legId=String(leg?.gameId||'');
  if(gameId&&legId&&gameId===legId)return true;
  const eventLike={gamePk:gameId,startTimeUTC:game.startTimeUTC,away:game.away,home:game.home};
  if(sameEvent(eventLike,leg))return true;
  if(leg?.team&&(teamMatches(leg.team,game?.away?.name)||teamMatches(leg.team,game?.away?.abbr)||teamMatches(leg.team,game?.home?.name)||teamMatches(leg.team,game?.home?.abbr)))return true;
  return !legId&&!leg?.team&&!leg?.matchup&&!leg?.startTimeUTC;
}
function parseMlbPublicSlate(doc,leg){
  const games=Array.isArray(doc?.games)?doc.games:[];if(!games.length)return null;
  const wanted=norm(leg?.player),market=marketKey(leg);if(!wanted||sideOf(leg)==='under')return null;
  let found=null;
  for(const game of games){
    if(!mlbGameMatches(game,leg))continue;
    for(const side of ['away','home']){
      const team=game?.[side]||{};
      if(leg?.team&&!teamMatches(leg.team,team.name)&&!teamMatches(leg.team,team.abbr)&&!teamMatches(leg.team,team.abbreviation))continue;
      const player=(team.lineup||[]).find(row=>norm(row?.name)===wanted);
      if(player){found={game,team,side,player};break;}
    }
    if(found)break;
  }
  if(!found)return null;
  const slot=found.player?.odds?.[market];if(!slot)return null;
  const line=finite(slot.line)??(['hr'].includes(market)?0.5:null);if(line==null)return null;
  const offerRows=[];if(slot.best)offerRows.push(slot.best);if(Array.isArray(slot.all))offerRows.push(...slot.all);
  const seen=new Set(),altLinesByBook={},bookOffers={};let preferred=null;
  for(const offer of offerRows){
    const book=normBook(offer?.bookTitle||offer?.book||offer?.sportsbook),price=finite(offer?.price??offer?.oddsAmerican),selectionLink=offer?.link||offer?.deepLink||offer?.selectionLink||null;
    if(!book||price==null)continue;
    const dedupe=`${book}|${price}|${selectionLink||''}`;if(seen.has(dedupe))continue;seen.add(dedupe);
    const offerSide=market==='hr'?'yes':'over';
    pushAlt(altLinesByBook,book,{line,oddsAmerican:price,side:offerSide,selectionLink});
    bookOffers[book]={oddsAmerican:price,selectionLink,betslipUrl:null};
    if(!preferred||price>preferred.oddsAmerican)preferred={sportsbook:book,oddsAmerican:price,sportsbookLink:selectionLink};
  }
  if(!Object.keys(bookOffers).length)return null;
  return {altLinesByBook,bookOffers,preferred,gameId:String(found.game?.gamePk||found.game?.gameId||''),startTimeUTC:found.game?.startTimeUTC||null};
}
function mergeMaps(existing={},fresh={}){const out={...existing};for(const [key,value] of Object.entries(fresh||{})){if(Array.isArray(value)){out[key]=value;}else if(value&&typeof value==='object'){out[key]={...(out[key]||{}),...value};}else out[key]=value;}return out;}
async function enrichLeg(leg){
  const doc=await loadSnapshot(leg?.sport);if(!doc)return leg;
  const isMlb=String(leg?.sport||'').toUpperCase()==='MLB';
  const parsed=isMlb?(parseRowSnapshot(doc,leg)||parseMlbPublicSlate(doc,leg)):(parseRowSnapshot(doc,leg)||parseNestedSnapshot(doc,leg));if(!parsed)return leg;
  const preferred=parsed.preferred||null;
  return {
    ...leg,
    ...(preferred?{oddsAmerican:preferred.oddsAmerican,sportsbook:preferred.sportsbook,sportsbookLink:preferred.sportsbookLink||leg.sportsbookLink||null,oddsSnapshotTime:preferred.snapshotTime||leg.oddsSnapshotTime||null,oddsPreserved:Boolean(preferred.preserved)}:{}),
    gameId:leg.gameId||parsed.gameId||null,
    startTimeUTC:leg.startTimeUTC||parsed.startTimeUTC||null,
    bookOffers:mergeMaps(leg.bookOffers,parsed.bookOffers),
    altLinesByBook:mergeMaps(leg.altLinesByBook,parsed.altLinesByBook)
  };
}
async function enrichSportsbookMarkets(slip){
  const legs=Array.isArray(slip?.legs)?slip.legs:[];
  const enriched=await Promise.all(legs.map(enrichLeg));
  return {...slip,legs:enriched};
}
module.exports={enrichSportsbookMarkets,enrichLeg,loadSnapshot,parseRowSnapshot,parseNestedSnapshot,parseMlbPublicSlate,marketKey,normBook,mlbGameMatches,sameEvent};
