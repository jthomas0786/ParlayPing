const v2 = require('./mlb-engine-v2');

const MLB_API='https://statsapi.mlb.com/api/v1';
const MLB_FEED=gamePk=>`https://statsapi.mlb.com/api/v1.1/game/${encodeURIComponent(gamePk)}/feed/live`;
const CACHE_MS=60_000;
const searchCache=new Map();
const scheduleCache=new Map();
const rosterCache=new Map();

function stripInvisible(value){return String(value||'').replace(/[\u200B-\u200D\u2060\uFEFF]/g,'');}
function normName(value){return stripInvisible(value).toLowerCase().normalize('NFKD').replace(/[.'’]/g,'').replace(/\b(jr|sr|ii|iii|iv|v)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
function dateMs(value){const n=Date.parse(value||'');return Number.isFinite(n)?n:null;}
function easternDate(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;
}
function nearbyDateKeys(referenceTime){
  const base=new Date(referenceTime||Date.now()),safe=Number.isFinite(base.getTime())?base:new Date();
  return [-2,-1,0,1,2].map(offset=>easternDate(new Date(safe.getTime()+offset*86400000))).filter((v,i,a)=>a.indexOf(v)===i);
}
function editDistance(a,b){
  const x=normName(a),y=normName(b);if(x===y)return 0;if(!x||!y)return Math.max(x.length,y.length);
  let prev=Array.from({length:y.length+1},(_,i)=>i);
  for(let i=1;i<=x.length;i++){
    const next=[i];
    for(let j=1;j<=y.length;j++)next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(x[i-1]===y[j-1]?0:1));
    prev=next;
  }
  return prev[y.length];
}
async function fetchJson(url,allow404=false){
  const response=await fetch(url,{headers:{accept:'application/json','user-agent':'ParlayPing/0.9'},cache:'no-store'});
  if(allow404&&response.status===404)return null;
  if(!response.ok)throw new Error(`MLB identity request failed (${response.status})`);
  return response.json();
}
async function cached(cache,key,url,allow404=false){
  const row=cache.get(key);if(row&&Date.now()-row.ts<CACHE_MS)return row.value;
  const value=await fetchJson(url,allow404);cache.set(key,{ts:Date.now(),value});return value;
}
function personRows(doc){return (doc?.people||[]).map(p=>({id:p?.id==null?null:String(p.id),name:p?.fullName||p?.name||'',teamId:p?.currentTeam?.id==null?null:String(p.currentTeam.id),teamName:p?.currentTeam?.name||'',position:p?.primaryPosition?.abbreviation||''}));}
function rosterRows(doc){return (doc?.roster||[]).map(r=>({id:r?.person?.id==null?null:String(r.person.id),name:r?.person?.fullName||r?.person?.name||'',position:r?.position?.abbreviation||''}));}
function scheduleGames(doc){return v2.scheduleGames(doc);}
function gameDistance(game,referenceTime){const a=dateMs(game?.startTimeUTC),b=dateMs(referenceTime);return a!=null&&b!=null?Math.abs(a-b):0;}
function gameSide(game,team){
  for(const side of ['away','home'])if(v2.teamMatches(team,game?.[side]?.name)||v2.teamMatches(team,game?.[side]?.abbreviation)||String(game?.[side]?.id||'')===String(team||''))return side;
  return null;
}
function gameForTeam(games,teamOrId,referenceTime){return [...games].filter(g=>gameSide(g,teamOrId)).sort((a,b)=>gameDistance(a,referenceTime)-gameDistance(b,referenceTime))[0]||null;}
async function loadSchedules(referenceTime){
  const docs=await Promise.all(nearbyDateKeys(referenceTime).map(async key=>{
    try{return await cached(scheduleCache,key,`${MLB_API}/schedule?sportId=1&date=${encodeURIComponent(key)}`);}catch(_){return null;}
  }));
  return docs.filter(Boolean).flatMap(scheduleGames);
}
async function searchPeople(playerName){
  const key=normName(playerName);if(!key)return [];
  if(searchCache.has(key)&&Date.now()-searchCache.get(key).ts<CACHE_MS)return searchCache.get(key).value;
  let rows=[];
  for(const query of [
    `${MLB_API}/people/search?names=${encodeURIComponent(stripInvisible(playerName))}&active=true&sportIds=1&hydrate=currentTeam`,
    `${MLB_API}/people/search?names=${encodeURIComponent(stripInvisible(playerName))}&sportIds=1&hydrate=currentTeam`,
  ]){
    try{const doc=await fetchJson(query);rows=personRows(doc);if(rows.length)break;}catch(_){ }
  }
  searchCache.set(key,{ts:Date.now(),value:rows});return rows;
}
async function loadRoster(teamId,season,type){
  const key=`${teamId}:${season}:${type}`;
  return cached(rosterCache,key,`${MLB_API}/teams/${encodeURIComponent(teamId)}/roster?rosterType=${encodeURIComponent(type)}&season=${encodeURIComponent(season)}`,true);
}
async function findOfficialPlayer(leg,referenceTime){
  const cleanedPlayer=stripInvisible(leg?.player),team=leg?.team||null;
  if(!cleanedPlayer)return null;
  const people=await searchPeople(cleanedPlayer);
  let exact=people.filter(p=>normName(p.name)===normName(cleanedPlayer));
  if(team)exact=exact.filter(p=>!p.teamName||v2.teamMatches(team,p.teamName));
  if(exact.length===1)return exact[0];
  if(exact.length>1){const teamExact=exact.filter(p=>p.teamName&&v2.teamMatches(team,p.teamName));if(teamExact.length===1)return teamExact[0];return null;}

  const games=await loadSchedules(referenceTime);
  const teamGame=team?gameForTeam(games,team,referenceTime):null;
  const side=teamGame?gameSide(teamGame,team):null;
  const teamId=teamGame?.[side]?.id||null;
  if(!teamId)return null;
  const season=(new Date(referenceTime||Date.now())).getUTCFullYear();
  const rows=[];
  for(const type of ['40Man','active']){
    try{rows.push(...rosterRows(await loadRoster(teamId,season,type)));}catch(_){ }
  }
  const unique=[];const seen=new Set();
  for(const row of rows){if(!row.id||seen.has(row.id))continue;seen.add(row.id);unique.push(row);}
  const fuzzy=unique.filter(p=>editDistance(p.name,cleanedPlayer)<=1);
  if(fuzzy.length!==1)return null;
  return {...fuzzy[0],teamId:String(teamId),teamName:teamGame?.[side]?.name||team};
}
function normalizedState(value){
  const state=String(value||'').toLowerCase();
  if(/final|completed|game over/.test(state))return 'post';
  if(/live|in progress|manager challenge/.test(state))return 'in';
  if(/postponed|cancelled|suspended/.test(state))return 'unavailable';
  if(/preview|scheduled|pre/.test(state))return 'pre';
  return null;
}
function scheduleState(game,nowValue){
  const named=normalizedState(game?.abstractState)||normalizedState(game?.detailedState);if(named)return named;
  const start=dateMs(game?.startTimeUTC),now=dateMs(nowValue)||Date.now();return start!=null&&now>=start?'in':'pre';
}
async function resolveUnmatchedLeg(leg,options={}){
  const referenceTime=options.referenceTime||new Date().toISOString(),nowValue=options.now||new Date().toISOString();
  const player=await findOfficialPlayer(leg,referenceTime);if(!player)return null;
  const games=await loadSchedules(referenceTime);
  const game=gameForTeam(games,player.teamId||player.teamName||leg.team,referenceTime);
  if(!game)return null;
  const side=gameSide(game,player.teamId||player.teamName||leg.team);
  if(leg.team&&side&&!(v2.teamMatches(leg.team,game?.[side]?.name)||v2.teamMatches(leg.team,game?.[side]?.abbreviation)))return null;
  const opponent=side==='away'?game.home:game.away;
  const teamName=game?.[side]?.name||player.teamName||leg.team||'';
  const matchup=teamName&&opponent?.name?`${teamName} vs ${opponent.name}`:teamName||opponent?.name||null;
  const state=scheduleState(game,nowValue);
  const base={...leg,player:stripInvisible(leg.player),matchedPlayerName:player.name,identityAlias:player.name!==stripInvisible(leg.player)?player.name:null,
    gameId:game.gamePk,matchup,startTimeUTC:game.startTimeUTC,gameState:state,resolutionSource:'mlb-official-player-search',displayMarket:v2.displayMarket(leg),target:v2.targetForLeg(leg),probability:null,probabilityPct:null,probabilityMethod:null,marketOptions:[]};
  if(state==='pre')return {...base,status:'PENDING',current:0};
  if(state==='unavailable')return {...base,status:'VOID',current:null,resolutionReason:'mlb-game-unavailable'};
  let feed=null;try{feed=await fetchJson(MLB_FEED(game.gamePk));}catch(_){ }
  if(!feed)return {...base,status:'LIVE',current:null,resolutionReason:'mlb-official-feed-temporarily-unavailable'};
  const stats=v2.playerGameStats(feed,player.id,player.name);
  const current=v2.currentForMarket(stats,leg.market);
  const feedState=normalizedState(feed?.gameData?.status?.abstractGameState)||normalizedState(feed?.gameData?.status?.detailedState)||state;
  let status;
  if(!v2.MARKET_META[leg.market])status=feedState==='post'?'VOID':feedState==='pre'?'PENDING':'LIVE';
  else if(feedState==='post'&&!stats._present)status='VOID';
  else status=v2.settleStatus(leg,current==null&&feedState==='in'&&stats._present?0:current,feedState);
  const finalCurrent=current==null&&feedState==='in'&&stats._present?0:current;
  return {...base,gameState:feedState,status,current:finalCurrent,resolutionReason:status==='VOID'?'mlb-player-did-not-record-box-score-stats':undefined,probability:status==='HIT'?1:status==='MISS'?0:null,probabilityPct:status==='HIT'?100:status==='MISS'?0:null};
}
function counts(results){return {hit:results.filter(r=>r.status==='HIT').length,miss:results.filter(r=>r.status==='MISS').length,live:results.filter(r=>r.status==='LIVE').length,pending:results.filter(r=>r.status==='PENDING').length,void:results.filter(r=>r.status==='VOID').length,unresolved:results.filter(r=>r.status==='UNRESOLVED').length};}
async function analyzeMlbSlip(rawLegs,options={}){
  const analysis=await v2.analyzeMlbSlip(rawLegs,options),results=[...(analysis?.results||[])];
  for(let i=0;i<results.length;i++){
    const row=results[i];
    if(String(row?.status||'').toUpperCase()!=='UNRESOLVED'||row?.resolutionReason!=='mlb-player-not-found-in-model-or-official-sources')continue;
    try{const resolved=await resolveUnmatchedLeg(row,options);if(resolved)results[i]=resolved;}catch(_){ }
  }
  return {...analysis,source:`${analysis.source} + official MLB player-search fallback`,results,counts:counts(results)};
}

module.exports={...v2,analyzeMlbSlip,resolveUnmatchedLeg,findOfficialPlayer,searchPeople,stripInvisible,normName,editDistance};
