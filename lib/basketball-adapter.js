const legacy = require('./basketball-engine');

const OUTPOST_BASE='https://raw.githubusercontent.com/jthomas0786/The-Sports-Outpost/main/slates';
const FILES={NBA:'nba-odds.json',NCAAB:'ncaab-odds.json',WNBA:'wnba-odds.json'};
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const pct=v=>Number.isFinite(v)?Math.round(v*1000)/10:null;
function normTeam(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'');}
function teamMatches(a,b){const x=normTeam(a),y=normTeam(b);if(!x||!y)return true;return x===y||x.includes(y)||y.includes(x);}
async function loadOdds(sport){
  const file=FILES[sport];
  if(!file)return {meta:{sport},rows:[]};
  const response=await fetch(`${OUTPOST_BASE}/${file}`,{headers:{accept:'application/json','user-agent':'ParlayPing/0.8'},cache:'no-store'});
  if(response.status===404)return {meta:{sport},rows:[]};
  if(!response.ok)throw new Error(`Basketball odds snapshot request failed (${response.status})`);
  return response.json();
}
function rowsForLeg(odds,leg){
  return (odds?.rows||[]).filter(r=>legacy.normName(r.player)===legacy.normName(leg.player)&&(!leg.team||!r.team||teamMatches(leg.team,r.team)));
}
function closestEventRow(odds,leg,referenceTime){
  const ref=Date.parse(referenceTime||'');
  const rows=rowsForLeg(odds,leg).filter(r=>Number.isFinite(Date.parse(r.commenceTime||'')));
  rows.sort((a,b)=>Math.abs(Date.parse(a.commenceTime)-ref)-Math.abs(Date.parse(b.commenceTime)-ref));
  return rows[0]||null;
}
function syntheticMatch(row,leg){
  return {
    game:{
      id:String(row?.eventId||''),
      startTime:row?.commenceTime||null,
      status:'pre',
      away:{abbr:row?.awayTeam||'',name:row?.awayTeam||''},
      home:{abbr:row?.homeTeam||'',name:row?.homeTeam||''}
    },
    player:{team:leg.team||row?.team||null,name:leg.player,current:{}}
  };
}
function matchup(match){return `${match?.game?.away?.abbr||match?.game?.away?.name||''} @ ${match?.game?.home?.abbr||match?.game?.home?.name||''}`.trim();}
function pregameResult(odds,leg,row){
  const match=syntheticMatch(row,leg);
  const quote=legacy.quoteProbability(odds,match,leg);
  return {
    ...leg,
    team:leg.team||row?.team||null,
    gameId:String(row?.eventId||''),
    matchup:matchup(match),
    startTimeUTC:row?.commenceTime||null,
    gameState:'pre',
    status:'PENDING',
    displayMarket:legacy.displayMarket(leg),
    current:null,
    target:legacy.targetForLeg(leg),
    probability:quote.probability,
    probabilityPct:pct(quote.probability),
    probabilityMethod:quote.method,
    marketOptions:legacy.marketOptions(odds,match,leg),
    resolutionReason:null
  };
}
function safeUnresolved(leg,reason){
  return {...leg,status:'UNRESOLVED',resolutionReason:reason,displayMarket:legacy.displayMarket(leg),probability:null,probabilityPct:null,probabilityMethod:null,current:null,target:legacy.targetForLeg(leg),marketOptions:[]};
}
async function analyzeBasketballSlip(sport,rawLegs,options={}){
  const legs=(Array.isArray(rawLegs)?rawLegs:[]).filter(l=>String(l.sport||'').toUpperCase()===sport).slice(0,20);
  if(!legs.length)throw new Error(`No ${sport} legs were provided.`);
  const referenceTime=options.referenceTime||new Date().toISOString();
  const ref=Date.parse(referenceTime);
  const odds=await loadOdds(sport);
  const results=[];
  const liveLegs=[];

  for(const leg of legs){
    if(!legacy.MARKET_META[leg.market]){results.push(safeUnresolved(leg,'unsupported-basketball-market'));continue;}
    const row=closestEventRow(odds,leg,referenceTime);
    const start=Date.parse(row?.commenceTime||'');
    if(row&&Number.isFinite(start)&&Number.isFinite(ref)&&ref<start){
      results.push(pregameResult(odds,leg,row));
    }else{
      liveLegs.push(leg);
    }
  }

  if(liveLegs.length){
    try{
      const live=await legacy.analyzeBasketballSlip(sport,liveLegs,options);
      results.push(...(live.results||[]));
    }catch(error){
      const message=String(error?.message||'');
      const reason=/\(403\)/.test(message)?'basketball-live-feed-unavailable':'basketball-live-analysis-failed';
      for(const leg of liveLegs)results.push(safeUnresolved(leg,reason));
    }
  }

  const order=new Map(legs.map((leg,index)=>[String(leg.id||`${leg.player}|${leg.market}|${leg.line}`),index]));
  results.sort((a,b)=>(order.get(String(a.id||`${a.player}|${a.market}|${a.line}`))??999)-(order.get(String(b.id||`${b.player}|${b.market}|${b.line}`))??999));
  return {ok:true,generatedAt:new Date().toISOString(),dataGeneratedAt:odds?.meta?.fetchedAt||null,source:`The Sports Outpost ${sport} sportsbook snapshot${liveLegs.length?' + live/final stat adapter':''}`,results};
}

module.exports={analyzeBasketballSlip,closestEventRow,pregameResult};
