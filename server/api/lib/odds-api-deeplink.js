const { loadSnapshot, marketKey, normBook } = require('./sportsbook-enrich');

const API_BASE='https://api.the-odds-api.com/v4';
const EVENT_CACHE_MS=5*60_000;
const ODDS_CACHE_MS=90_000;
const eventCache=new Map();
const oddsCache=new Map();

const SPORT_KEYS={
  NFL:'americanfootball_nfl',
  NBA:'basketball_nba',
  WNBA:'basketball_wnba',
  NCAAB:'basketball_ncaab',
  NHL:'icehockey_nhl',
  MLB:'baseball_mlb'
};
const BOOK_KEYS={FanDuel:'fanduel',DraftKings:'draftkings'};
const MARKET_KEYS={
  passYds:'player_pass_yds',rushYds:'player_rush_yds',recYds:'player_reception_yds',receptions:'player_receptions',passTds:'player_pass_tds',completions:'player_pass_completions',atd:'player_anytime_td',firstTd:'player_1st_td',
  points:'player_points',rebounds:'player_rebounds',assists:'player_assists',threes:'player_threes',ptsAsts:'player_points_assists',ptsRebs:'player_points_rebounds',rebsAsts:'player_rebounds_assists',pra:'player_points_rebounds_assists',blocks:'player_blocks',steals:'player_steals',turnovers:'player_turnovers',doubleDouble:'player_double_double',tripleDouble:'player_triple_double',
  hr:'batter_home_runs',hits:'batter_hits',tb:'batter_total_bases',rbi:'batter_rbis',hrr:'batter_hits_runs_rbis',sb:'batter_stolen_bases',runs:'batter_runs_scored',singles:'batter_singles',doubles:'batter_doubles',triples:'batter_triples',walks:'batter_walks',batterStrikeouts:'batter_strikeouts',pitcherStrikeouts:'pitcher_strikeouts',pitchingOuts:'pitcher_outs',hitsAllowed:'pitcher_hits_allowed',earnedRuns:'pitcher_earned_runs',walksAllowed:'pitcher_walks',pitcherWin:'pitcher_record_a_win',
  shots:'player_shots_on_goal',atg:'player_goal_scorer_anytime',goals:'player_goals',saves:'player_total_saves',blockedShots:'player_blocked_shots',powerPlayPoints:'player_power_play_points'
};
const ALTERNATE_MARKETS=new Set([
  'player_pass_yds','player_rush_yds','player_reception_yds','player_receptions','player_pass_tds','player_pass_completions',
  'player_points','player_rebounds','player_assists','player_threes','player_points_assists','player_points_rebounds','player_rebounds_assists','player_points_rebounds_assists','player_blocks','player_steals','player_turnovers',
  'batter_home_runs','batter_hits','batter_total_bases','batter_rbis','batter_hits_runs_rbis','batter_runs_scored','batter_singles','batter_doubles','batter_triples','batter_walks','batter_strikeouts','pitcher_strikeouts','pitcher_outs','pitcher_hits_allowed','pitcher_walks','pitcher_earned_runs',
  'player_points','player_assists','player_goals','player_shots_on_goal','player_blocked_shots','player_total_saves','player_power_play_points'
]);
const BINARY_MARKETS=new Set(['player_anytime_td','player_1st_td','player_double_double','player_triple_double','pitcher_record_a_win','player_goal_scorer_anytime']);

