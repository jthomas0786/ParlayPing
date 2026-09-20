const DATA_URL = 'https://raw.githubusercontent.com/jthomas0786/The-Sports-Outpost/main/slates/ncaaf-odds.json';
const CACHE_MS = 60_000;
let cache = null;

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
      line: leg.market==='atd'?null:group.line,
      side: leg.side,
      probability,
      impliedProbability: price==null?null:americanImplied(price),
      probabilityMethod:'market-implied-devig',
      book:b?.book||null,
      price,
      link:b?.deepLink||null
    };
  }).filter(o=>o.price!=null||Number.isFinite(o.probability)).sort((a,b)=>Number(a.line??0)-Number(b.line??0));
}
async function loadSnapshot(){
  if(cache&&Date.now()-cache.ts<CACHE_MS)return cache.value;
  const response=await fetch(DATA_URL,{headers:{'user-agent':'ParlayPing/0.4'}});
  if(!response.ok)throw new Error(`Unable to load NCAAF odds snapshot: ${response.status}`);
  const value=await response.json(); cache={ts:Date.now(),value}; return value;
}
function chooseEventRows(rows,now){
  const byEvent=new Map();
  for(const row of rows){
    const key=String(row.eventId||`${row.awayTeam||''}@${row.homeTeam||''}`);
    if(!byEvent.has(key))byEvent.set(key,[]); byEvent.get(key).push(row);
  }
  const events=[...byEvent.values()].map(group=>({
    rows:group,
    start:Date.parse(group.find(r=>r.commenceTime)?.commenceTime||'')
  }));
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

async function analyzeNcaafSlip(rawLegs){
  const legs=(Array.isArray(rawLegs)?rawLegs:[]).filter(l=>String(l.sport||'').toUpperCase()==='NCAAF');
  if(!legs.length)throw new Error('No NCAAF legs were provided.');
  const snapshot=await loadSnapshot();
  const rows=Array.isArray(snapshot?.rows)?snapshot.rows:[];
  const now=Date.now();
  const results=[];

  for(let i=0;i<legs.length;i++){
    const leg={...legs[i],id:legs[i].id||`ncaaf-${i+1}`,sport:'NCAAF'};
    const named=rows.filter(r=>normName(r.player)===normName(leg.player)&&String(r.market)===String(leg.market));
    if(!named.length){
      results.push({...leg,status:'UNRESOLVED',resolutionReason:'player-market-not-found-in-current-ncaaf-snapshot',displayMarket:formatLine(leg),probability:null,current:null,target:leg.line,marketOptions:[]});
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
    const matchup=[sample?.awayTeam,sample?.homeTeam].filter(Boolean).join(' @ ');
    if(started){
      results.push({...leg,gameId:sample?.eventId||null,matchup,startTimeUTC:sample?.commenceTime||null,gameState:'in-or-post',status:'UNRESOLVED',resolutionReason:'ncaaf-live-player-stat-grading-not-yet-connected',displayMarket:formatLine(leg),probability:null,current:null,target:leg.line,marketOptions:[]});
      continue;
    }
    results.push({...leg,gameId:sample?.eventId||null,matchup,startTimeUTC:sample?.commenceTime||null,gameState:'pre',status:'PENDING',displayMarket:formatLine(leg),current:0,target:leg.market==='atd'?1:leg.line,probability,probabilityPct:pct(probability),probabilityMethod:'market-implied-devig',marketOptions:buildOptions(eventRows,leg)});
  }

  return {
    ok:true,
    generatedAt:new Date().toISOString(),
    dataGeneratedAt:snapshot?.meta?.fetchedAt||null,
    source:'ParlayAPI NCAAF sportsbook snapshot via The Sports Outpost',
    results,
    counts:{
      hit:0,miss:0,live:0,
      pending:results.filter(r=>r.status==='PENDING').length,
      unresolved:results.filter(r=>r.status==='UNRESOLVED').length
    }
  };
}

module.exports={ analyzeNcaafSlip, americanImplied, fairProbability, desiredBookLine };
