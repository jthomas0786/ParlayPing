const PREDICTION_BASE = 'https://raw.githubusercontent.com/jthomas0786/The-Sports-Outpost/main/model-logs/predictions';
const MLB_API = 'https://statsapi.mlb.com/api/v1';
const MLB_FEED = gamePk => `https://statsapi.mlb.com/api/v1.1/game/${encodeURIComponent(gamePk)}/feed/live`;
const CACHE_MS = 60_000;
const LIVE_CACHE_MS = 15_000;

const predictionCache = new Map();
const liveCache = new Map();
const scheduleCache = new Map();
const rosterCache = new Map();
const playersCache = new Map();

const MARKET_META = {
  homeRun: { modelKey:'hr', label:'HR', binary:true, category:'batting' },
  hits: { modelKey:'hits', label:'HITS', category:'batting' },
  totalBases: { modelKey:'tb', label:'TB', category:'batting' },
  rbi: { modelKey:'rbi', label:'RBI', category:'batting' },
  hrr: { modelKey:'hrr', label:'H+R+RBI', category:'batting' },
  stolenBases: { modelKey:'sb', label:'SB', category:'batting' },
  runs: { modelKey:null, label:'RUNS', category:'batting' },
  singles: { modelKey:null, label:'1B', category:'batting' },
  doubles: { modelKey:null, label:'2B', category:'batting' },
  triples: { modelKey:null, label:'3B', category:'batting' },
  walks: { modelKey:null, label:'BB', category:'batting' },
  batterStrikeouts: { modelKey:null, label:'BATTER K', category:'batting' },
  hitsRuns: { modelKey:null, label:'H+R', category:'batting' },
  hitsRbi: { modelKey:null, label:'H+RBI', category:'batting' },
  runsRbi: { modelKey:null, label:'R+RBI', category:'batting' },
  extraBaseHits: { modelKey:null, label:'XBH', category:'batting' },
  pitcherStrikeouts: { modelKey:null, label:'PITCHER K', category:'pitching' },
  pitchingOuts: { modelKey:null, label:'OUTS', category:'pitching' },
  hitsAllowed: { modelKey:null, label:'H ALLOWED', category:'pitching' },
  earnedRuns: { modelKey:null, label:'ER', category:'pitching' },
  walksAllowed: { modelKey:null, label:'BB ALLOWED', category:'pitching' },
  homeRunsAllowed: { modelKey:null, label:'HR ALLOWED', category:'pitching' },
  pitcherWin: { modelKey:null, label:'PITCHER WIN', binary:true, category:'pitching' }
};

