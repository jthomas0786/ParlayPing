const {gradeExtendedLiveLeg,samePerson}=require('./extended-live-grading');

const OUTPOST_BASE='https://raw.githubusercontent.com/jthomas0786/The-Sports-Outpost/main/slates';

const SPORT_CONFIG={
  SOCCER:{file:'soccer-odds.json',liveFile:'soccer-live.json'},
  TENNIS:{file:'tennis-odds.json',liveFile:'tennis-live.json'},
  MMA:{file:'mma-odds.json'},
  ESPORTS:{file:'esports-odds.json'},
  TABLE_TENNIS:{file:'table-tennis-odds.json'}
};

const MARKET_LABELS={
  shots:'SHOTS',shotsOnTarget:'SOT',assists:'AST',goalsAssists:'G+A',fouls:'FOULS',goals:'GOALS',anytimeGoal:'ANYTIME GOAL',toReceiveCard:'TO RECEIVE CARD',saves:'SAVES',
  gamesWon:'GAMES WON',gamesPlayed:'GAMES',setsWon:'SETS WON',setsPlayed:'SETS',aces:'ACES',doubleFaults:'DOUBLE FAULTS',breakPointsWon:'BREAK POINTS WON',tiebreaksPlayed:'TIEBREAKS',firstSetAces:'1ST SET ACES',matchWinner:'MATCH WINNER',
  fightWinner:'FIGHT WINNER',
  killsMaps12:'KILLS MAPS 1-2',killsMaps123:'KILLS MAPS 1-2-3',killsMaps13:'KILLS MAPS 1-3',map1Kills:'MAP 1 KILLS',map3Kills:'MAP 3 KILLS',map4Kills:'MAP 4 KILLS',map5Kills:'MAP 5 KILLS',headshotsMaps12:'HEADSHOTS MAPS 1-2',map3Headshots:'MAP 3 HEADSHOTS',firstBloodsMaps12:'FIRST BLOODS MAPS 1-2',points:'POINTS',
  totalPoints:'TOTAL POINTS'
};
const BINARY_MARKETS=new Set(['anytimeGoal','toReceiveCard','matchWinner','fightWinner']);

