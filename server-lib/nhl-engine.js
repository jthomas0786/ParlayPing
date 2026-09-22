const OUTPOST_BASE = 'https://raw.githubusercontent.com/jthomas0786/The-Sports-Outpost/main/slates';
const ESPN_API = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl';
const CACHE_MS = 30_000;
const SUMMARY_CACHE_MS = 60_000;

const docCache = new Map();
const summaryCache = new Map();

const MARKET_META = {
  shotsOnGoal: { simKey:'sog', oddsKey:'sog', label:'SOG' },
  points: { simKey:'points', oddsKey:'points', label:'PTS' },
  assists: { simKey:'assists', oddsKey:'assists', label:'AST' },
  goals: { simKey:'goals', oddsKey:'atg', label:'GOALS' },
  anytimeGoal: { simKey:'goals', oddsKey:'atg', label:'ANYTIME GOAL', binary:true },
  blocks: { simKey:'blocks', oddsKey:'blocks', label:'BLOCKS' },
  saves: { simKey:'saves', oddsKey:'saves', label:'SAVES' }
};

function numeric(value){ const n=Number(value); return Number.isFinite(n)?n:null; }
function clamp(value,lo=0,hi=1){ return Math.max(lo,Math.min(hi,value)); }
function pct(value){ return Number.isFinite(value)?Math.round(value*1000)/10:null; }
function normName(value){
  return String(value||'').toLowerCase().normalize('NFKD')
    .replace(/[.'’]/g,'').replace(/\b(jr|sr|ii|iii|iv|v)\b/g,'')
    .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function easternDate(value=Date.now()){
  const date=value instanceof Date?value:new Date(value);
  const valid=Number.isFinite(date.getTime())?date:new Date();
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(valid);
}
function nearbyDateKeys(referenceTime){
  const base=new Date(referenceTime||Date.now());
  if(!Number.isFinite(base.getTime())) return [easternDate()];
  return [0,-1,1].map(offset=>easternDate(new Date(base.getTime()+offset*86400000))).filter((v,i,a)=>a.indexOf(v)===i);
}
async function fetchJson(url,allow404=false){
  const response=await fetch(url,{headers:{accept:'application/json','user-agent':'ParlayPing/0.6'},cache:'no-store'});
  if(allow404&&response.status===404)return null;
  if(!response.ok)throw new Error(`NHL data request failed (${response.status})`);
  return response.json();
}
async function cachedJson(key,url,ttl=CACHE_MS,allow404=false){
  const cached=docCache.get(key);
  if(cached&&Date.now()-cached.ts<ttl)return cached.value;
  const value=await fetchJson(url,allow404);
  docCache.set(key,{ts:Date.now(),value});
  return value;
}
async function loadOutpost(){
  const [slate,sim,odds]=await Promise.all([
    cachedJson('outpost-slate',`${OUTPOST_BASE}/nhl.json`),
    cachedJson('outpost-sim',`${OUTPOST_BASE}/nhl-sim.json`,CACHE_MS,true),
    cachedJson('outpost-odds',`${OUTPOST_BASE}/nhl-odds.json`,CACHE_MS,true)
  ]);
  return {slate,sim:sim||{games:[]},odds:odds||{quotes:[]}};
}
function scoreboardGames(doc){
  const out=[];
  for(const event of doc?.events||[]){
    const competition=event?.competitions?.[0]; if(!competition)continue;
    const side=homeAway=>{
      const row=competition.competitors?.find(c=>c.homeAway===homeAway);
      return row?{id:String(row.id||''),abbr:row.team?.abbreviation||'',name:row.team?.displayName||'',score:numeric(row.score)||0}:null;
    };
    const away=side('away'),home=side('home'); if(!away||!home)continue;
    const state=competition.status?.type?.state||event.status?.type?.state||'pre';
    out.push({id:String(event.id),startTime:event.date||null,away,home,status:state,detail:competition.status?.type?.shortDetail||event.status?.type?.shortDetail||'',players:[]});
  }
  return out;
}
async function loadScoreboard(dateKey){
  return cachedJson(`espn-board:${dateKey}`,`${ESPN_API}/scoreboard?dates=${String(dateKey).replaceAll('-','')}`,SUMMARY_CACHE_MS);
}
function parseSummaryPlayers(summary,game){
  const players=[];
  const statKeys={goals:'goals',assists:'assists',shotsTotal:'sog',blockedShots:'blocks',saves:'saves',timeOnIce:'toi'};
  for(const group of summary?.boxscore?.players||[]){
    const team=group.team?.abbreviation||'';
    for(const section of group.statistics||[]){
      for(const row of section.athletes||[]){
        const athlete=row.athlete||{},current={};
        for(const [i,key] of (section.keys||[]).entries()){
          const mapped=statKeys[key]; if(!mapped)continue;
          current[mapped]=mapped==='toi'?row.stats?.[i]:numeric(row.stats?.[i]);
        }
        if(current.goals!=null&&current.assists!=null)current.points=current.goals+current.assists;
        players.push({id:String(athlete.id||''),gameId:String(game.id),team,name:athlete.displayName||athlete.fullName||'Player',position:athlete.position?.abbreviation||'',current});
      }
    }
  }
  return players;
}
async function loadSummary(game){
  const key=String(game.id),cached=summaryCache.get(key);
  if(cached&&Date.now()-cached.ts<SUMMARY_CACHE_MS)return cached.value;
  const summary=await fetchJson(`${ESPN_API}/summary?event=${encodeURIComponent(key)}`);
  const value={...game,players:parseSummaryPlayers(summary,game)};
  summaryCache.set(key,{ts:Date.now(),value});
  return value;
}
function gameDistance(game,referenceTime){
  const start=Date.parse(game?.startTime||'');
  const ref=Date.parse(referenceTime||'');
  return Number.isFinite(start)&&Number.isFinite(ref)?Math.abs(start-ref):0;
}
function findPlayerInGames(games,leg,referenceTime){
  const candidates=[];
  for(const game of games||[]){
    for(const player of game.players||[]){
      if(normName(player?.name)!==normName(leg.player))continue;
      if(leg.team&&player.team&&String(leg.team).toUpperCase()!==String(player.team).toUpperCase())continue;
      candidates.push({game,player,distance:gameDistance(game,referenceTime)});
    }
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  return candidates[0]||null;
}
async function findEspnPlayer(leg,referenceTime){
  const boards=await Promise.all(nearbyDateKeys(referenceTime).map(async dateKey=>({dateKey,doc:await loadScoreboard(dateKey)})));
  const games=boards.flatMap(x=>scoreboardGames(x.doc)).sort((a,b)=>gameDistance(a,referenceTime)-gameDistance(b,referenceTime));
  for(const game of games){
    try{
      const hydrated=await loadSummary(game);
      const match=findPlayerInGames([hydrated],leg,referenceTime);
      if(match)return match;
    }catch(_){ }
  }
  return null;
}
function displayMarket(leg){
  const meta=MARKET_META[leg.market],label=meta?.label||leg.market||'PROP';
  if(leg.market==='anytimeGoal')return leg.side==='no'?'NO GOAL':'ANYTIME GOAL';
  const line=numeric(leg.line); if(line==null)return label;
  if(leg.inclusive&&leg.side!=='under')return `${line}+ ${label}`;
  return `${leg.side==='under'?'U':'O'}${line} ${label}`;
}
function targetForLeg(leg){
  if(leg.market==='anytimeGoal')return 1;
  const line=numeric(leg.line); if(line==null)return null;
  if(leg.side==='under')return line;
  if(leg.inclusive)return line;
  return Number.isInteger(line)?line+1:Math.floor(line)+1;
}
function currentForMarket(player,market){
  const current=player?.current||{};
  if(market==='anytimeGoal'||market==='goals')return numeric(current.goals)??0;
  if(market==='shotsOnGoal')return numeric(current.sog)??0;
  if(market==='points')return numeric(current.points)??((numeric(current.goals)??0)+(numeric(current.assists)??0));
  if(market==='assists')return numeric(current.assists)??0;
  if(market==='blocks')return numeric(current.blocks)??0;
  if(market==='saves')return numeric(current.saves)??0;
  return null;
}
function conditionMet(leg,current){
  if(!Number.isFinite(current))return false;
  if(leg.market==='anytimeGoal')return leg.side==='no'?current<1:current>=1;
  const line=numeric(leg.line); if(line==null)return false;
  if(leg.side==='under')return leg.inclusive?current<=line:current<line;
  return leg.inclusive?current>=line:current>line;
}
function settleStatus(leg,current,state){
  if(!Number.isFinite(current))return 'UNRESOLVED';
  const hit=conditionMet(leg,current);
  if(state==='post')return hit?'HIT':'MISS';
  if(state!=='in')return state==='pre'?'PENDING':'UNRESOLVED';
  if(leg.market==='anytimeGoal'){
    if(leg.side==='no')return current>=1?'MISS':'LIVE';
    return current>=1?'HIT':'LIVE';
  }
  if(leg.side==='under')return hit?'LIVE':'MISS';
  return hit?'HIT':'LIVE';
}
function distributionProbability(metric,leg){
  const rows=Array.isArray(metric?.distribution)?metric.distribution:[];
  if(!rows.length)return null;
  let probability=0;
  for(const row of rows){
    const value=numeric(row?.[0]),weight=numeric(row?.[1]);
    if(value==null||weight==null)continue;
    if(conditionMet(leg,value))probability+=weight;
  }
  return clamp(probability);
}
function simulationProbability(simGame,player,leg){
  if(!simGame?.ready)return null;
  const row=(simGame.players||[]).find(p=>String(p.id||'')===String(player.id||'')||(normName(p.name)===normName(player.name)&&String(p.team||'')===String(player.team||'')));
  const key=MARKET_META[leg.market]?.simKey;
  if(!row||!key)return null;
  return distributionProbability(row.metrics?.[key],leg);
}
function americanImplied(price){
  const p=numeric(price); if(p==null||p===0)return null;
  return p>0?100/(p+100):(-p)/((-p)+100);
}
function fairProbabilityFromQuote(quote,side){
  const over=americanImplied(quote?.over),under=americanImplied(quote?.under);
  if(side==='under'){
    if(under==null)return null;
    return over!=null?under/(over+under):under;
  }
  if(over==null)return null;
  return under!=null?over/(over+under):over;
}
function desiredOddsLine(leg){
  if(leg.market==='anytimeGoal')return 0.5;
  const line=numeric(leg.line); if(line==null)return null;
  if(leg.inclusive&&leg.side!=='under'&&Number.isInteger(line))return line-0.5;
  if(leg.inclusive&&leg.side==='under'&&Number.isInteger(line))return line+0.5;
  return line;
}
function quoteMatchesLeg(quote,leg){
  const key=MARKET_META[leg.market]?.oddsKey; if(!key||quote?.market!==key)return false;
  const desired=desiredOddsLine(leg),line=numeric(quote.line);
  return desired!=null&&line!=null&&Math.abs(desired-line)<1e-9;
}
function quoteProbability(odds,game,player,leg){
  const quotes=(odds?.quotes||[]).filter(q=>String(q.gameId)===String(game.id)&&String(q.playerId)===String(player.id)&&quoteMatchesLeg(q,leg));
  if(!quotes.length)return null;
  const side=leg.side==='under'?'under':'over';
  const values=quotes.map(q=>fairProbabilityFromQuote(q,side)).filter(Number.isFinite);
  return values.length?Math.max(...values):null;
}
function marketOptions(odds,game,player,leg){
  const key=MARKET_META[leg.market]?.oddsKey; if(!key)return [];
  const side=leg.side==='under'?'under':'over';
  const best=new Map();
  for(const quote of odds?.quotes||[]){
    if(String(quote.gameId)!==String(game.id)||String(quote.playerId)!==String(player.id)||quote.market!==key)continue;
    const line=numeric(quote.line); if(line==null)continue;
    const probability=fairProbabilityFromQuote(quote,side); if(!Number.isFinite(probability))continue;
    const displayLine=side==='over'&&Number.isInteger(line+0.5)?line+0.5:line;
    const option={line:displayLine,probability,price:side==='under'?numeric(quote.under):numeric(quote.over),book:quote.book||null};
    const existing=best.get(displayLine);
    if(!existing||probability>existing.probability)best.set(displayLine,option);
  }
  return [...best.values()].sort((a,b)=>b.probability-a.probability);
}
function normalizeState(value){
  const state=String(value||'').toLowerCase();
  if(state==='post'||/final|complete/.test(state))return 'post';
  if(state==='in'||/progress|live/.test(state))return 'in';
  if(state==='pre'||/scheduled|pregame/.test(state))return 'pre';
  return 'unknown';
}
function matchup(game){return `${game?.away?.abbr||game?.away?.name||''} @ ${game?.home?.abbr||game?.home?.name||''}`.trim();}

async function analyzeNhlSlip(rawLegs,options={}){
  const legs=(Array.isArray(rawLegs)?rawLegs:[]).filter(l=>String(l.sport||'').toUpperCase()==='NHL').slice(0,20);
  if(!legs.length)throw new Error('No NHL legs were provided.');
  const referenceTime=options.referenceTime||new Date().toISOString();
  const {slate,sim,odds}=await loadOutpost();
  const results=[];

  for(let i=0;i<legs.length;i++){
    const leg={...legs[i],id:legs[i].id||`nhl-${i+1}`,sport:'NHL'};
    if(!MARKET_META[leg.market]){
      results.push({...leg,status:'UNRESOLVED',resolutionReason:'unsupported-nhl-market',displayMarket:displayMarket(leg),probability:null,current:null,target:targetForLeg(leg),marketOptions:[]});
      continue;
    }
    let match=findPlayerInGames(slate?.games||[],leg,referenceTime);
    let source='sports-outpost';
    if(!match){
      match=await findEspnPlayer(leg,referenceTime);
      source='espn-history';
    }
    if(!match){
      results.push({...leg,status:'UNRESOLVED',resolutionReason:'nhl-player-not-found-near-reference-date',displayMarket:displayMarket(leg),probability:null,current:null,target:targetForLeg(leg),marketOptions:[]});
      continue;
    }
    const {game,player}=match;
    let hydratedGame=game;
    const state=normalizeState(game.status);
    if(source==='sports-outpost'&&['in','post'].includes(state)&&(!player.current||Object.keys(player.current).length===0)){
      try{ hydratedGame=await loadSummary(game); }catch(_){ }
    }
    const resolvedPlayer=(hydratedGame.players||[]).find(p=>String(p.id||'')===String(player.id||''))||player;
    const resolvedState=normalizeState(hydratedGame.status);
    const current=currentForMarket(resolvedPlayer,leg.market);
    const simGame=(sim?.games||[]).find(g=>String(g.gameId)===String(game.id));
    const simProbability=simulationProbability(simGame,resolvedPlayer,leg);
    const oddsProbability=quoteProbability(odds,game,resolvedPlayer,leg);
    const probability=simProbability??oddsProbability;
    const status=settleStatus(leg,current,resolvedState);
    const method=simProbability!=null?'sports-outpost-nhl-full-game-simulation':oddsProbability!=null?'sportsbook-implied-devigged':null;
    results.push({
      ...leg,
      gameId:String(game.id),
      matchup:matchup(game),
      startTimeUTC:game.startTime||null,
      gameState:resolvedState,
      status,
      resolutionReason:status==='UNRESOLVED'?'nhl-current-stat-or-game-state-unavailable':undefined,
      displayMarket:displayMarket(leg),
      current,
      target:targetForLeg(leg),
      probability:status==='HIT'?1:status==='MISS'?0:probability,
      probabilityPct:status==='HIT'?100:status==='MISS'?0:pct(probability),
      probabilityMethod:method,
      marketOptions:resolvedState==='pre'?marketOptions(odds,game,resolvedPlayer,leg):[]
    });
  }

  const generatedTimes=[slate?.generatedAt,sim?.generatedAt,odds?.generatedAt].map(Date.parse).filter(Number.isFinite);
  return {
    ok:true,
    generatedAt:new Date().toISOString(),
    dataGeneratedAt:generatedTimes.length?new Date(Math.max(...generatedTimes)).toISOString():null,
    source:'The Sports Outpost NHL model/odds + ESPN NHL live/final box scores',
    results,
    counts:{
      hit:results.filter(r=>r.status==='HIT').length,
      miss:results.filter(r=>r.status==='MISS').length,
      live:results.filter(r=>r.status==='LIVE').length,
      pending:results.filter(r=>r.status==='PENDING').length,
      unresolved:results.filter(r=>r.status==='UNRESOLVED').length
    }
  };
}

module.exports={
  analyzeNhlSlip, MARKET_META, displayMarket, targetForLeg, currentForMarket,
  conditionMet, settleStatus, distributionProbability, fairProbabilityFromQuote,
  desiredOddsLine, normalizeState
};