function normName(value) {
  return String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[.'’]/g,'').replace(/\b(jr|sr|ii|iii|iv|v)\b/g,'')
    .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function normTeam(value){ return String(value||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,''); }
function teamMatches(a,b){
  const x=normTeam(a),y=normTeam(b); if(!x||!y)return false;
  return x===y||x.includes(y)||y.includes(x);
}
function clamp(v, lo=0, hi=1){ return Math.max(lo, Math.min(hi, v)); }
function pct(v){ return Number.isFinite(v) ? Math.round(v*1000)/10 : null; }
function numeric(v){ const n=Number(v); return Number.isFinite(n) ? n : null; }
function dateMs(value){ const n=Date.parse(value||''); return Number.isFinite(n)?n:null; }
function easternDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function nearbyDateKeys(referenceTime) {
  const base = new Date(referenceTime || Date.now());
  const safe = Number.isFinite(base.getTime()) ? base : new Date();
  return [-2,-1,0,1,2].map(offset => easternDate(new Date(safe.getTime() + offset*86400000))).filter((v,i,a)=>a.indexOf(v)===i);
}
function seasonFrom(referenceTime){
  const d=new Date(referenceTime||Date.now());
  return Number.isFinite(d.getTime())?d.getUTCFullYear():new Date().getUTCFullYear();
}
async function fetchJson(url, allow404=false) {
  const response = await fetch(url, { headers:{accept:'application/json','user-agent':'ParlayPing/0.8'}, cache:'no-store' });
  if (allow404 && response.status === 404) return null;
  if (!response.ok) throw new Error(`MLB data request failed (${response.status})`);
  return response.json();
}
async function cached(cache,key,url,ttl=CACHE_MS,allow404=false){
  const row=cache.get(key);if(row&&Date.now()-row.ts<ttl)return row.value;
  const value=await fetchJson(url,allow404);cache.set(key,{ts:Date.now(),value});return value;
}
async function loadPrediction(dateKey) {
  return cached(predictionCache,dateKey,`${PREDICTION_BASE}/${dateKey}.json`,CACHE_MS,true);
}
async function loadPredictionSet(referenceTime) {
  const values = await Promise.all(nearbyDateKeys(referenceTime).map(loadPrediction));
  return values.filter(Boolean);
}
async function loadLive(gamePk) {
  return cached(liveCache,String(gamePk),MLB_FEED(String(gamePk)),LIVE_CACHE_MS);
}
async function loadSchedule(dateKey){
  return cached(scheduleCache,dateKey,`${MLB_API}/schedule?sportId=1&date=${encodeURIComponent(dateKey)}`,CACHE_MS);
}
async function loadRoster(teamId,season,type='40Man'){
  const key=`${teamId}:${season}:${type}`;
  return cached(rosterCache,key,`${MLB_API}/teams/${encodeURIComponent(teamId)}/roster?rosterType=${encodeURIComponent(type)}&season=${encodeURIComponent(season)}`,CACHE_MS,true);
}
async function loadLeaguePlayers(season){
  const key=String(season);
  return cached(playersCache,key,`${MLB_API}/sports/1/players?season=${encodeURIComponent(season)}&hydrate=currentTeam`,CACHE_MS,true);
}
function modelKey(market){ return MARKET_META[market]?.modelKey || null; }
function isBinaryMarket(market){ return Boolean(MARKET_META[market]?.binary); }
function targetForLeg(leg){
  if(isBinaryMarket(leg.market)) return 1;
  const line=numeric(leg.line);
  if(line==null) return null;
  if(leg.side==='under') return line;
  if(leg.inclusive) return line;
  return Number.isInteger(line) ? line + 1 : Math.floor(line) + 1;
}
function displayMarket(leg){
  const meta=MARKET_META[leg.market];
  const label=meta?.label || String(leg.market||'PROP').replace(/([a-z])([A-Z])/g,'$1 $2').toUpperCase();
  if(meta?.binary) return leg.side==='no' ? `NO ${label}` : label;
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
function scheduleGames(doc){
  const out=[];
  for(const date of doc?.dates||[])for(const game of date?.games||[]){
    const team=side=>{
      const row=game?.teams?.[side]?.team||{};
      return {id:row.id==null?null:String(row.id),name:row.name||row.teamName||row.clubName||'',abbreviation:row.abbreviation||row.fileCode||''};
    };
    out.push({
      id:String(game?.gamePk||game?.gameGuid||''),
      gamePk:String(game?.gamePk||''),
      startTimeUTC:game?.gameDate||null,
      away:team('away'),home:team('home'),
      abstractState:game?.status?.abstractGameState||'',
      detailedState:game?.status?.detailedState||''
    });
  }
  return out.filter(g=>g.gamePk);
}
function gameDistance(game,referenceTime){
  const a=dateMs(game?.startTimeUTC),b=dateMs(referenceTime);return a!=null&&b!=null?Math.abs(a-b):0;
}
function gameHasTeam(game,team){
  if(!team)return true;
  return teamMatches(team,game?.away?.name)||teamMatches(team,game?.away?.abbreviation)||teamMatches(team,game?.home?.name)||teamMatches(team,game?.home?.abbreviation);
}
function gameHasTeamId(game,teamId){
  if(teamId==null)return true;
  const id=String(teamId);return String(game?.away?.id||'')===id||String(game?.home?.id||'')===id;
}
function sideForGameTeam(game,teamOrId){
  const id=teamOrId==null?null:String(teamOrId);
  for(const side of ['away','home']){
    const row=game?.[side]||{};
    if((id&&String(row.id||'')===id)||teamMatches(teamOrId,row.name)||teamMatches(teamOrId,row.abbreviation))return side;
  }
  return null;
}
function opponentFor(game,side){ return side==='away'?game?.home:side==='home'?game?.away:null; }
function rosterPeople(doc){ return (doc?.roster||[]).map(r=>({id:r?.person?.id==null?null:String(r.person.id),name:r?.person?.fullName||r?.person?.name||'',position:r?.position?.abbreviation||''})); }
function leaguePeople(doc){ return (doc?.people||[]).map(p=>({id:p?.id==null?null:String(p.id),name:p?.fullName||p?.name||'',teamId:p?.currentTeam?.id==null?null:String(p.currentTeam.id),teamName:p?.currentTeam?.name||'',position:p?.primaryPosition?.abbreviation||''})); }
function boxscorePeople(feed){
  const out=[];const teams=feed?.liveData?.boxscore?.teams||{};
  for(const side of ['away','home'])for(const p of Object.values(teams?.[side]?.players||{})){
    out.push({id:p?.person?.id==null?null:String(p.person.id),name:p?.person?.fullName||p?.person?.name||'',side,position:p?.position?.abbreviation||'',row:p});
  }
  return out;
}
function feedPeople(feed){
  const out=boxscorePeople(feed);
  const seen=new Set(out.map(p=>p.id).filter(Boolean));
  for(const p of Object.values(feed?.gameData?.players||{})){
    const id=p?.id==null?null:String(p.id);if(id&&seen.has(id))continue;
    out.push({id,name:p?.fullName||p?.name||'',side:null,position:p?.primaryPosition?.abbreviation||'',row:null});
  }
  return out;
}
function findFeedPlayer(feed,leg,game){
  const matches=feedPeople(feed).filter(p=>normName(p.name)===normName(leg.player));
  if(!matches.length)return null;
  if(leg.team){
    const side=sideForGameTeam(game,leg.team);
    const exact=matches.find(p=>!p.side||!side||p.side===side);if(exact)return exact;
  }
  return matches.find(p=>p.side)||matches[0];
}
async function findRosterPlayer(teamId,season,playerName){
  for(const type of ['40Man','active']){
    try{
      const doc=await loadRoster(teamId,season,type);
      const found=rosterPeople(doc).find(p=>normName(p.name)===normName(playerName));
      if(found)return found;
    }catch(_){ }
  }
  return null;
}
async function findDirectoryPlayer(leg,season){
  try{
    const doc=await loadLeaguePlayers(season);
    const rows=leaguePeople(doc).filter(p=>normName(p.name)===normName(leg.player));
    if(!rows.length)return null;
    if(leg.team){const exact=rows.find(p=>!p.teamName||teamMatches(leg.team,p.teamName));if(exact)return exact;}
    return rows[0];
  }catch(_){ return null; }
}
async function resolveOfficialMatch(leg,referenceTime){
  const season=seasonFrom(referenceTime);
  const docs=await Promise.all(nearbyDateKeys(referenceTime).map(key=>loadSchedule(key).catch(()=>null)));
  let games=docs.filter(Boolean).flatMap(scheduleGames).sort((a,b)=>gameDistance(a,referenceTime)-gameDistance(b,referenceTime));
  const directory=await findDirectoryPlayer(leg,season);
  let teamId=directory?.teamId||null;
  let teamName=directory?.teamName||leg.team||null;

  if(leg.team){
    const gameWithTeam=games.find(g=>gameHasTeam(g,leg.team));
    if(gameWithTeam){const side=sideForGameTeam(gameWithTeam,leg.team);teamId=gameWithTeam?.[side]?.id||teamId;teamName=gameWithTeam?.[side]?.name||teamName;}
  }

  if(teamId||teamName){
    const filtered=games.filter(g=>teamId?gameHasTeamId(g,teamId):gameHasTeam(g,teamName));
    if(filtered.length)games=filtered;
    if(teamId){
      const roster=await findRosterPlayer(teamId,season,leg.player);
      if(roster){
        const game=games[0]||null;
        const side=game?sideForGameTeam(game,teamId):null;
        return {player:{...roster,teamId,teamName:game?.[side]?.name||teamName},game,side,feed:null,source:'mlb-official-roster'};
      }
    }
    if(directory&&(!leg.team||!directory.teamName||teamMatches(leg.team,directory.teamName))){
      const game=games[0]||null;
      const side=game?sideForGameTeam(game,teamId||teamName):null;
      return {player:{id:directory.id,name:directory.name,position:directory.position,teamId:teamId||directory.teamId,teamName:game?.[side]?.name||teamName},game,side,feed:null,source:'mlb-official-player-directory'};
    }
  }

  for(const game of games.slice(0,50)){
    try{
      const feed=await loadLive(game.gamePk);
      const found=findFeedPlayer(feed,leg,game);
      if(!found)continue;
      if(leg.team){
        const side=found.side||sideForGameTeam(game,leg.team);
        if(side&&!(teamMatches(leg.team,game?.[side]?.name)||teamMatches(leg.team,game?.[side]?.abbreviation)))continue;
      }
      const side=found.side||sideForGameTeam(game,leg.team);
      return {player:{id:found.id,name:found.name,position:found.position,teamId:game?.[side]?.id||null,teamName:game?.[side]?.name||leg.team||null},game,side,feed,source:'mlb-official-game-feed'};
    }catch(_){ }
  }

  if(directory){
    return {player:{id:directory.id,name:directory.name,position:directory.position,teamId:directory.teamId,teamName:directory.teamName||leg.team||null},game:null,side:null,feed:null,source:'mlb-official-player-directory'};
  }
  return null;
}
function rowForPlayer(feed,playerId,playerName){
  const rows=boxscorePeople(feed),id=playerId==null?null:String(playerId);
  return (id?rows.find(p=>p.id===id):null)||rows.find(p=>normName(p.name)===normName(playerName))||null;
}
function inningsToOuts(value){
  if(value==null)return null;const text=String(value);const m=text.match(/^(\d+)(?:\.(\d))?$/);if(!m)return null;
  return Number(m[1])*3+Math.min(2,Number(m[2]||0));
}
function battingStats(feed, playerId, playerName) {
  const row=rowForPlayer(feed,playerId,playerName);const b=row?.row?.stats?.batting;if(!b)return null;
  const hits=numeric(b.hits)||0,doubles=numeric(b.doubles)||0,triples=numeric(b.triples)||0,homeRuns=numeric(b.homeRuns)||0;
  const totalBases=numeric(b.totalBases);
  const runs=numeric(b.runs)||0,rbi=numeric(b.rbi)||0;
  return {
    hits,doubles,triples,homeRuns,
    singles:Math.max(0,hits-doubles-triples-homeRuns),
    extraBaseHits:doubles+triples+homeRuns,
    totalBases:totalBases==null?hits+doubles+2*triples+3*homeRuns:totalBases,
    rbi,runs,walks:numeric(b.baseOnBalls)||0,batterStrikeouts:numeric(b.strikeOuts)||0,stolenBases:numeric(b.stolenBases)||0,
    hrr:hits+runs+rbi,hitsRuns:hits+runs,hitsRbi:hits+rbi,runsRbi:runs+rbi,
    _present:true
  };
}
function pitchingStats(feed,playerId,playerName){
  const row=rowForPlayer(feed,playerId,playerName);const p=row?.row?.stats?.pitching;if(!p)return null;
  return {
    pitcherStrikeouts:numeric(p.strikeOuts)||0,
    pitchingOuts:inningsToOuts(p.inningsPitched)??0,
    hitsAllowed:numeric(p.hits)||0,
    earnedRuns:numeric(p.earnedRuns)||0,
    walksAllowed:numeric(p.baseOnBalls)||0,
    homeRunsAllowed:numeric(p.homeRuns)||0,
    _present:true
  };
}
function playerGameStats(feed,playerId,playerName){
  const batting=battingStats(feed,playerId,playerName),pitching=pitchingStats(feed,playerId,playerName);
  const row=rowForPlayer(feed,playerId,playerName);
  const winnerId=feed?.liveData?.decisions?.winner?.id==null?null:String(feed.liveData.decisions.winner.id);
  return {...(batting||{}),...(pitching||{}),pitcherWin:winnerId&&row?.id===winnerId?1:0,_present:Boolean(row),_batting:Boolean(batting),_pitching:Boolean(pitching)};
}
function currentForMarket(stats, market){
  if(!stats)return null;const value=numeric(stats[market]);return value==null?null:value;
}
function normalizedState(value){
  const state=String(value||'').toLowerCase();
  if(/final|completed|game over/.test(state))return 'post';
  if(/live|in progress|manager challenge/.test(state))return 'in';
  if(/postponed|cancelled|suspended/.test(state))return 'unavailable';
  if(/preview|scheduled|pre/.test(state))return 'pre';
  return null;
}
function gameState(feed,startTimeUTC,scheduleGame,nowValue){
  const fromFeed=normalizedState(feed?.gameData?.status?.abstractGameState)||normalizedState(feed?.gameData?.status?.detailedState);
  if(fromFeed)return fromFeed;
  const fromSchedule=normalizedState(scheduleGame?.abstractState)||normalizedState(scheduleGame?.detailedState);
  if(fromSchedule)return fromSchedule;
  const start=dateMs(startTimeUTC),now=dateMs(nowValue)||Date.now();
  return start!=null&&now>=start?'unknown':'pre';
}
function conditionMet(leg,current){
  if(!Number.isFinite(current))return false;
  if(isBinaryMarket(leg.market))return leg.side==='no'?current<1:current>=1;
  const line=numeric(leg.line);if(line==null)return false;
  if(leg.side==='under')return leg.inclusive?current<=line:current<line;
  return leg.inclusive?current>=line:current>line;
}
function settleStatus(leg,current,state){
  if(state==='pre')return 'PENDING';
  if(state==='unavailable')return 'VOID';
  if(!Number.isFinite(current))return state==='in'||state==='unknown'?'LIVE':'VOID';
  const hit=conditionMet(leg,current);
  if(state==='post')return hit?'HIT':'MISS';
  if(state!=='in')return 'LIVE';
  if(leg.market==='pitcherWin')return 'LIVE';
  if(isBinaryMarket(leg.market)){
    if(leg.side==='no')return current>=1?'MISS':'LIVE';
    return current>=1?'HIT':'LIVE';
  }
  if(leg.side==='under')return hit?'LIVE':'MISS';
  return hit?'HIT':'LIVE';
}
function findPrediction(files,leg,referenceTime){
  const candidates=[];
  for(const file of files){
    for(const player of file?.players||[]){
      if(normName(player?.name)!==normName(leg.player))continue;
      if(leg.team&&player?.team&&!teamMatches(leg.team,player.team))continue;
      const start=dateMs(player?.startTimeUTC),ref=dateMs(referenceTime);const distance=start!=null&&ref!=null?Math.abs(start-ref):0;
      candidates.push({file,player,distance,start:start||0});
    }
  }
  candidates.sort((a,b)=>a.distance-b.distance||b.start-a.start);return candidates[0]||null;
}
function resultCounts(results){
  return {
    hit:results.filter(r=>r.status==='HIT').length,
    miss:results.filter(r=>r.status==='MISS').length,
    live:results.filter(r=>r.status==='LIVE').length,
    pending:results.filter(r=>r.status==='PENDING').length,
    void:results.filter(r=>r.status==='VOID').length,
    unresolved:results.filter(r=>r.status==='UNRESOLVED').length
  };
}

async function analyzeMlbSlip(rawLegs, options={}) {
  const legs=(Array.isArray(rawLegs)?rawLegs:[]).filter(l=>String(l.sport||'').toUpperCase()==='MLB').slice(0,20);
  if(!legs.length)throw new Error('No MLB legs were provided.');
  const referenceTime=options.referenceTime||new Date().toISOString();
  const nowValue=options.now||new Date().toISOString();
  const files=await loadPredictionSet(referenceTime).catch(()=>[]);
  const results=[];const feeds=new Map();

  for(let i=0;i<legs.length;i++){
    const leg={...legs[i],id:legs[i].id||`mlb-${i+1}`,sport:'MLB'};
    const modelMatch=findPrediction(files,leg,referenceTime);
    let official=null;
    if(!modelMatch)official=await resolveOfficialMatch(leg,referenceTime).catch(()=>null);
    if(!modelMatch&&!official){
      results.push({...leg,status:'UNRESOLVED',resolutionReason:'mlb-player-not-found-in-model-or-official-sources',displayMarket:displayMarket(leg),probability:null,current:null,target:targetForLeg(leg),marketOptions:[]});
      continue;
    }

    let file=null,player=null,game=null,feed=official?.feed||null,source='sports-outpost-mlb-model';
    if(modelMatch){
      file=modelMatch.file;player=modelMatch.player;
      game={gamePk:player.gamePk==null?'':String(player.gamePk),startTimeUTC:player.startTimeUTC||null,
        away:{name:player.team||'',id:null},home:{name:player.opponent||'',id:null},abstractState:'',detailedState:''};
    }else{
      source=official.source;game=official.game;player={
        playerId:official.player?.id,name:official.player?.name||leg.player,team:official.player?.teamName||leg.team||'',
        opponent:opponentFor(game,official.side)?.name||'',startTimeUTC:game?.startTimeUTC||null,gamePk:game?.gamePk||null
      };
    }

    const startTimeUTC=player?.startTimeUTC||game?.startTimeUTC||null;
    const gamePk=player?.gamePk==null?(game?.gamePk||null):String(player.gamePk);
    const side=official?.side||sideForGameTeam(game,leg.team||player?.team);
    const teamName=official?.player?.teamName||game?.[side]?.name||player?.team||leg.team||'';
    const opponentName=opponentFor(game,side)?.name||player?.opponent||'';
    const matchup=teamName&&opponentName?`${teamName} vs ${opponentName}`:(teamName||opponentName||null);
    const probability=modelMatch?modelProbability(leg,file,player):null;
    const nowMs=dateMs(nowValue)||Date.now(),startMs=dateMs(startTimeUTC);
    const definitelyPre=startMs!=null&&nowMs<startMs-60_000;

    if(definitelyPre||(!gamePk&&official?.player)){
      results.push({...leg,gameId:gamePk,matchup,startTimeUTC,gameState:'pre',status:'PENDING',resolutionSource:source,
        displayMarket:displayMarket(leg),current:0,target:targetForLeg(leg),probability,probabilityPct:pct(probability),
        probabilityMethod:probability==null?null:'sports-outpost-mlb-model-10000-sim',modelHash:file?.model?.modelHash||null,marketOptions:[]});
      continue;
    }

    if(gamePk&&!feed){
      try{if(!feeds.has(gamePk))feeds.set(gamePk,await loadLive(gamePk));feed=feeds.get(gamePk);}catch(_){feed=null;}
    }
    const state=gameState(feed,startTimeUTC,game,nowValue);
    if(!feed){
      const status=state==='pre'?'PENDING':state==='unavailable'?'VOID':'LIVE';
      results.push({...leg,gameId:gamePk,matchup,startTimeUTC,gameState:state,status,resolutionSource:source,
        resolutionReason:'mlb-official-feed-temporarily-unavailable',displayMarket:displayMarket(leg),current:null,target:targetForLeg(leg),
        probability,probabilityPct:pct(probability),probabilityMethod:probability==null?null:'sports-outpost-mlb-model-10000-sim',modelHash:file?.model?.modelHash||null,marketOptions:[]});
      continue;
    }

    const playerId=modelMatch?(player?.playerId??player?.id):official?.player?.id;
    const stats=playerGameStats(feed,playerId,player?.name||leg.player);
    const current=currentForMarket(stats,leg.market);
    let status;
    if(!MARKET_META[leg.market]) status=state==='post'?'VOID':state==='pre'?'PENDING':'LIVE';
    else if(state==='post'&&!stats._present) status='VOID';
    else status=settleStatus(leg,current==null&&state==='in'&&stats._present?0:current,state);
    const finalCurrent=current==null&&state==='in'&&stats._present?0:current;
    results.push({...leg,gameId:gamePk,matchup,startTimeUTC,gameState:state,status,resolutionSource:source,
      resolutionReason:status==='VOID'?(!MARKET_META[leg.market]?'mlb-market-not-yet-trackable':'mlb-player-did-not-record-box-score-stats'):undefined,
      displayMarket:displayMarket(leg),current:finalCurrent,target:targetForLeg(leg),
      probability:status==='HIT'?1:status==='MISS'?0:probability,probabilityPct:status==='HIT'?100:status==='MISS'?0:pct(probability),
      probabilityMethod:probability==null?null:'sports-outpost-mlb-model-10000-sim',modelHash:file?.model?.modelHash||null,marketOptions:[]});
  }

  const generatedTimes=files.map(f=>dateMs(f?.generatedAt)).filter(v=>v!=null).sort((a,b)=>b-a);
  return {
    ok:true,generatedAt:new Date().toISOString(),dataGeneratedAt:generatedTimes[0]?new Date(generatedTimes[0]).toISOString():null,
    source:'The Sports Outpost MLB model when available + official MLB schedule/roster/game feeds',results,counts:resultCounts(results)
  };
}

module.exports={
  analyzeMlbSlip,modelKey,modelProbability,battingStats,pitchingStats,playerGameStats,currentForMarket,settleStatus,displayMarket,targetForLeg,
  MARKET_META,scheduleGames,resolveOfficialMatch,findDirectoryPlayer,findRosterPlayer,findFeedPlayer,nearbyDateKeys,teamMatches
};
