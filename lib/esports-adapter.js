const OUTPOST_BASE='https://raw.githubusercontent.com/jthomas0786/The-Sports-Outpost/main/slates';
const ODDS_FILE='esports-match-odds.json';
const RESULTS_FILE='esports-results.json';
const MAX_MATCH_WINDOW_MS=12*3600_000;
const UNANCHORED_WINDOW_MS=8*3600_000;

const finite=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const pct=v=>Number.isFinite(v)?Math.round(v*1000)/10:null;
function norm(value){return String(value||'').toLowerCase().normalize('NFKD').replace(/[.'’]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
function sameTeam(a,b){const x=norm(a),y=norm(b);return Boolean(x&&y&&x===y);}
function matchup(row){return `${row?.awayTeam||''} @ ${row?.homeTeam||''}`.trim();}
function displayMarket(){return 'MATCH WINNER';}
function unresolved(leg,reason,extra={}){return {...leg,...extra,status:'UNRESOLVED',resolutionReason:reason,displayMarket:displayMarket(),probability:null,probabilityPct:null,probabilityMethod:null,current:null,target:1,marketOptions:[]};}
function latestDataTime(...values){const times=values.map(v=>Date.parse(v||'')).filter(Number.isFinite);return times.length?new Date(Math.max(...times)).toISOString():null;}

async function fetchSnapshot(file,label){
  const response=await fetch(`${OUTPOST_BASE}/${file}`,{headers:{accept:'application/json','user-agent':'ParlayPing/0.10'},cache:'no-store'});
  if(response.status===404)return null;
  if(!response.ok)throw new Error(`ESPORTS ${label} snapshot request failed (${response.status})`);
  return response.json();
}
async function loadEsportsOdds(){return (await fetchSnapshot(ODDS_FILE,'odds'))||{meta:{sport:'ESPORTS'},rows:[]};}
async function loadEsportsResults(){return fetchSnapshot(RESULTS_FILE,'results');}

function selectionRows(snapshot,leg){
  return (snapshot?.rows||[]).filter(row=>row?.market==='matchWinner'&&sameTeam(row?.selection,leg?.player));
}
function groupEvents(rows){
  const map=new Map();
  for(const row of rows){const id=String(row?.eventId||'');if(!id)continue;if(!map.has(id))map.set(id,[]);map.get(id).push(row);}
  return [...map.values()];
}
function findEsportsOddsEvent(snapshot,leg,{referenceTime}={}){
  const groups=groupEvents(selectionRows(snapshot,leg));
  if(!groups.length)return null;
  if(leg?.gameId){const exact=groups.find(rows=>rows.some(row=>String(row?.eventId||'')===String(leg.gameId)));if(exact)return exact.find(row=>sameTeam(row.selection,leg.player))||null;}
  if(groups.length===1)return groups[0].find(row=>sameTeam(row.selection,leg.player))||null;
  const ref=Date.parse(referenceTime||'');if(!Number.isFinite(ref))return null;
  const ranked=groups.map(rows=>({rows,start:Date.parse(rows[0]?.commenceTime||'')})).filter(x=>Number.isFinite(x.start)).sort((a,b)=>Math.abs(a.start-ref)-Math.abs(b.start-ref));
  if(!ranked.length)return null;
  const firstDistance=Math.abs(ranked[0].start-ref),secondDistance=ranked[1]?Math.abs(ranked[1].start-ref):Infinity;
  if(firstDistance<=UNANCHORED_WINDOW_MS&&secondDistance-firstDistance>4*3600_000)return ranked[0].rows.find(row=>sameTeam(row.selection,leg.player))||null;
  return null;
}
function finalMatches(snapshot){return Object.values(snapshot?.matches||{}).filter(match=>match?.final===true||match?.status==='FINAL');}
function samePair(match,eventRow){
  if(!match||!eventRow)return false;
  if(match.sportKey&&eventRow.sportKey&&String(match.sportKey)!==String(eventRow.sportKey))return false;
  const a=[norm(match.homeTeam),norm(match.awayTeam)].sort().join('|');
  const b=[norm(eventRow.homeTeam),norm(eventRow.awayTeam)].sort().join('|');
  if(!a||!b||a!==b)return false;
  const x=Date.parse(match.commenceTime||''),y=Date.parse(eventRow.commenceTime||'');
  return !Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x-y)<=MAX_MATCH_WINDOW_MS;
}
function findEsportsFinal(snapshot,leg,{referenceTime,eventRow}={}){
  const matches=finalMatches(snapshot);
  if(eventRow){
    const exactId=matches.find(match=>String(match.id||'')===String(eventRow.eventId||''));
    if(exactId&&[exactId.homeTeam,exactId.awayTeam].some(team=>sameTeam(team,leg.player)))return exactId;
    const paired=matches.filter(match=>samePair(match,eventRow)&&[match.homeTeam,match.awayTeam].some(team=>sameTeam(team,leg.player)));
    return paired.length===1?paired[0]:null;
  }
  const ref=Date.parse(referenceTime||'');
  const candidates=matches.filter(match=>{
    if(![match.homeTeam,match.awayTeam].some(team=>sameTeam(team,leg.player)))return false;
    const t=Date.parse(match.commenceTime||'');
    return Number.isFinite(ref)&&Number.isFinite(t)&&Math.abs(t-ref)<=UNANCHORED_WINDOW_MS;
  });
  return candidates.length===1?candidates[0]:null;
}
function fairProbability(eventRow){const value=finite(eventRow?.fairProbability);return value!==null&&value>0&&value<1?value:null;}
function gradeFinal(leg,match,eventRow){
  const base={gameId:String(eventRow?.eventId||match?.id||''),matchup:matchup(eventRow||match),startTimeUTC:eventRow?.commenceTime||match?.commenceTime||null,gameState:'post',displayMarket:displayMarket(),target:1,marketOptions:[]};
  const probability=fairProbability(eventRow);
  if(match?.voidLike)return {...unresolved(leg,'esports-final-void-like',base),probability,probabilityPct:pct(probability),probabilityMethod:probability===null?null:'pinnacle-devig-h2h'};
  if(!match?.winner)return {...unresolved(leg,'esports-final-winner-not-available',base),probability,probabilityPct:pct(probability),probabilityMethod:probability===null?null:'pinnacle-devig-h2h'};
  if(![match.homeTeam,match.awayTeam].some(team=>sameTeam(team,leg.player)))return unresolved(leg,'esports-selection-not-found-in-final',base);
  const won=sameTeam(match.winner,leg.player);
  return {...leg,...base,status:won?'HIT':'MISS',resolutionReason:null,current:won?1:0,probability,probabilityPct:pct(probability),probabilityMethod:probability===null?null:'pinnacle-devig-h2h'};
}

async function analyzeEsportsSlip(rawLegs,options={}){
  const legs=(Array.isArray(rawLegs)?rawLegs:[]).filter(leg=>String(leg?.sport||'').toUpperCase()==='ESPORTS').slice(0,20);
  if(!legs.length)throw new Error('No ESPORTS legs were provided.');
  const [odds,results]=await Promise.all([loadEsportsOdds(),loadEsportsResults().catch(()=>null)]);
  const referenceTime=options.referenceTime||new Date().toISOString();
  const now=Number.isFinite(Number(options.now))?Number(options.now):Date.now();
  const analyzed=[];
  for(const leg of legs){
    if(leg.market!=='matchWinner'){
      analyzed.push(unresolved(leg,'esports-market-not-supported-by-trustworthy-match-feed'));
      continue;
    }
    const eventRow=findEsportsOddsEvent(odds,leg,{referenceTime});
    const final=findEsportsFinal(results,leg,{referenceTime,eventRow});
    if(final){analyzed.push(gradeFinal(leg,final,eventRow));continue;}
    if(!eventRow){
      analyzed.push(unresolved(leg,'esports-match-winner-not-found-in-current-pinnacle-snapshot-and-no-unambiguous-final'));
      continue;
    }
    const start=Date.parse(eventRow.commenceTime||'');
    const base={gameId:String(eventRow.eventId||''),matchup:matchup(eventRow),startTimeUTC:eventRow.commenceTime||null};
    if(!Number.isFinite(start)){analyzed.push(unresolved(leg,'esports-event-time-unavailable',base));continue;}
    if(now>=start){analyzed.push(unresolved(leg,'esports-final-result-not-yet-available',{...base,gameState:'in-or-post'}));continue;}
    const probability=fairProbability(eventRow);
    if(probability===null){analyzed.push(unresolved(leg,'esports-pinnacle-two-sided-price-not-available',{...base,gameState:'pre'}));continue;}
    analyzed.push({...leg,...base,gameState:'pre',status:'PENDING',resolutionReason:null,displayMarket:displayMarket(),current:null,target:1,probability,probabilityPct:pct(probability),probabilityMethod:'pinnacle-devig-h2h',marketOptions:[]});
  }
  return {ok:true,generatedAt:new Date().toISOString(),dataGeneratedAt:latestDataTime(odds?.meta?.fetchedAt,results?.generatedAt),source:'The Sports Outpost ESPORTS Pinnacle match-winner snapshot + ParlayAPI CS2/Valorant/Dota2 final-result archive',results:analyzed};
}

module.exports={sameTeam,findEsportsOddsEvent,findEsportsFinal,gradeFinal,analyzeEsportsSlip,loadEsportsOdds,loadEsportsResults};