const finite=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const clamp=v=>Math.max(0,Math.min(1,v));
const pct=v=>Number.isFinite(v)?Math.round(v*1000)/10:null;
function normName(value){return String(value||'').toLowerCase().normalize('NFKD').replace(/[.'’]/g,'').replace(/\b(jr|sr|ii|iii|iv|v)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
function normTeam(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'');}
function teamMatches(a,b){const x=normTeam(a),y=normTeam(b);if(!x||!y)return true;return x===y||x.includes(y)||y.includes(x);}
function americanImplied(price){const p=finite(price);if(p===null||p===0)return null;return p>0?100/(p+100):(-p)/((-p)+100);}
function median(values){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
async function fetchSnapshotFile(file,{sport,label}){
  const response=await fetch(`${OUTPOST_BASE}/${file}`,{headers:{accept:'application/json','user-agent':'ParlayPing/0.9'},cache:'no-store'});
  if(response.status===404)return null;
  if(!response.ok)throw new Error(`${sport} ${label} snapshot request failed (${response.status})`);
  return response.json();
}
async function loadSnapshot(sport){
  const cfg=SPORT_CONFIG[sport];if(!cfg)return {meta:{sport},rows:[]};
  return (await fetchSnapshotFile(cfg.file,{sport,label:'odds'}))||{meta:{sport},rows:[]};
}
async function loadLiveSnapshot(sport){
  const cfg=SPORT_CONFIG[sport];if(!cfg?.liveFile)return null;
  return fetchSnapshotFile(cfg.liveFile,{sport,label:'live'});
}
function playerRows(snapshot,leg){
  return (snapshot?.rows||[]).filter(row=>samePerson(row.player,leg.player)&&(!leg.team||!row.team||teamMatches(leg.team,row.team)));
}
function closestEventRow(snapshot,leg,referenceTime){
  const ref=Date.parse(referenceTime||'');
  const rows=playerRows(snapshot,leg).filter(r=>Number.isFinite(Date.parse(r.commenceTime||'')));
  rows.sort((a,b)=>{
    const da=Number.isFinite(ref)?Math.abs(Date.parse(a.commenceTime)-ref):Date.parse(a.commenceTime);
    const db=Number.isFinite(ref)?Math.abs(Date.parse(b.commenceTime)-ref):Date.parse(b.commenceTime);
    return da-db;
  });
  return rows[0]||null;
}
function lineCandidates(leg){
  if(BINARY_MARKETS.has(leg.market))return [];
  const line=finite(leg.line);if(line===null)return [];
  const values=[line];
  if(leg.inclusive&&Number.isInteger(line))values.push(leg.side==='under'?line+0.5:line-0.5);
  return [...new Set(values)];
}
function rowMatchesLine(row,leg){
  if(BINARY_MARKETS.has(leg.market)||row?.binary)return true;
  const rowLine=finite(row?.line);if(rowLine===null)return false;
  return lineCandidates(leg).some(line=>Math.abs(rowLine-line)<1e-9);
}
function matchingRows(snapshot,leg,eventRow){
  const start=Date.parse(eventRow?.commenceTime||'');
  return playerRows(snapshot,leg).filter(row=>{
    if(row.market!==leg.market||!rowMatchesLine(row,leg))return false;
    if(eventRow?.eventId&&row.eventId&&String(row.eventId)!==String(eventRow.eventId))return false;
    const t=Date.parse(row.commenceTime||'');
    return !Number.isFinite(start)||!Number.isFinite(t)||Math.abs(t-start)<=8*3600_000;
  });
}
function sideProbability(row,leg){
  const over=finite(row?.overImplied)??americanImplied(row?.overPrice);
  const under=finite(row?.underImplied)??americanImplied(row?.underPrice);
  const wantsUnder=leg.side==='under'||leg.side==='no';
  const desired=wantsUnder?under:over,other=wantsUnder?over:under;
  if(desired===null)return null;
  return other!==null&&desired+other>0?desired/(desired+other):desired;
}
function quoteProbability(snapshot,leg,eventRow){
  const rows=matchingRows(snapshot,leg,eventRow);
  const probabilities=rows.map(row=>sideProbability(row,leg)).filter(Number.isFinite);
  if(!probabilities.length)return {probability:null,method:null,rows};
  const twoSided=rows.some(row=>{
    const over=finite(row?.overImplied)??americanImplied(row?.overPrice);
    const under=finite(row?.underImplied)??americanImplied(row?.underPrice);
    return over!==null&&under!==null;
  });
  return {probability:clamp(median(probabilities)),method:twoSided?'sportsbook-devig-median':'sportsbook-implied-median',rows};
}
function displayMarket(leg){
  const label=MARKET_LABELS[leg.market]||String(leg.market||'PROP').replace(/([a-z])([A-Z])/g,'$1 $2').toUpperCase();
  if(BINARY_MARKETS.has(leg.market))return leg.side==='no'?`NO ${label}`:label;
  const line=finite(leg.line);if(line===null)return label;
  if(leg.inclusive&&leg.side!=='under')return `${line}+ ${label}`;
  return `${leg.side==='under'?'U':'O'}${line} ${label}`;
}
function targetForLeg(leg){
  if(BINARY_MARKETS.has(leg.market))return 1;
  const line=finite(leg.line);if(line===null)return null;
  if(leg.side==='under')return line;
  if(leg.inclusive)return line;
  return Number.isInteger(line)?line+1:Math.floor(line)+1;
}
function marketOptions(snapshot,leg,eventRow){
  if(BINARY_MARKETS.has(leg.market))return [];
  const start=Date.parse(eventRow?.commenceTime||'');
  const groups=new Map();
  for(const row of playerRows(snapshot,leg)){
    if(row.market!==leg.market)continue;
    if(eventRow?.eventId&&row.eventId&&String(row.eventId)!==String(eventRow.eventId))continue;
    const t=Date.parse(row.commenceTime||'');if(Number.isFinite(start)&&Number.isFinite(t)&&Math.abs(t-start)>8*3600_000)continue;
    const line=finite(row.line);if(line===null)continue;
    if(!groups.has(line))groups.set(line,[]);groups.get(line).push(row);
  }
  const out=[];
  for(const [line,rows] of groups){
    const probabilities=rows.map(row=>sideProbability(row,{...leg,line,inclusive:false})).filter(Number.isFinite);
    const probability=median(probabilities);if(!Number.isFinite(probability))continue;
    const wantsUnder=leg.side==='under';
    const priced=rows.filter(row=>finite(wantsUnder?row.underPrice:row.overPrice)!==null).sort((a,b)=>(finite(wantsUnder?b.underPrice:b.overPrice)??-99999)-(finite(wantsUnder?a.underPrice:a.overPrice)??-99999));
    const chosen=priced[0]||rows[0];
    out.push({line,probability:clamp(probability),price:finite(wantsUnder?chosen.underPrice:chosen.overPrice),book:chosen.book||null,deepLink:chosen.deepLink||null});
  }
  return out.sort((a,b)=>b.probability-a.probability);
}
function matchup(row){return `${row?.awayTeam||''} @ ${row?.homeTeam||''}`.trim();}
function unresolved(leg,reason){return {...leg,status:'UNRESOLVED',resolutionReason:reason,displayMarket:displayMarket(leg),probability:null,probabilityPct:null,probabilityMethod:null,current:null,target:targetForLeg(leg),marketOptions:[]};}
function latestDataTime(...values){
  const times=values.map(v=>Date.parse(v||'')).filter(Number.isFinite);
  return times.length?new Date(Math.max(...times)).toISOString():null;
}

async function analyzeExtendedSlip(sport,rawLegs,options={}){
  if(!SPORT_CONFIG[sport])throw new Error(`Unsupported extended sport: ${sport}`);
  const legs=(Array.isArray(rawLegs)?rawLegs:[]).filter(l=>String(l.sport||'').toUpperCase()===sport).slice(0,20);
  if(!legs.length)throw new Error(`No ${sport} legs were provided.`);
  const [snapshot,liveSnapshot]=await Promise.all([
    loadSnapshot(sport),
    loadLiveSnapshot(sport).catch(()=>null)
  ]);
  const referenceTime=options.referenceTime||new Date().toISOString(),now=Number.isFinite(Number(options.now))?Number(options.now):Date.now(),results=[];
  for(const leg of legs){
    const eventRow=closestEventRow(snapshot,leg,referenceTime);
    if(liveSnapshot){
      const liveGrade=gradeExtendedLiveLeg(sport,leg,liveSnapshot,{referenceTime,eventRow});
      if(liveGrade){
        results.push({...liveGrade,displayMarket:displayMarket(leg),target:targetForLeg(leg)});
        continue;
      }
    }
    if(!eventRow){results.push(unresolved(leg,`${sport.toLowerCase().replaceAll('_','-')}-player-market-not-found-in-current-snapshot`));continue;}
    const start=Date.parse(eventRow.commenceTime||'');
    if(!Number.isFinite(start)){results.push(unresolved(leg,`${sport.toLowerCase().replaceAll('_','-')}-event-time-unavailable`));continue;}
    if(now>=start){
      const slug=sport.toLowerCase().replaceAll('_','-');
      const liveCapable=Boolean(SPORT_CONFIG[sport]?.liveFile);
      const reason=liveCapable?(liveSnapshot?`${slug}-live-event-not-found`:`${slug}-live-feed-unavailable`):`${slug}-live-grading-not-connected`;
      results.push({...unresolved(leg,reason),gameId:String(eventRow.eventId||''),matchup:matchup(eventRow),startTimeUTC:eventRow.commenceTime||null,gameState:'in-or-post'});
      continue;
    }
    const quote=quoteProbability(snapshot,leg,eventRow);
    if(!Number.isFinite(quote.probability)){results.push({...unresolved(leg,`${sport.toLowerCase().replaceAll('_','-')}-requested-line-not-currently-priced`),gameId:String(eventRow.eventId||''),matchup:matchup(eventRow),startTimeUTC:eventRow.commenceTime||null,gameState:'pre'});continue;}
    results.push({...leg,team:leg.team||eventRow.team||null,gameId:String(eventRow.eventId||''),matchup:matchup(eventRow),startTimeUTC:eventRow.commenceTime||null,gameState:'pre',status:'PENDING',displayMarket:displayMarket(leg),current:null,target:targetForLeg(leg),probability:quote.probability,probabilityPct:pct(quote.probability),probabilityMethod:quote.method,marketOptions:marketOptions(snapshot,leg,eventRow),resolutionReason:null});
  }
  const liveEnabled=Boolean(SPORT_CONFIG[sport]?.liveFile);
  const source=liveEnabled?`The Sports Outpost ${sport} ParlayAPI sportsbook snapshot + ESPN live/final grading`:`The Sports Outpost ${sport} ParlayAPI sportsbook snapshot`;
  return {ok:true,generatedAt:new Date().toISOString(),dataGeneratedAt:latestDataTime(snapshot?.meta?.fetchedAt,liveSnapshot?.generatedAt),source,results};
}

module.exports={SPORT_CONFIG,MARKET_LABELS,BINARY_MARKETS,normName,rowMatchesLine,quoteProbability,displayMarket,targetForLeg,marketOptions,analyzeExtendedSlip,loadLiveSnapshot};
