const SNAPSHOT_BASE=String(process.env.SPORTS_OUTPOST_BASE_URL||'https://thesportsoutpost.com').replace(/\/$/,'');
const SNAPSHOT_PATH='/slates/nfl-odds.json';
// The TSO public site occasionally rewrites the JSON snapshot to an HTML
// application shell. Use only the published TSO source repository as fallback.
const BACKUP_SNAPSHOT_URL='https://raw.githubusercontent.com/jthomas0786/The-Sports-Outpost/main/slates/nfl-odds.json';
const CACHE_MS=60_000;
const BACKUP_MAX_AGE_MS=6*60*60*1000;
const WARNING_INTERVAL_MS=10*60*1000;
let cached=null,lastWarningAt=0;

const finite=value=>value===null||value===undefined||value===''?null:(Number.isFinite(Number(value))?Number(value):null);
const norm=value=>String(value||'').toLowerCase().normalize('NFKD').replace(/[.'’]/g,'').replace(/\b(jr|sr|ii|iii|iv|v)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const compact=value=>norm(value).replace(/\s+/g,'');
const MARKET_ALIASES={
  receivingyards:'recYds',recyards:'recYds',recyds:'recYds',
  rushingyards:'rushYds',rushyards:'rushYds',rushyds:'rushYds',
  passingyards:'passYds',passyards:'passYds',passyds:'passYds',
  receptions:'receptions',catches:'receptions',
  passingtds:'passTds',passtds:'passTds',
  completions:'completions',
  anytimetd:'atd',anytimetouchdown:'atd',atd:'atd',
  firsttd:'firstTd',firsttouchdown:'firstTd',firsttouchdownscorer:'firstTd'
};
const BINARY_MARKETS=new Set(['atd','firstTd']);

function marketKey(value){
  const raw=String(value||'').trim();
  if(['recYds','rushYds','passYds','receptions','passTds','completions','atd','firstTd'].includes(raw))return raw;
  return MARKET_ALIASES[compact(raw)]||raw;
}
function sideOf(leg){const side=String(leg?.side||'over').toLowerCase();return side==='under'||side==='no'?'under':'over';}
function sportsbookLineForLeg(leg){
  const line=finite(leg?.line);if(line==null)return null;
  if(leg?.inclusive===true&&Number.isInteger(line))return sideOf(leg)==='under'?line+0.5:line-0.5;
  return line;
}
function allOffers(branch){
  if(!branch||typeof branch!=='object')return[];
  const rows=[];
  if(branch.best&&typeof branch.best==='object')rows.push(branch.best);
  if(Array.isArray(branch.all))rows.push(...branch.all.filter(item=>item&&typeof item==='object'));
  if((branch.book||branch.sportsbook)&&finite(branch.price??branch.oddsAmerican)!=null)rows.push(branch);
  return rows;
}
function exactMarketAvailable(player,leg){
  const market=marketKey(leg?.market),slot=player?.odds?.[market];
  if(!slot)return false;
  const side=sideOf(leg);
  if(BINARY_MARKETS.has(market))return allOffers(slot).some(offer=>finite(offer?.price??offer?.oddsAmerican)!=null);
  const wanted=sportsbookLineForLeg(leg);if(wanted==null)return false;
  const rows=Array.isArray(slot.alternates)&&slot.alternates.length?slot.alternates:(finite(slot.line)!=null?[slot]:[]);
  return rows.some(row=>Math.abs(Number(row?.line)-wanted)<1e-7&&allOffers(row?.[side]).some(offer=>finite(offer?.price??offer?.oddsAmerican)!=null));
}
function teamMatches(requested,playerTeam,game){
  if(!requested)return true;
  const wanted=compact(requested);if(!wanted)return true;
  const values=[playerTeam,game?.awayTeam,game?.homeTeam,game?.away?.abbr,game?.away?.name,game?.home?.abbr,game?.home?.name].map(compact).filter(Boolean);
  return values.some(value=>value===wanted||value.includes(wanted)||wanted.includes(value));
}
function matchup(game){
  const away=game?.awayTeam||game?.away?.abbr||game?.away?.name||game?.awayName||'';
  const home=game?.homeTeam||game?.home?.abbr||game?.home?.name||game?.homeName||'';
  return away&&home?`${away} @ ${home}`:'';
}
function gameMatchesContext(game,leg){
  const gameId=String(game?.gameId||game?.eventId||game?.id||''),wantedId=String(leg?.gameId||'');
  if(wantedId&&gameId!==wantedId)return false;
  const wantedMatch=norm(leg?.matchup||'');
  if(wantedMatch&&norm(matchup(game))!==wantedMatch)return false;
  return true;
}
function rescueNflPregameRows(results,legs,snapshot,{now=Date.now()}={}){
  const games=Array.isArray(snapshot?.games)?snapshot.games:[];
  return (Array.isArray(results)?results:[]).map((row,index)=>{
    if(String(row?.status||'').toUpperCase()!=='UNRESOLVED'||String(row?.resolutionReason||'')!=='nfl-player-or-team-not-found-in-current-simulation')return row;
    const leg=(Array.isArray(legs)?legs:[]).find(item=>String(item?.id||'')===String(row?.id||''))||(Array.isArray(legs)?legs[index]:null)||row;
    const wanted=norm(leg?.player);if(!wanted)return row;
    const candidates=[];
    for(const game of games){
      if(!gameMatchesContext(game,leg))continue;
      const startTimeUTC=game?.startDateUTC||game?.startTimeUTC||game?.commenceTime||game?.startTime||null;
      const start=Date.parse(startTimeUTC||'');
      if(!Number.isFinite(start)||start<=Number(now))continue;
      for(const player of game?.players||[]){
        if(norm(player?.name)!==wanted)continue;
        if(!teamMatches(leg?.team,player?.team,game))continue;
        if(!exactMarketAvailable(player,leg))continue;
        candidates.push({game,player,startTimeUTC});
      }
    }
    if(candidates.length!==1)return row;
    const hit=candidates[0],gameId=String(hit.game?.gameId||hit.game?.eventId||hit.game?.id||'');
    return {
      ...row,
      gameId:gameId||row?.gameId||null,
      matchup:matchup(hit.game)||row?.matchup||null,
      startTimeUTC:hit.startTimeUTC,
      gameState:'pre',
      status:'PENDING',
      resolutionReason:undefined,
      current:null,
      probability:null,
      probabilityPct:null,
      probabilityMethod:null,
      marketOptions:Array.isArray(row?.marketOptions)?row.marketOptions:[],
      sportsbookPregameFallback:true,
      sportsbookPregameFallbackSource:'ParlayAPI/The Sports Outpost exact sportsbook board'
    };
  });
}
async function fetchSnapshot(url,{backup=false}={}){
  const response=await fetch(url,{
    headers:{accept:'application/json','user-agent':'ParlayPing/1.3'},
    cache:'no-store',signal:AbortSignal.timeout(6500)
  });
  if(!response.ok)throw new Error(`NFL odds source HTTP ${response.status}`);
  const type=String(response.headers?.get?.('content-type')||'').toLowerCase();
  if(type.includes('text/html'))throw new Error('NFL odds source returned HTML instead of JSON');
  let value;
  try{value=await response.json()}catch{throw new Error('NFL odds source returned invalid JSON');}
  if(!value||!Array.isArray(value.games))throw new Error('NFL odds source has no games array');
  if(backup){
    const fetched=Date.parse(value.meta?.fetchedAt||'');
    if(value.meta?.source!=='parlayapi'||value.meta?.sample!==false)
      throw new Error('NFL backup is not a published ParlayAPI snapshot');
    if(!Number.isFinite(fetched)||fetched>Date.now()+60_000||Date.now()-fetched>BACKUP_MAX_AGE_MS)
      throw new Error('NFL backup odds snapshot is stale');
  }
  return value;
}
function warnOnce(message){
  if(Date.now()-lastWarningAt<WARNING_INTERVAL_MS)return;
  lastWarningAt=Date.now();
  console.warn('ParlayPing NFL odds snapshot fallback',message);
}
async function loadNflOddsSnapshot(){
  if(cached&&Date.now()-cached.ts<CACHE_MS)return cached.value;
  try{
    const value=await fetchSnapshot(`${SNAPSHOT_BASE}${SNAPSHOT_PATH}`);
    cached={ts:Date.now(),value};return value;
  }catch(primaryError){
    try{
      const value=await fetchSnapshot(BACKUP_SNAPSHOT_URL,{backup:true});
      cached={ts:Date.now(),value};
      warnOnce('TSO website JSON unavailable; using recent official TSO published snapshot.');
      return value;
    }catch(backupError){
      warnOnce(`No verified NFL odds source: primary ${primaryError.message}; backup ${backupError.message}`);
      throw new Error('A fresh verified NFL sportsbook odds snapshot is unavailable.');
    }
  }
}
async function rescueNflPregameAnalysis(analysis,legs,options={}){
  const rows=Array.isArray(analysis?.results)?analysis.results:[];
  if(!rows.some(row=>String(row?.resolutionReason||'')==='nfl-player-or-team-not-found-in-current-simulation'))return analysis;
  let snapshot=options.snapshot||null;
  if(!snapshot){try{snapshot=await loadNflOddsSnapshot();}catch(error){warnOnce(error?.message||'NFL odds source unavailable');return analysis;}}
  const results=rescueNflPregameRows(rows,legs,snapshot,{now:options.now??Date.now()});
  const pending=results.filter(row=>row.status==='PENDING');
  return {
    ...analysis,
    results,
    counts:{
      ...(analysis?.counts||{}),
      hit:results.filter(row=>row.status==='HIT').length,
      miss:results.filter(row=>row.status==='MISS').length,
      live:results.filter(row=>row.status==='LIVE').length,
      pending:pending.length,
      unresolved:results.filter(row=>row.status==='UNRESOLVED').length
    },
    combinedTailProbability:pending.length&&pending.every(row=>Number.isFinite(row.probability))?pending.reduce((p,row)=>p*row.probability,1):null
  };
}

module.exports={marketKey,sportsbookLineForLeg,exactMarketAvailable,rescueNflPregameRows,rescueNflPregameAnalysis,loadNflOddsSnapshot,fetchSnapshot};
