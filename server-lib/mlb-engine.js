const PREDICTION_BASE = 'https://raw.githubusercontent.com/jthomas0786/The-Sports-Outpost/main/model-logs/predictions';
const MLB_FEED = gamePk => `https://statsapi.mlb.com/api/v1.1/game/${encodeURIComponent(gamePk)}/feed/live`;
const CACHE_MS = 60_000;
const LIVE_CACHE_MS = 15_000;

const predictionCache = new Map();
const liveCache = new Map();

const MARKET_META = {
  homeRun: { modelKey:'hr', label:'HR' },
  hits: { modelKey:'hits', label:'HITS' },
  totalBases: { modelKey:'tb', label:'TB' },
  rbi: { modelKey:'rbi', label:'RBI' },
  hrr: { modelKey:'hrr', label:'H+R+RBI' },
  stolenBases: { modelKey:'sb', label:'SB' }
};

function normName(value) {
  return String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[.'’]/g,'').replace(/\b(jr|sr|ii|iii|iv|v)\b/g,'')
    .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function clamp(v, lo=0, hi=1){ return Math.max(lo, Math.min(hi, v)); }
function pct(v){ return Number.isFinite(v) ? Math.round(v*1000)/10 : null; }
function numeric(v){ const n=Number(v); return Number.isFinite(n) ? n : null; }
function easternDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function nearbyDateKeys(referenceTime) {
  const base = new Date(referenceTime || Date.now());
  if (!Number.isFinite(base.getTime())) return [easternDate()];
  return [0,-1,1].map(offset => easternDate(new Date(base.getTime() + offset*86400000))).filter((v,i,a)=>a.indexOf(v)===i);
}
async function fetchJson(url, allow404=false) {
  const response = await fetch(url, { headers:{accept:'application/json','user-agent':'ParlayPing/0.5'}, cache:'no-store' });
  if (allow404 && response.status === 404) return null;
  if (!response.ok) throw new Error(`MLB data request failed (${response.status})`);
  return response.json();
}
async function loadPrediction(dateKey) {
  const cached = predictionCache.get(dateKey);
  if (cached && Date.now()-cached.ts < CACHE_MS) return cached.value;
  const value = await fetchJson(`${PREDICTION_BASE}/${dateKey}.json`, true);
  predictionCache.set(dateKey, {ts:Date.now(), value});
  return value;
}
async function loadPredictionSet(referenceTime) {
  const values = await Promise.all(nearbyDateKeys(referenceTime).map(loadPrediction));
  return values.filter(Boolean);
}
async function loadLive(gamePk) {
  const key=String(gamePk);
  const cached=liveCache.get(key);
  if(cached && Date.now()-cached.ts < LIVE_CACHE_MS) return cached.value;
  const value=await fetchJson(MLB_FEED(key));
  liveCache.set(key,{ts:Date.now(),value});
  return value;
}
function modelKey(market){ return MARKET_META[market]?.modelKey || null; }
function targetForLeg(leg){
  if(leg.market==='homeRun') return 1;
  const line=numeric(leg.line);
  if(line==null) return null;
  if(leg.side==='under') return line;
  if(leg.inclusive) return line;
  return Number.isInteger(line) ? line + 1 : Math.floor(line) + 1;
}
function displayMarket(leg){
  const label=MARKET_META[leg.market]?.label || leg.market || 'PROP';
  if(leg.market==='homeRun') return leg.side==='no' ? 'NO HR' : 'HR';
  const line=numeric(leg.line);
  if(line==null) return label;
  if(leg.inclusive && leg.side!=='under') return `${line}+ ${label}`;
  return `${leg.side==='under'?'U':'O'}${line} ${label}`;
}
function modelProbability(leg, predictionFile, playerPrediction){
  const key=modelKey(leg.market); if(!key) return null;
  const p=numeric(playerPrediction?.props?.[key]?.p); if(p==null) return null;
  if(leg.market==='homeRun') return leg.side==='no' ? clamp(1-p) : clamp(p);
  const def=predictionFile?.props?.[key];
  const cut=numeric(def?.over); const line=numeric(leg.line);
  if(cut==null || line==null) return null;
  let equivalent=false;
  if(!leg.inclusive) equivalent=Math.abs(line-cut)<1e-9;
  else if(leg.side==='under') equivalent=Math.abs(line-(Math.ceil(cut)-1))<1e-9;
  else equivalent=Math.abs(line-Math.ceil(cut))<1e-9;
  if(!equivalent) return null;
  return leg.side==='under' ? clamp(1-p) : clamp(p);
}
function battingStats(feed, playerId, playerName) {
  const teams=feed?.liveData?.boxscore?.teams || {};
  const all=[...Object.values(teams?.away?.players||{}),...Object.values(teams?.home?.players||{})];
  const id=playerId==null?null:String(playerId);
  let row=id ? all.find(p=>String(p?.person?.id||'')===id) : null;
  if(!row) row=all.find(p=>normName(p?.person?.fullName||p?.person?.name)===normName(playerName));
  const b=row?.stats?.batting; if(!b) return null;
  const hits=numeric(b.hits)||0, doubles=numeric(b.doubles)||0, triples=numeric(b.triples)||0, homeRuns=numeric(b.homeRuns)||0;
  const totalBases=numeric(b.totalBases);
  return {
    hits,
    totalBases: totalBases==null ? hits+doubles+2*triples+3*homeRuns : totalBases,
    rbi:numeric(b.rbi)||0,
    runs:numeric(b.runs)||0,
    stolenBases:numeric(b.stolenBases)||0,
    homeRuns,
    hrr:hits+(numeric(b.runs)||0)+(numeric(b.rbi)||0)
  };
}
function currentForMarket(stats, market){
  if(!stats) return null;
  if(market==='homeRun') return stats.homeRuns;
  return numeric(stats[market]);
}
function gameState(feed, startTimeUTC) {
  const abstract=String(feed?.gameData?.status?.abstractGameState||'').toLowerCase();
  const detailed=String(feed?.gameData?.status?.detailedState||'').toLowerCase();
  if(abstract==='final' || /final|completed/.test(detailed)) return 'post';
  if(abstract==='live' || /in progress|manager challenge/.test(detailed)) return 'in';
  if(/postponed|cancelled|suspended/.test(detailed)) return 'unavailable';
  const start=Date.parse(startTimeUTC||'');
  return Number.isFinite(start)&&Date.now()>=start ? 'unknown' : 'pre';
}
function conditionMet(leg,current){
  if(!Number.isFinite(current)) return false;
  if(leg.market==='homeRun') return leg.side==='no' ? current<1 : current>=1;
  const line=numeric(leg.line); if(line==null)return false;
  if(leg.side==='under') return leg.inclusive ? current<=line : current<line;
  return leg.inclusive ? current>=line : current>line;
}
function settleStatus(leg,current,state){
  if(!Number.isFinite(current)) return 'UNRESOLVED';
  const hit=conditionMet(leg,current);
  if(state==='post') return hit?'HIT':'MISS';
  if(state!=='in') return state==='pre'?'PENDING':'UNRESOLVED';
  if(leg.market==='homeRun') {
    if(leg.side==='no') return current>=1?'MISS':'LIVE';
    return current>=1?'HIT':'LIVE';
  }
  if(leg.side==='under') return hit?'LIVE':'MISS';
  return hit?'HIT':'LIVE';
}
function findPrediction(files,leg,referenceTime){
  const candidates=[];
  for(const file of files){
    for(const player of file?.players||[]){
      if(normName(player?.name)!==normName(leg.player)) continue;
      if(leg.team && player?.team && String(leg.team).toUpperCase()!==String(player.team).toUpperCase()) continue;
      const start=Date.parse(player?.startTimeUTC||'');
      const ref=Date.parse(referenceTime||'');
      const distance=Number.isFinite(start)&&Number.isFinite(ref)?Math.abs(start-ref):0;
      candidates.push({file,player,distance,start});
    }
  }
  candidates.sort((a,b)=>a.distance-b.distance || b.start-a.start);
  return candidates[0]||null;
}

async function analyzeMlbSlip(rawLegs, options={}) {
  const legs=(Array.isArray(rawLegs)?rawLegs:[]).filter(l=>String(l.sport||'').toUpperCase()==='MLB').slice(0,20);
  if(!legs.length) throw new Error('No MLB legs were provided.');
  const referenceTime=options.referenceTime||new Date().toISOString();
  const files=await loadPredictionSet(referenceTime);
  const results=[];
  const feeds=new Map();

  for(let i=0;i<legs.length;i++){
    const leg={...legs[i],id:legs[i].id||`mlb-${i+1}`,sport:'MLB'};
    if(!MARKET_META[leg.market]){
      results.push({...leg,status:'UNRESOLVED',resolutionReason:'unsupported-mlb-market',displayMarket:displayMarket(leg),probability:null,current:null,target:targetForLeg(leg),marketOptions:[]});
      continue;
    }
    const match=findPrediction(files,leg,referenceTime);
    if(!match){
      results.push({...leg,status:'UNRESOLVED',resolutionReason:'player-not-found-in-nearby-mlb-model-snapshots',displayMarket:displayMarket(leg),probability:null,current:null,target:targetForLeg(leg),marketOptions:[]});
      continue;
    }
    const {file,player}=match;
    const startTimeUTC=player.startTimeUTC||null;
    const gamePk=player.gamePk==null?null:String(player.gamePk);
    const probability=modelProbability(leg,file,player);
    const pre=Number.isFinite(Date.parse(startTimeUTC||'')) && Date.now()<Date.parse(startTimeUTC)-60000;
    if(pre){
      results.push({...leg,gameId:gamePk,matchup:`${player.team||''} @ ${player.opponent||''}`.trim(),startTimeUTC,gameState:'pre',status:'PENDING',displayMarket:displayMarket(leg),current:0,target:targetForLeg(leg),probability,probabilityPct:pct(probability),probabilityMethod:probability==null?null:'sports-outpost-mlb-model-10000-sim',modelHash:file?.model?.modelHash||null,marketOptions:[]});
      continue;
    }
    let feed=null;
    try{
      if(gamePk){
        if(!feeds.has(gamePk)) feeds.set(gamePk,await loadLive(gamePk));
        feed=feeds.get(gamePk);
      }
    }catch(error){
      results.push({...leg,gameId:gamePk,matchup:`${player.team||''} @ ${player.opponent||''}`.trim(),startTimeUTC,gameState:'unknown',status:'UNRESOLVED',resolutionReason:'mlb-live-feed-unavailable',displayMarket:displayMarket(leg),probability,current:null,target:targetForLeg(leg),marketOptions:[]});
      continue;
    }
    const state=gameState(feed,startTimeUTC);
    const stats=battingStats(feed,player.playerId,player.name);
    const current=currentForMarket(stats,leg.market);
    const status=settleStatus(leg,current,state);
    results.push({...leg,gameId:gamePk,matchup:`${player.team||''} @ ${player.opponent||''}`.trim(),startTimeUTC,gameState:state,status,resolutionReason:status==='UNRESOLVED'?(state==='unavailable'?'mlb-game-unavailable':'mlb-player-box-stat-unavailable'):undefined,displayMarket:displayMarket(leg),current,target:targetForLeg(leg),probability:status==='HIT'?1:status==='MISS'?0:probability,probabilityPct:status==='HIT'?100:status==='MISS'?0:pct(probability),probabilityMethod:probability==null?null:'sports-outpost-mlb-model-10000-sim',modelHash:file?.model?.modelHash||null,marketOptions:[]});
  }

  return {
    ok:true,
    generatedAt:new Date().toISOString(),
    dataGeneratedAt:files.map(f=>Date.parse(f?.generatedAt||'')).filter(Number.isFinite).sort((a,b)=>b-a)[0] ? new Date(files.map(f=>Date.parse(f?.generatedAt||'')).filter(Number.isFinite).sort((a,b)=>b-a)[0]).toISOString() : null,
    source:'The Sports Outpost MLB 10,000-run model snapshot + MLB Stats API live box score',
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

module.exports={ analyzeMlbSlip, modelKey, modelProbability, battingStats, currentForMarket, settleStatus, displayMarket, targetForLeg, MARKET_META };
