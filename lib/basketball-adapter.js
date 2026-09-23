const legacy = require('./basketball-engine');

const OUTPOST_BASE='https://raw.githubusercontent.com/jthomas0786/The-Sports-Outpost/main/slates';
const FILES={NBA:'nba-odds.json',NCAAB:'ncaab-odds.json',WNBA:'wnba-odds.json'};
const finite=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const pct=v=>Number.isFinite(v)?Math.round(v*1000)/10:null;
const clamp=v=>Math.max(0,Math.min(1,v));
let espnFetchSerial=Promise.resolve();

async function withEspnServerFetch(task){
  const previous=espnFetchSerial;
  let release;
  espnFetchSerial=new Promise(resolve=>{release=resolve;});
  await previous;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(input,init={})=>{
    const rawUrl=typeof input==='string'||input instanceof URL?String(input):String(input?.url||'');
    if(!/^https:\/\/site(?:\.web)?\.api\.espn\.com\//i.test(rawUrl))return originalFetch(input,init);
    const sourceHeaders=(typeof Request!=='undefined'&&input instanceof Request)?input.headers:undefined;
    const headers=new Headers(init?.headers||sourceHeaders);
    headers.set('user-agent','okhttp/4.12.0');
    headers.set('accept','application/json,text/plain,*/*');
    headers.set('accept-language','en-US,en;q=0.9');
    headers.set('referer','https://www.espn.com/');
    const response=await originalFetch(input,{...init,headers});
    if(response.status!==403||!rawUrl.includes('site.api.espn.com'))return response;
    const fallbackUrl=rawUrl.replace('https://site.api.espn.com/','https://site.web.api.espn.com/');
    return originalFetch(fallbackUrl,{...init,headers});
  };
  try{return await task();}
  finally{globalThis.fetch=originalFetch;release();}
}

function normTeam(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'');}
function teamMatches(a,b){const x=normTeam(a),y=normTeam(b);if(!x||!y)return true;return x===y||x.includes(y)||y.includes(x);}
function normPlayerName(value){return legacy.normName(String(value||'').replace(/\s*\([A-Z]{2,5}\)\s*$/i,''));}
function repairVisionMarket(leg){
  const text=String(leg?.originalText||'').toLowerCase();
  if(!text||!['ptsAsts','ptsRebs','rebsAsts'].includes(leg?.market))return leg;
  const singles=[['assists',/\bassists?\b/],['rebounds',/\brebounds?\b/],['points',/\bpoints?\b/]].filter(([,pattern])=>pattern.test(text));
  return singles.length===1?{...leg,market:singles[0][0]}:leg;
}
function americanImplied(price){const p=finite(price);if(p===null||p===0)return null;return p>0?100/(p+100):(-p)/((-p)+100);}
function sideProbability(row,side){
  const over=finite(row?.overImplied)??americanImplied(row?.overPrice);
  const under=finite(row?.underImplied)??americanImplied(row?.underPrice);
  if(side==='under'||side==='no'){
    if(under===null)return null;
    return over!==null&&over+under>0?under/(over+under):under;
  }
  if(over===null)return null;
  return under!==null&&over+under>0?over/(over+under):over;
}
function median(values){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
async function loadOdds(sport){
  const file=FILES[sport];
  if(!file)return {meta:{sport},rows:[]};
  const response=await fetch(`${OUTPOST_BASE}/${file}`,{headers:{accept:'application/json','user-agent':'ParlayPing/0.8'},cache:'no-store'});
  if(response.status===404)return {meta:{sport},rows:[]};
  if(!response.ok)throw new Error(`Basketball odds snapshot request failed (${response.status})`);
  return response.json();
}
function rowsForLeg(odds,leg){
  return (odds?.rows||[]).filter(r=>normPlayerName(r.player)===normPlayerName(leg.player)&&(!leg.team||!r.team||teamMatches(leg.team,r.team)));
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
function matchingQuoteRows(odds,leg,row){
  const start=Date.parse(row?.commenceTime||'');
  return rowsForLeg(odds,leg).filter(candidate=>{
    if(candidate.market!==leg.market||!legacy.quoteMatchesLine(candidate,leg))return false;
    const t=Date.parse(candidate.commenceTime||'');
    if(row?.eventId&&candidate.eventId&&String(candidate.eventId)!==String(row.eventId))return false;
    return !Number.isFinite(start)||!Number.isFinite(t)||Math.abs(t-start)<=8*3600_000;
  });
}
function quoteProbabilitySafe(odds,leg,row){
  const side=leg.side==='under'||leg.side==='no'?leg.side:'over';
  const rows=matchingQuoteRows(odds,leg,row);
  const probabilities=rows.map(r=>sideProbability(r,side)).filter(Number.isFinite);
  if(!probabilities.length)return {probability:null,method:null};
  const twoSided=rows.some(r=>(finite(r?.overImplied)??americanImplied(r?.overPrice))!==null&&(finite(r?.underImplied)??americanImplied(r?.underPrice))!==null);
  return {probability:clamp(median(probabilities)),method:twoSided?'sportsbook-devig-median':'sportsbook-implied-median'};
}
function marketOptionsSafe(odds,leg,row){
  if(legacy.MARKET_META[leg.market]?.binary)return [];
  const side=leg.side==='under'?'under':'over';
  const start=Date.parse(row?.commenceTime||'');
  const groups=new Map();
  for(const candidate of rowsForLeg(odds,leg)){
    if(candidate.market!==leg.market)continue;
    const t=Date.parse(candidate.commenceTime||'');
    if(row?.eventId&&candidate.eventId&&String(candidate.eventId)!==String(row.eventId))continue;
    if(Number.isFinite(start)&&Number.isFinite(t)&&Math.abs(t-start)>8*3600_000)continue;
    const line=finite(candidate.line);if(line===null)continue;
    if(!groups.has(line))groups.set(line,[]);groups.get(line).push(candidate);
  }
  const out=[];
  for(const [line,rows] of groups){
    const probability=median(rows.map(r=>sideProbability(r,side)).filter(Number.isFinite));
    if(!Number.isFinite(probability))continue;
    const priced=rows.filter(r=>finite(side==='under'?r.underPrice:r.overPrice)!==null).sort((a,b)=>(finite(side==='under'?b.underPrice:b.overPrice)??-99999)-(finite(side==='under'?a.underPrice:a.overPrice)??-99999));
    const chosen=priced[0]||rows[0];
    out.push({line,probability:clamp(probability),price:finite(side==='under'?chosen.underPrice:chosen.overPrice),book:chosen.book||null,deepLink:chosen.deepLink||null});
  }
  return out.sort((a,b)=>b.probability-a.probability);
}
function pregameResult(odds,leg,row){
  const match=syntheticMatch(row,leg);
  const quote=quoteProbabilitySafe(odds,leg,row);
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
    marketOptions:marketOptionsSafe(odds,leg,row),
    resolutionReason:null
  };
}
function safeUnresolved(leg,reason){
  return {...leg,status:'UNRESOLVED',resolutionReason:reason,displayMarket:legacy.displayMarket(leg),probability:null,probabilityPct:null,probabilityMethod:null,current:null,target:legacy.targetForLeg(leg),marketOptions:[]};
}
async function analyzeBasketballSlip(sport,rawLegs,options={}){
  const legs=(Array.isArray(rawLegs)?rawLegs:[]).filter(l=>String(l.sport||'').toUpperCase()===sport).slice(0,20).map(repairVisionMarket);
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
      const liveInputs=liveLegs.map(leg=>({...leg,team:null}));
      const live=await withEspnServerFetch(()=>legacy.analyzeBasketballSlip(sport,liveInputs,options));
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

module.exports={analyzeBasketballSlip,closestEventRow,pregameResult,quoteProbabilitySafe,marketOptionsSafe,withEspnServerFetch,normPlayerName,repairVisionMarket};