const finite=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[.'’]/g,'').replace(/\b(jr|sr|ii|iii|iv|v)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const compact=s=>norm(s).replace(/\s+/g,'');
const safeHttps=value=>{try{const u=new URL(String(value||''));return u.protocol==='https:'?u:null;}catch{return null;}};

function sportKey(value){return SPORT_KEYS[String(value||'').toUpperCase()]||null;}
function bookKey(value){return BOOK_KEYS[normBook(value)]||null;}
function internalMarket(leg){
  const raw=compact(leg?.market||leg?.displayMarket||'');
  if(/^(pra|ptsrebsasts|pointsreboundsassists)$/.test(raw))return 'pra';
  if(/doubledouble/.test(raw))return 'doubleDouble';
  if(/tripledouble/.test(raw))return 'tripleDouble';
  if(/blockedshots/.test(raw))return 'blockedShots';
  if(/powerplaypoints/.test(raw))return 'powerPlayPoints';
  if(/totalsaves|saves/.test(raw))return 'saves';
  if(/goals/.test(raw)&&String(leg?.sport||'').toUpperCase()==='NHL')return 'goals';
  return marketKey(leg);
}
function marketCandidates(leg){
  const base=MARKET_KEYS[internalMarket(leg)]||null;
  if(!base)return[];
  return ALTERNATE_MARKETS.has(base)?[base,`${base}_alternate`]:[base];
}
function desiredOutcomeName(leg,market){
  const raw=String(leg?.side||leg?.selection||'').toLowerCase();
  if(BINARY_MARKETS.has(market))return raw==='no'||raw==='under'?'No':'Yes';
  return raw==='under'||raw==='no'?'Under':'Over';
}
function pointCandidates(leg){
  const line=finite(leg?.line);if(line==null)return[];
  const out=[line];
  if(Number.isInteger(line)){
    const side=String(leg?.side||'over').toLowerCase();
    if(side==='under'||side==='no')out.push(line+0.5,line-0.5);
    else out.push(line-0.5,line+0.5);
  }
  return [...new Set(out)];
}
function parseMatchup(value){
  const raw=String(value||'').trim();if(!raw)return{};
  const parts=raw.split(/\s+(?:@|at|vs\.?|v\.?)+\s+/i);
  return parts.length===2?{awayTeam:parts[0].trim(),homeTeam:parts[1].trim()}:{};
}
function snapshotEventContext(doc,leg){
  const gameId=String(leg?.gameId||'');
  const preview=Array.isArray(doc?.meta?.eventPreview)?doc.meta.eventPreview:[];
  let hit=gameId?preview.find(row=>String(row?.eventId||row?.gameId||'')===gameId):null;
  if(!hit&&gameId&&Array.isArray(doc?.rows))hit=doc.rows.find(row=>String(row?.eventId||row?.gameId||'')===gameId)||null;
  if(!hit&&gameId&&Array.isArray(doc?.games))hit=doc.games.find(row=>String(row?.eventId||row?.gameId||row?.gamePk||row?.id||'')===gameId)||null;
  if(!hit)return null;
  return {
    awayTeam:hit.awayTeam||hit.away?.name||hit.away?.abbr||null,
    homeTeam:hit.homeTeam||hit.home?.name||hit.home?.abbr||null,
    commenceTime:hit.commenceTime||hit.startTimeUTC||hit.startTime||null
  };
}
async function eventContext(leg){
  let snapshot=null;
  try{snapshot=snapshotEventContext(await loadSnapshot(leg?.sport),leg);}catch{}
  const matchup=parseMatchup(leg?.matchup);
  return {
    awayTeam:snapshot?.awayTeam||matchup.awayTeam||null,
    homeTeam:snapshot?.homeTeam||matchup.homeTeam||null,
    commenceTime:snapshot?.commenceTime||leg?.startTimeUTC||null
  };
}
function eventScore(event,ctx){
  let score=0,teamSignals=0;
  const ea=norm(event?.away_team),eh=norm(event?.home_team),ca=norm(ctx?.awayTeam),ch=norm(ctx?.homeTeam);
  if(ca&&ea){if(ca===ea){score+=70;teamSignals++;}else if(ca.includes(ea)||ea.includes(ca)){score+=35;teamSignals++;}}
  if(ch&&eh){if(ch===eh){score+=70;teamSignals++;}else if(ch.includes(eh)||eh.includes(ch)){score+=35;teamSignals++;}}
  const et=Date.parse(event?.commence_time||''),ct=Date.parse(ctx?.commenceTime||'');
  if(Number.isFinite(et)&&Number.isFinite(ct)){
    const diff=Math.abs(et-ct);
    if(diff<=5*60_000)score+=45;else if(diff<=30*60_000)score+=30;else if(diff<=2*60*60_000)score+=10;else score-=30;
  }
  if(teamSignals===2)score+=25;
  return score;
}
function matchEvent(events,ctx){
  const ranked=(Array.isArray(events)?events:[]).map(event=>({event,score:eventScore(event,ctx)})).sort((a,b)=>b.score-a.score);
  if(!ranked.length||ranked[0].score<70)return null;
  if(ranked[1]&&ranked[0].score===ranked[1].score)return null;
  return ranked[0].event;
}
function extractSelectionIds(link,outcome){
  const url=safeHttps(link);if(!url)return{marketId:null,selectionId:outcome?.sid?String(outcome.sid):null};
  let marketId=url.searchParams.get('marketId'),selectionId=url.searchParams.get('selectionId');
  if(!marketId||!selectionId){
    for(const [key,value] of url.searchParams.entries()){
      if(!marketId&&/^marketId(?:\[\d+\])?$/i.test(key))marketId=value;
      if(!selectionId&&/^selectionId(?:\[\d+\])?$/i.test(key))selectionId=value;
    }
  }
  return{marketId:marketId||null,selectionId:selectionId||outcome?.sid||null};
}
function findOutcome(doc,book,leg){
  const apiBook=bookKey(book);if(!apiBook)return null;
  const bookmaker=(doc?.bookmakers||[]).find(row=>String(row?.key||'').toLowerCase()===apiBook);if(!bookmaker)return null;
  const wantedPlayer=norm(leg?.player),candidates=marketCandidates(leg),points=pointCandidates(leg);
  let best=null;
  for(const market of bookmaker.markets||[]){
    const marketIndex=candidates.indexOf(market?.key);if(marketIndex<0)continue;
    const binary=BINARY_MARKETS.has(market.key),wantedName=desiredOutcomeName(leg,market.key);
    for(const outcome of market.outcomes||[]){
      const playerName=norm(outcome?.description||((!['over','under','yes','no'].includes(String(outcome?.name||'').toLowerCase()))?outcome?.name:''));
      if(!wantedPlayer||playerName!==wantedPlayer)continue;
      const rawName=String(outcome?.name||'').toLowerCase();
      if(['over','under','yes','no'].includes(rawName)&&rawName!==wantedName.toLowerCase())continue;
      let score=100-marketIndex*3;
      const point=finite(outcome?.point);
      if(!binary&&points.length){
        const pointIndex=points.findIndex(value=>point!=null&&Math.abs(value-point)<1e-7);
        if(pointIndex<0)continue;
        score+=30-pointIndex*5;
      }
      const link=safeHttps(outcome?.link)?.toString()||null;
      const ids=extractSelectionIds(link,outcome);
      const row={marketKey:market.key,player:outcome.description||leg.player,side:wantedName,line:point,price:finite(outcome.price),selectionLink:link,selectionId:ids.selectionId,marketId:ids.marketId,eventSid:bookmaker.sid||null,marketSid:market.sid||null,score};
      if(!best||row.score>best.score)best=row;
    }
  }
  return best;
}
function composeFanDuel(selections){
  if(!selections.length||selections.some(row=>!row?.marketId||!row?.selectionId))return null;
  const unique=new Set(selections.map(row=>`${row.marketId}|${row.selectionId}`));if(unique.size!==selections.length)return null;
  const parts=[];selections.forEach((row,index)=>{parts.push(`marketId%5B${index}%5D=${encodeURIComponent(row.marketId)}`);parts.push(`selectionId%5B${index}%5D=${encodeURIComponent(row.selectionId)}`);});
  return `https://account.sportsbook.fanduel.com/sportsbook/addToBetslip?${parts.join('&')}`;
}
function composeDraftKings(selections){
  const outcomes=[];
  for(const row of selections){
    const url=safeHttps(row?.selectionLink),raw=url?.searchParams?.get('outcomes');
    if(!raw)return null;
    const values=raw.split(/[ +,]/).map(x=>x.trim()).filter(Boolean);if(values.length!==1)return null;
    outcomes.push(values[0]);
  }
  if(new Set(outcomes).size!==selections.length)return null;
  return `https://sportsbook.draftkings.com/?outcomes=${outcomes.map(encodeURIComponent).join('+')}`;
}
function composeBetslip(book,selections){const normalized=normBook(book);if(normalized==='FanDuel')return composeFanDuel(selections);if(normalized==='DraftKings')return composeDraftKings(selections);return selections.length===1?selections[0]?.selectionLink||null:null;}
function readUsage(response){
  const num=name=>{const value=Number(response?.headers?.get?.(name));return Number.isFinite(value)?value:null;};
  return{remaining:num('x-requests-remaining'),used:num('x-requests-used'),last:num('x-requests-last')};
}
async function fetchJson(url,{fetchImpl=fetch,timeoutMs=6500}={}){
  const response=await fetchImpl(url,{headers:{accept:'application/json','user-agent':'ParlayPing/1.3'},cache:'no-store',signal:AbortSignal.timeout(timeoutMs)});
  let data=null;try{data=await response.json();}catch{}
  if(!response.ok){const error=new Error(data?.message||data?.error||`The Odds API returned ${response.status}.`);error.status=response.status;error.data=data;throw error;}
  return{data,response};
}
async function getEvents(sport,apiKey,fetchImpl){
  const key=sportKey(sport);if(!key)return[];
  const cacheKey=key,hit=eventCache.get(cacheKey);if(hit&&Date.now()-hit.ts<EVENT_CACHE_MS)return hit.data;
  const url=new URL(`${API_BASE}/sports/${encodeURIComponent(key)}/events`);url.searchParams.set('apiKey',apiKey);
  const {data}=await fetchJson(url,{fetchImpl});
  const rows=Array.isArray(data)?data:[];eventCache.set(cacheKey,{ts:Date.now(),data:rows});return rows;
}
async function getEventOdds({sport,eventId,book,markets,apiKey,fetchImpl}){
  const sKey=sportKey(sport),bKey=bookKey(book);if(!sKey||!bKey)throw new Error('Unsupported sportsbook or sport for exact deeplink resolution.');
  const marketList=[...new Set(markets)].sort(),cacheKey=`${sKey}|${eventId}|${bKey}|${marketList.join(',')}`;
  const hit=oddsCache.get(cacheKey);if(hit&&Date.now()-hit.ts<ODDS_CACHE_MS)return hit.value;
  const url=new URL(`${API_BASE}/sports/${encodeURIComponent(sKey)}/events/${encodeURIComponent(eventId)}/odds`);
  url.searchParams.set('apiKey',apiKey);url.searchParams.set('bookmakers',bKey);url.searchParams.set('markets',marketList.join(','));url.searchParams.set('oddsFormat','american');url.searchParams.set('includeLinks','true');url.searchParams.set('includeSids','true');
  const {data,response}=await fetchJson(url,{fetchImpl});
  const value={data,usage:readUsage(response)};oddsCache.set(cacheKey,{ts:Date.now(),value});return value;
}
async function resolveSportsbookBetslip({book,legs,apiKey=process.env.ODDS_API_KEY,fetchImpl=fetch}={}){
  const normalizedBook=normBook(book);if(!BOOK_KEYS[normalizedBook])throw new Error('Exact deeplink enrichment currently supports FanDuel and DraftKings.');
  if(!apiKey)throw new Error('ODDS_API_KEY is not configured.');
  const rows=Array.isArray(legs)?legs.slice(0,25):[];if(!rows.length)throw new Error('At least one betslip leg is required.');
  const working=[];
  const sports=[...new Set(rows.map(row=>String(row?.sport||'').toUpperCase()).filter(Boolean))];
  for(const sport of sports){
    const events=await getEvents(sport,apiKey,fetchImpl);
    for(const [index,leg] of rows.entries()){
      if(String(leg?.sport||'').toUpperCase()!==sport)continue;
      const ctx=await eventContext(leg),event=matchEvent(events,ctx);
      working[index]={index,leg,sport,ctx,event,markets:marketCandidates(leg)};
    }
  }
  const groups=new Map();
  for(const row of working){
    if(!row?.event||!row.markets.length)continue;
    const key=`${row.sport}|${row.event.id}`;if(!groups.has(key))groups.set(key,{sport:row.sport,eventId:row.event.id,rows:[],markets:new Set()});
    const group=groups.get(key);group.rows.push(row);row.markets.forEach(m=>group.markets.add(m));
  }
  const selections=new Array(rows.length).fill(null),usage=[];
  for(const group of groups.values()){
    const result=await getEventOdds({sport:group.sport,eventId:group.eventId,book:normalizedBook,markets:[...group.markets],apiKey,fetchImpl});
    if(result.usage)usage.push(result.usage);
    for(const row of group.rows){const selected=findOutcome(result.data,normalizedBook,row.leg);if(selected)selections[row.index]={index:row.index,eventId:group.eventId,...selected};}
  }
  const exact=selections.every(Boolean),url=exact?composeBetslip(normalizedBook,selections):null;
  return{book:normalizedBook,exact:Boolean(exact&&url),url:url||null,selections,usage};
}

module.exports={sportKey,bookKey,internalMarket,marketCandidates,desiredOutcomeName,pointCandidates,snapshotEventContext,eventScore,matchEvent,findOutcome,extractSelectionIds,composeFanDuel,composeDraftKings,composeBetslip,resolveSportsbookBetslip};
