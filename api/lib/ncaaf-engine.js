const ODDS_URL = 'https://raw.githubusercontent.com/jthomas0786/The-Sports-Outpost/main/slates/ncaaf-odds.json';
const LIVE_URL = 'https://raw.githubusercontent.com/jthomas0786/The-Sports-Outpost/main/slates/ncaaf-live.json';
const CACHE_MS = 60_000;
const caches = new Map();

const LABELS = {
  recYds:'REC YDS', rushYds:'RUSH YDS', passYds:'PASS YDS', receptions:'REC',
  passTds:'PASS TD', completions:'COMP', atd:'ATD'
};

function normName(value) {
  return String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[.'’]/g,'').replace(/\b(jr|sr|ii|iii|iv|v)\b/g,'')
    .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function clamp(v,lo=0,hi=1){ return Math.max(lo,Math.min(hi,v)); }
function pct(v){ return Number.isFinite(v) ? Math.round(v*1000)/10 : null; }
function americanImplied(price){
  const n=Number(price); if(!Number.isFinite(n)||n===0)return null;
  return n>0?100/(n+100):(-n)/((-n)+100);
}
function median(values){
  const a=values.filter(Number.isFinite).sort((x,y)=>x-y); if(!a.length)return null;
  const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function fairProbability(row,side){
  const over=Number.isFinite(Number(row.overImplied))?Number(row.overImplied):americanImplied(row.overPrice);
  const under=Number.isFinite(Number(row.underImplied))?Number(row.underImplied):americanImplied(row.underPrice);
  if(Number.isFinite(over)&&Number.isFinite(under)&&over+under>0){
    return clamp(side==='under'?under/(over+under):over/(over+under));
  }
  const one=side==='under'?under:over;
  return Number.isFinite(one)?clamp(one):null;
}
function probabilityMethod(rows,side){
  const hasTwoSided=(rows||[]).some(row=>{
    const over=Number.isFinite(Number(row.overImplied))||Number.isFinite(Number(row.overPrice));
    const under=Number.isFinite(Number(row.underImplied))||Number.isFinite(Number(row.underPrice));
    return over&&under;
  });
  return hasTwoSided?'market-implied-devig':'market-implied-single-sided';
}
function formatLine(leg){
  if(leg.market==='atd')return 'ATD';
  const label=LABELS[leg.market]||leg.market;
  if(leg.inclusive&&leg.side!=='under')return `${leg.line}+ ${label}`;
  return `${leg.side==='under'?'U':'O'}${leg.line} ${label}`;
}
function desiredBookLine(leg){
  if(leg.market==='atd')return 0.5;
  const n=Number(leg.line);
  if(!Number.isFinite(n))return null;
  return leg.inclusive&&leg.side!=='under'?n-0.5:n;
}
function bestPrice(rows,side){
  const key=side==='under'?'underPrice':'overPrice';
  const good=rows.filter(r=>Number.isFinite(Number(r[key])));
  if(!good.length)return null;
  return [...good].sort((a,b)=>Number(b[key])-Number(a[key]))[0];
}
function groupByLine(rows){
  const map=new Map();
  for(const row of rows){
    const line=Number(row.line); if(!Number.isFinite(line))continue;
    const key=String(line); if(!map.has(key))map.set(key,[]); map.get(key).push(row);
  }
  return [...map.entries()].map(([key,value])=>({line:Number(key),rows:value}));
}
function buildOptions(rows,leg){
  const side=leg.side==='yes'?'over':leg.side;
  return groupByLine(rows).map(group=>{
    const b=bestPrice(group.rows,side);
    const probability=median(group.rows.map(r=>fairProbability(r,side)));
    const price=b?Number(side==='under'?b.underPrice:b.overPrice):null;
    return {
      line:leg.market==='atd'?null:group.line,
      side:leg.side,
      probability,
      impliedProbability:price==null?null:americanImplied(price),
      probabilityMethod:probabilityMethod(group.rows,side),
      book:b?.book||null,
      price,
      link:b?.deepLink||null
    };
  }).filter(o=>o.price!=null||Number.isFinite(o.probability)).sort((a,b)=>Number(a.line??0)-Number(b.line??0));
}
async function fetchCached(name,url,optional=false){
  const hit=caches.get(name); if(hit&&Date.now()-hit.ts<CACHE_MS)return hit.value;
  try{
    const response=await fetch(url,{headers:{'user-agent':'ParlayPing/0.5'}});
    if(!response.ok)throw new Error(`${response.status}`);
    const value=await response.json(); caches.set(name,{ts:Date.now(),value}); return value;
  }catch(e){
    if(optional)return null;
    throw new Error(`Unable to load NCAAF ${name} snapshot: ${e?.message||e}`);
  }
}
function chooseEventRows(rows,now){
  const byEvent=new Map();
  for(const row of rows){
    const key=String(row.eventId||`${row.awayTeam||''}@${row.homeTeam||''}`);
    if(!byEvent.has(key))byEvent.set(key,[]); byEvent.get(key).push(row);
  }
  const events=[...byEvent.values()].map(group=>({rows:group,start:Date.parse(group.find(r=>r.commenceTime)?.commenceTime||'')}));
  events.sort((a,b)=>{
    const aa=Number.isFinite(a.start)?Math.abs(a.start-now):Infinity;
    const bb=Number.isFinite(b.start)?Math.abs(b.start-now):Infinity;
    return aa-bb;
  });
  return events[0]?.rows||[];
}
function nearestLineGroup(rows,leg){
  const target=desiredBookLine(leg); if(target==null)return null;
  const groups=groupByLine(rows).sort((a,b)=>Math.abs(a.line-target)-Math.abs(b.line-target));
  const best=groups[0];
  if(!best||Math.abs(best.line-target)>0.51)return null;
  return best;
}
function currentValue(player,market){
  if(market==='atd')return Number(player?.rushTds||0)+Number(player?.recTds||0);
  const map={recYds:'recYds',rushYds:'rushYds',passYds:'passYds',receptions:'receptions',passTds:'passTds',completions:'completions'};
  const v=Number(player?.[map[market]]); return Number.isFinite(v)?v:0;
}
function gradeLeg(leg,current,state){
  if(leg.market==='atd'){
    if(current>=1)return 'HIT';
    return state==='post'?'MISS':'LIVE';
  }
  if(leg.side==='under'){
    if(current>=Number(leg.line))return 'MISS';
    return state==='post'?'HIT':'LIVE';
  }
  const hit=leg.inclusive?current>=Number(leg.line):current>Number(leg.line);
  if(hit)return 'HIT';
  return state==='post'?'MISS':'LIVE';
}
function findLivePlayer(live,leg,now){
  const wanted=normName(leg.player); if(!wanted)return null;
  const matches=[];
  for(const game of Object.values(live?.games||{})){
    const start=Date.parse(game?.startTime||'');
    if(Number.isFinite(start)&&start>now+2*3600_000)continue;
    for(const player of game?.playerStats||[]){
      if(normName(player?.name)!==wanted)continue;
      if(leg.team&&String(player?.team||'').toUpperCase()!==String(leg.team).toUpperCase())continue;
      matches.push({game,player,start:Number.isFinite(start)?start:0});
    }
  }
  matches.sort((a,b)=>b.start-a.start);
  return matches[0]||null;
}

async function analyzeNcaafSlip(rawLegs){
  const legs=(Array.isArray(rawLegs)?rawLegs:[]).filter(l=>String(l.sport||'').toUpperCase()==='NCAAF');
  if(!legs.length)throw new Error('No NCAAF legs were provided.');
  const [snapshot,live]=await Promise.all([
    fetchCached('odds',ODDS_URL),
    fetchCached('live',LIVE_URL,true)
  ]);
  const rows=Array.isArray(snapshot?.rows)?snapshot.rows:[];
  const now=Date.now();
  const results=[];

  for(let i=0;i<legs.length;i++){
    const leg={...legs[i],id:legs[i].id||`ncaaf-${i+1}`,sport:'NCAAF'};
    const liveMatch=findLivePlayer(live,leg,now);
    if(liveMatch&&['in','post'].includes(String(liveMatch.game?.state||''))){
      const state=String(liveMatch.game.state);
      const current=currentValue(liveMatch.player,leg.market);
      const status=gradeLeg(leg,current,state);
      const matchup=[liveMatch.game?.away?.abbr||liveMatch.game?.away?.name,liveMatch.game?.home?.abbr||liveMatch.game?.home?.name].filter(Boolean).join(' @ ');
      results.push({
        ...leg,gameId:liveMatch.game?.id||null,matchup,startTimeUTC:liveMatch.game?.startTime||null,
        gameState:state,status,displayMarket:formatLine(leg),current,target:leg.market==='atd'?1:leg.line,
        probability:status==='HIT'?1:status==='MISS'?0:null,probabilityPct:status==='HIT'?100:status==='MISS'?0:null,
        probabilityMethod:status==='LIVE'?'live-progress-no-ncaaf-model':'settled-result',marketOptions:[]
      });
      continue;
    }

    const named=rows.filter(r=>normName(r.player)===normName(leg.player)&&String(r.market)===String(leg.market));
    if(!named.length){
      results.push({...leg,status:'UNRESOLVED',resolutionReason:snapshot?.meta?.noCurrentProps?'no-current-ncaaf-props-and-no-live-stat-match':'player-market-not-found-in-current-ncaaf-snapshot',displayMarket:formatLine(leg),probability:null,current:null,target:leg.line,marketOptions:[]});
      continue;
    }
    const eventRows=chooseEventRows(named,now);
    const lineGroup=nearestLineGroup(eventRows,leg);
    if(!lineGroup){
      results.push({...leg,status:'UNRESOLVED',resolutionReason:'requested-line-not-found-in-current-ncaaf-snapshot',displayMarket:formatLine(leg),probability:null,current:null,target:leg.line,marketOptions:buildOptions(eventRows,leg)});
      continue;
    }
    const sample=lineGroup.rows[0]||eventRows[0];
    const start=Date.parse(sample?.commenceTime||'');
    const started=Number.isFinite(start)&&start<=now-120_000;
    const side=leg.side==='yes'?'over':leg.side;
    const probability=median(lineGroup.rows.map(r=>fairProbability(r,side)));
    const method=probabilityMethod(lineGroup.rows,side);
    const matchup=[sample?.awayTeam,sample?.homeTeam].filter(Boolean).join(' @ ');
    if(started){
      results.push({...leg,gameId:sample?.eventId||null,matchup,startTimeUTC:sample?.commenceTime||null,gameState:'in-or-post',status:'UNRESOLVED',resolutionReason:'ncaaf-live-stat-match-not-yet-available',displayMarket:formatLine(leg),probability:null,current:null,target:leg.line,marketOptions:[]});
      continue;
    }
    results.push({...leg,gameId:sample?.eventId||null,matchup,startTimeUTC:sample?.commenceTime||null,gameState:'pre',status:'PENDING',displayMarket:formatLine(leg),current:0,target:leg.market==='atd'?1:leg.line,probability,probabilityPct:pct(probability),probabilityMethod:method,marketOptions:buildOptions(eventRows,leg)});
  }

  return {
    ok:true,
    generatedAt:new Date().toISOString(),
    dataGeneratedAt:[snapshot?.meta?.fetchedAt,live?.generatedAt].filter(Boolean).sort().at(-1)||null,
    source:'ParlayAPI NCAAF sportsbook snapshot + ESPN NCAAF player stats via The Sports Outpost',
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

module.exports={ analyzeNcaafSlip, americanImplied, fairProbability, desiredBookLine, gradeLeg, currentValue };
