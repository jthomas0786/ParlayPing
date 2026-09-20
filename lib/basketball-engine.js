const OUTPOST_BASE = 'https://raw.githubusercontent.com/jthomas0786/The-Sports-Outpost/main/slates';
const CACHE_MS = 30_000;
const ESPN_CACHE_MS = 45_000;

const SPORT_CONFIG = {
  NBA: { odds:'nba-odds.json', espn:'basketball/nba' },
  NCAAB: { odds:'ncaab-odds.json', espn:'basketball/mens-college-basketball' },
  WNBA: { odds:'wnba-odds.json', espn:'basketball/wnba' }
};
const MARKET_META = {
  points: { label:'PTS' },
  rebounds: { label:'REB' },
  assists: { label:'AST' },
  threes: { label:'3PM' },
  steals: { label:'STL' },
  blocks: { label:'BLK' },
  turnovers: { label:'TO' },
  pra: { label:'PRA' },
  ptsRebs: { label:'PTS+REB' },
  ptsAsts: { label:'PTS+AST' },
  rebsAsts: { label:'REB+AST' },
  doubleDouble: { label:'DOUBLE DOUBLE', binary:true },
  tripleDouble: { label:'TRIPLE DOUBLE', binary:true }
};

const docCache = new Map();
const summaryCache = new Map();
const finite = v => Number.isFinite(Number(v)) ? Number(v) : null;
const clamp = v => Math.max(0,Math.min(1,v));
const pct = v => Number.isFinite(v) ? Math.round(v*1000)/10 : null;
function normName(value){
  return String(value||'').toLowerCase().normalize('NFKD').replace(/[.'’]/g,'').replace(/\b(jr|sr|ii|iii|iv|v)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function normTeam(value){ return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,''); }
function teamMatches(a,b){
  const x=normTeam(a),y=normTeam(b); if(!x||!y)return true;
  return x===y||x.includes(y)||y.includes(x);
}
async function fetchJson(url,allow404=false){
  const response=await fetch(url,{headers:{accept:'application/json','user-agent':'ParlayPing/0.7'},cache:'no-store'});
  if(allow404&&response.status===404)return null;
  if(!response.ok)throw new Error(`Basketball data request failed (${response.status})`);
  return response.json();
}
async function cachedJson(key,url,ttl=CACHE_MS,allow404=false){
  const cached=docCache.get(key); if(cached&&Date.now()-cached.ts<ttl)return cached.value;
  const value=await fetchJson(url,allow404); docCache.set(key,{ts:Date.now(),value}); return value;
}
async function loadOdds(sport){
  const cfg=SPORT_CONFIG[sport];
  return (await cachedJson(`odds:${sport}`,`${OUTPOST_BASE}/${cfg.odds}`,CACHE_MS,true))||{meta:{sport},rows:[]};
}
function utcDateKey(value){
  const d=new Date(value||Date.now()); const safe=Number.isFinite(d.getTime())?d:new Date();
  return safe.toISOString().slice(0,10).replaceAll('-','');
}
function nearbyDateKeys(referenceTime){
  const base=new Date(referenceTime||Date.now()); const safe=Number.isFinite(base.getTime())?base:new Date();
  return [-1,0,1].map(offset=>utcDateKey(new Date(safe.getTime()+offset*86400000))).filter((v,i,a)=>a.indexOf(v)===i);
}
function scoreboardGames(doc){
  const out=[];
  for(const event of doc?.events||[]){
    const competition=event?.competitions?.[0]; if(!competition)continue;
    const side=homeAway=>{
      const row=competition.competitors?.find(c=>c.homeAway===homeAway);
      return row?{id:String(row.id||''),abbr:row.team?.abbreviation||'',name:row.team?.displayName||row.team?.shortDisplayName||'',score:finite(row.score)??0}:null;
    };
    const away=side('away'),home=side('home'); if(!away||!home)continue;
    out.push({id:String(event.id),startTime:event.date||null,away,home,status:competition.status?.type?.state||event.status?.type?.state||'pre',detail:competition.status?.type?.shortDetail||event.status?.type?.shortDetail||'',players:[]});
  }
  return out;
}
async function loadScoreboard(sport,dateKey){
  const cfg=SPORT_CONFIG[sport];
  const url=`https://site.api.espn.com/apis/site/v2/sports/${cfg.espn}/scoreboard?dates=${dateKey}&limit=500`;
  return cachedJson(`board:${sport}:${dateKey}`,url,ESPN_CACHE_MS);
}
function parseMadeAttempt(value){
  const m=String(value??'').match(/^\s*(-?\d+(?:\.\d+)?)\s*[-/]\s*(-?\d+(?:\.\d+)?)/);
  return m?Number(m[1]):finite(value);
}
function statFromKey(key,value,current){
  const k=String(key||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(k==='points'||k==='pts')current.points=finite(value)??current.points;
  else if(k==='rebounds'||k==='totalrebounds'||k==='reb')current.rebounds=finite(value)??current.rebounds;
  else if(k==='assists'||k==='ast')current.assists=finite(value)??current.assists;
  else if(k==='steals'||k==='stl')current.steals=finite(value)??current.steals;
  else if(k==='blocks'||k==='blk')current.blocks=finite(value)??current.blocks;
  else if(k==='turnovers'||k==='to')current.turnovers=finite(value)??current.turnovers;
  else if(k.includes('threepointfieldgoalsmade')||k==='3pm'||k==='threepointersmade')current.threes=parseMadeAttempt(value)??current.threes;
}
function finalizeCurrent(current){
  const points=finite(current.points)??0,rebounds=finite(current.rebounds)??0,assists=finite(current.assists)??0,steals=finite(current.steals)??0,blocks=finite(current.blocks)??0;
  current.points=points;current.rebounds=rebounds;current.assists=assists;current.steals=steals;current.blocks=blocks;current.turnovers=finite(current.turnovers)??0;current.threes=finite(current.threes)??0;
  current.pra=points+rebounds+assists;current.ptsRebs=points+rebounds;current.ptsAsts=points+assists;current.rebsAsts=rebounds+assists;
  const tens=[points,rebounds,assists,steals,blocks].filter(v=>v>=10).length;
  current.doubleDouble=tens>=2?1:0;current.tripleDouble=tens>=3?1:0;
  return current;
}
function parseSummaryPlayers(summary,game){
  const players=[];
  for(const group of summary?.boxscore?.players||[]){
    const team=group.team?.abbreviation||group.team?.shortDisplayName||group.team?.displayName||'';
    for(const section of group.statistics||[]){
      const keys=section.keys||section.names||section.labels||[];
      for(const row of section.athletes||[]){
        const athlete=row.athlete||{},current={};
        for(let i=0;i<keys.length;i++)statFromKey(keys[i],row.stats?.[i],current);
        players.push({id:String(athlete.id||''),gameId:String(game.id),team,name:athlete.displayName||athlete.fullName||'Player',position:athlete.position?.abbreviation||'',current:finalizeCurrent(current)});
      }
    }
  }
  const deduped=new Map();
  for(const player of players){
    const key=`${normName(player.name)}|${normTeam(player.team)}`;
    const existing=deduped.get(key);
    if(!existing||Object.values(player.current).reduce((a,v)=>a+(Number.isFinite(v)?1:0),0)>Object.values(existing.current).reduce((a,v)=>a+(Number.isFinite(v)?1:0),0))deduped.set(key,player);
  }
  return [...deduped.values()];
}
async function loadSummary(sport,game){
  const key=`summary:${sport}:${game.id}`,cached=summaryCache.get(key); if(cached&&Date.now()-cached.ts<ESPN_CACHE_MS)return cached.value;
  const cfg=SPORT_CONFIG[sport];
  const summary=await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/${cfg.espn}/summary?event=${encodeURIComponent(game.id)}`);
  const value={...game,players:parseSummaryPlayers(summary,game)}; summaryCache.set(key,{ts:Date.now(),value}); return value;
}
function gameDistance(game,referenceTime){
  const start=Date.parse(game?.startTime||''),ref=Date.parse(referenceTime||''); return Number.isFinite(start)&&Number.isFinite(ref)?Math.abs(start-ref):0;
}
function gameHasTeam(game,team){
  if(!team)return true;
  return teamMatches(team,game?.away?.abbr)||teamMatches(team,game?.away?.name)||teamMatches(team,game?.home?.abbr)||teamMatches(team,game?.home?.name);
}
function oddsPlayerRows(odds,leg){ return (odds?.rows||[]).filter(r=>normName(r.player)===normName(leg.player)&&(!leg.team||!r.team||teamMatches(leg.team,r.team))); }
function inferredTeamFromOdds(odds,leg,referenceTime){
  const rows=oddsPlayerRows(odds,leg); if(!rows.length)return null;
  const ref=Date.parse(referenceTime||''); rows.sort((a,b)=>Math.abs(Date.parse(a.commenceTime||'')-ref)-Math.abs(Date.parse(b.commenceTime||'')-ref));
  return rows[0]?.team||null;
}
async function findEspnPlayer(sport,leg,referenceTime,odds){
  const docs=await Promise.all(nearbyDateKeys(referenceTime).map(dateKey=>loadScoreboard(sport,dateKey)));
  let games=docs.flatMap(scoreboardGames).sort((a,b)=>gameDistance(a,referenceTime)-gameDistance(b,referenceTime));
  const team=leg.team||inferredTeamFromOdds(odds,leg,referenceTime);
  if(team){const filtered=games.filter(g=>gameHasTeam(g,team));if(filtered.length)games=filtered;}
  else games=games.slice(0,40);
  for(const game of games){
    try{
      const hydrated=await loadSummary(sport,game);
      const player=hydrated.players.find(p=>normName(p.name)===normName(leg.player)&&(!team||teamMatches(team,p.team)));
      if(player)return {game:hydrated,player};
    }catch(_){ }
  }
  return null;
}
function displayMarket(leg){
  const meta=MARKET_META[leg.market],label=meta?.label||leg.market||'PROP';
  if(meta?.binary)return leg.side==='no'?`NO ${label}`:label;
  const line=finite(leg.line);if(line==null)return label;
  if(leg.inclusive&&leg.side!=='under')return `${line}+ ${label}`;
  return `${leg.side==='under'?'U':'O'}${line} ${label}`;
}
function targetForLeg(leg){
  if(MARKET_META[leg.market]?.binary)return 1;
  const line=finite(leg.line); if(line==null)return null;
  if(leg.side==='under')return line;
  if(leg.inclusive)return line;
  return Number.isInteger(line)?line+1:Math.floor(line)+1;
}
function currentForMarket(player,market){ return finite(player?.current?.[market]); }
function conditionMet(leg,current){
  if(!Number.isFinite(current))return false;
  if(MARKET_META[leg.market]?.binary)return leg.side==='no'?current<1:current>=1;
  const line=finite(leg.line);if(line==null)return false;
  if(leg.side==='under')return leg.inclusive?current<=line:current<line;
  return leg.inclusive?current>=line:current>line;
}
function normalizeState(value){
  const state=String(value||'').toLowerCase();
  if(state==='post'||/final|complete/.test(state))return 'post';
  if(state==='in'||/progress|live/.test(state))return 'in';
  if(state==='pre'||/scheduled|pregame/.test(state))return 'pre';
  return 'unknown';
}
function settleStatus(leg,current,state){
  if(state==='pre')return 'PENDING';
  if(!Number.isFinite(current))return 'UNRESOLVED';
  const hit=conditionMet(leg,current),binary=MARKET_META[leg.market]?.binary;
  if(state==='post')return hit?'HIT':'MISS';
  if(state!=='in')return 'UNRESOLVED';
  if(binary){if(leg.side==='no')return current>=1?'MISS':'LIVE';return current>=1?'HIT':'LIVE';}
  if(leg.side==='under')return hit?'LIVE':'MISS';
  return hit?'HIT':'LIVE';
}
function americanImplied(price){const p=finite(price);if(p==null||p===0)return null;return p>0?100/(p+100):(-p)/((-p)+100);}
function fairForRow(row,side){
  const over=finite(row?.overImplied)??americanImplied(row?.overPrice),under=finite(row?.underImplied)??americanImplied(row?.underPrice);
  if(side==='under'||side==='no'){if(under==null)return null;return over!=null?under/(over+under):under;}
  if(over==null)return null;return under!=null?over/(over+under):over;
}
function median(values){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function desiredOddsLine(leg){
  if(MARKET_META[leg.market]?.binary)return 0.5;
  const line=finite(leg.line);if(line==null)return null;
  if(leg.inclusive&&leg.side!=='under'&&Number.isInteger(line))return line-0.5;
  if(leg.inclusive&&leg.side==='under'&&Number.isInteger(line))return line+0.5;
  return line;
}
function matchingOddsRows(odds,match,leg){
  const desired=desiredOddsLine(leg),start=Date.parse(match?.game?.startTime||''),sideTeam=match?.player?.team;
  return oddsPlayerRows(odds,{...leg,team:leg.team||sideTeam}).filter(r=>{
    if(r.market!==leg.market)return false;
    const line=finite(r.line);if(desired!=null&&(line==null||Math.abs(line-desired)>1e-9))return false;
    const t=Date.parse(r.commenceTime||'');return !Number.isFinite(start)||!Number.isFinite(t)||Math.abs(t-start)<=8*3600_000;
  });
}
function quoteProbability(odds,match,leg){
  const rows=matchingOddsRows(odds,match,leg),side=(leg.side==='under'||leg.side==='no')?leg.side:'over';
  const probs=rows.map(r=>fairForRow(r,side)).filter(Number.isFinite);if(!probs.length)return {probability:null,method:null};
  const twoSided=rows.some(r=>(finite(r.overImplied)??americanImplied(r.overPrice))!=null&&(finite(r.underImplied)??americanImplied(r.underPrice))!=null);
  return {probability:clamp(median(probs)),method:twoSided?'sportsbook-devig-median':'sportsbook-implied-median'};
}
function marketOptions(odds,match,leg){
  if(MARKET_META[leg.market]?.binary)return [];
  const start=Date.parse(match?.game?.startTime||''),team=leg.team||match?.player?.team,side=leg.side==='under'?'under':'over';
  const groups=new Map();
  for(const row of oddsPlayerRows(odds,{...leg,team})){
    if(row.market!==leg.market)continue;
    const t=Date.parse(row.commenceTime||'');if(Number.isFinite(start)&&Number.isFinite(t)&&Math.abs(t-start)>8*3600_000)continue;
    const line=finite(row.line);if(line==null)continue;
    if(!groups.has(line))groups.set(line,[]);groups.get(line).push(row);
  }
  const out=[];
  for(const [line,rows] of groups){
    const probs=rows.map(r=>fairForRow(r,side)).filter(Number.isFinite),probability=median(probs);if(!Number.isFinite(probability))continue;
    const priced=rows.filter(r=>finite(side==='under'?r.underPrice:r.overPrice)!=null).sort((a,b)=>{
      const pa=finite(side==='under'?a.underPrice:a.overPrice),pb=finite(side==='under'?b.underPrice:b.overPrice);return (pb??-99999)-(pa??-99999);
    });
    const chosen=priced[0]||rows[0],displayLine=side==='over'&&Number.isInteger(line+0.5)?line+0.5:line;
    out.push({line:displayLine,probability:clamp(probability),price:finite(side==='under'?chosen.underPrice:chosen.overPrice),book:chosen.book||null,deepLink:chosen.deepLink||null});
  }
  return out.sort((a,b)=>b.probability-a.probability);
}
function matchup(game){return `${game?.away?.abbr||game?.away?.name||''} @ ${game?.home?.abbr||game?.home?.name||''}`.trim();}

async function analyzeBasketballSlip(sport,rawLegs,options={}){
  if(!SPORT_CONFIG[sport])throw new Error(`Unsupported basketball sport: ${sport}`);
  const legs=(Array.isArray(rawLegs)?rawLegs:[]).filter(l=>String(l.sport||'').toUpperCase()===sport).slice(0,20);
  if(!legs.length)throw new Error(`No ${sport} legs were provided.`);
  const referenceTime=options.referenceTime||new Date().toISOString(),odds=await loadOdds(sport),results=[];
  for(let i=0;i<legs.length;i++){
    const leg={...legs[i],id:legs[i].id||`${sport.toLowerCase()}-${i+1}`,sport};
    if(!MARKET_META[leg.market]){results.push({...leg,status:'UNRESOLVED',resolutionReason:'unsupported-basketball-market',displayMarket:displayMarket(leg),probability:null,current:null,target:targetForLeg(leg),marketOptions:[]});continue;}
    const match=await findEspnPlayer(sport,leg,referenceTime,odds);
    if(!match){results.push({...leg,status:'UNRESOLVED',resolutionReason:`player-not-found-in-${sport.toLowerCase()}-game-window`,displayMarket:displayMarket(leg),probability:null,current:null,target:targetForLeg(leg),marketOptions:[]});continue;}
    const state=normalizeState(match.game.status),current=currentForMarket(match.player,leg.market),status=settleStatus(leg,current,state),quote=quoteProbability(odds,match,leg);
    const probability=status==='HIT'?1:status==='MISS'?0:quote.probability;
    results.push({...leg,team:leg.team||match.player.team||null,gameId:String(match.game.id),matchup:matchup(match.game),startTimeUTC:match.game.startTime,gameState:state,status,displayMarket:displayMarket(leg),current,target:targetForLeg(leg),probability,probabilityPct:pct(probability),probabilityMethod:['PENDING','LIVE'].includes(status)?quote.method:null,marketOptions:status==='PENDING'?marketOptions(odds,match,leg):[],resolutionReason:status==='UNRESOLVED'?'basketball-stat-unavailable':null});
  }
  return {ok:true,generatedAt:new Date().toISOString(),dataGeneratedAt:odds?.meta?.fetchedAt||null,source:`The Sports Outpost ${sport} ParlayAPI sportsbook snapshot + ESPN ${sport} live/final box scores`,results};
}

module.exports={SPORT_CONFIG,MARKET_META,parseSummaryPlayers,displayMarket,targetForLeg,conditionMet,settleStatus,quoteProbability,marketOptions,analyzeBasketballSlip,normName};
