const OUTPOST_URL='https://raw.githubusercontent.com/jthomas0786/The-Sports-Outpost/main/slates/generic-match-odds.json';
const GENERIC_SPORTS=new Set(['VOLLEYBALL','CRICKET','RUGBY_LEAGUE','AFL','BOXING']);
const UNANCHORED_WINDOW_MS=12*3600_000;
const MIN_AMBIGUITY_GAP_MS=3*3600_000;

const finite=value=>value===null||value===undefined||value===''?null:(Number.isFinite(Number(value))?Number(value):null);
const pct=value=>Number.isFinite(value)?Math.round(value*1000)/10:null;
function norm(value){return String(value||'').toLowerCase().normalize('NFKD').replace(/[.'’]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
function sameSelection(a,b){const x=norm(a),y=norm(b);return Boolean(x&&y&&x===y);}
function displayMarket(){return 'MATCH WINNER';}
function matchup(row){return `${row?.awayTeam||''} @ ${row?.homeTeam||''}`.trim();}
function unresolved(leg,reason,extra={}){return {...leg,...extra,status:'UNRESOLVED',resolutionReason:reason,displayMarket:displayMarket(),probability:null,probabilityPct:null,probabilityMethod:null,current:null,target:1,marketOptions:[]};}

async function loadGenericMatchOdds(){
  const response=await fetch(OUTPOST_URL,{headers:{accept:'application/json','user-agent':'ParlayPing/0.10'},cache:'no-store'});
  if(response.status===404)return {meta:{source:'not-yet-published',settlementConnected:false},rows:[]};
  if(!response.ok)throw new Error(`Generic match snapshot request failed (${response.status})`);
  return response.json();
}
function selectionRows(snapshot,leg){
  return (snapshot?.rows||[]).filter(row=>
    row?.market==='matchWinner'&&
    String(row?.sport||'').toUpperCase()===String(leg?.sport||'').toUpperCase()&&
    sameSelection(row?.selection,leg?.player)
  );
}
function groupEvents(rows){
  const map=new Map();
  for(const row of rows){
    const id=String(row?.eventId||'');if(!id)continue;
    if(!map.has(id))map.set(id,[]);
    map.get(id).push(row);
  }
  return [...map.values()];
}
function findGenericOddsEvent(snapshot,leg,{referenceTime}={}){
  const groups=groupEvents(selectionRows(snapshot,leg));
  if(!groups.length)return null;
  if(leg?.gameId){
    const exact=groups.find(rows=>rows.some(row=>String(row?.eventId||'')===String(leg.gameId)));
    return exact?.find(row=>sameSelection(row.selection,leg.player))||null;
  }
  if(groups.length===1)return groups[0].find(row=>sameSelection(row.selection,leg.player))||null;
  const ref=Date.parse(referenceTime||'');if(!Number.isFinite(ref))return null;
  const ranked=groups.map(rows=>({rows,start:Date.parse(rows[0]?.commenceTime||'')})).filter(item=>Number.isFinite(item.start)).sort((a,b)=>Math.abs(a.start-ref)-Math.abs(b.start-ref));
  if(!ranked.length)return null;
  const nearest=Math.abs(ranked[0].start-ref);
  const next=ranked[1]?Math.abs(ranked[1].start-ref):Infinity;
  if(nearest>UNANCHORED_WINDOW_MS||next-nearest<MIN_AMBIGUITY_GAP_MS)return null;
  return ranked[0].rows.find(row=>sameSelection(row.selection,leg.player))||null;
}
function fairProbability(row){const value=finite(row?.fairProbability);return value!==null&&value>0&&value<1?value:null;}

async function analyzeGenericMatchSlip(sport,rawLegs,options={}){
  const normalizedSport=String(sport||'').toUpperCase();
  if(!GENERIC_SPORTS.has(normalizedSport))throw new Error(`Unsupported generic match sport: ${normalizedSport||'UNKNOWN'}`);
  const legs=(Array.isArray(rawLegs)?rawLegs:[]).filter(leg=>String(leg?.sport||'').toUpperCase()===normalizedSport).slice(0,20);
  if(!legs.length)throw new Error(`No ${normalizedSport} legs were provided.`);
  const snapshot=await loadGenericMatchOdds();
  const referenceTime=options.referenceTime||new Date().toISOString();
  const now=Number.isFinite(Number(options.now))?Number(options.now):Date.now();
  const analyzed=[];
  for(const leg of legs){
    if(leg.market!=='matchWinner'){
      analyzed.push(unresolved(leg,`${normalizedSport.toLowerCase()}-market-not-supported-by-two-way-match-feed`));
      continue;
    }
    const row=findGenericOddsEvent(snapshot,leg,{referenceTime});
    if(!row){
      analyzed.push(unresolved(leg,`${normalizedSport.toLowerCase()}-match-winner-not-found-or-ambiguous`));
      continue;
    }
    const start=Date.parse(row.commenceTime||'');
    const base={gameId:String(row.eventId||''),matchup:matchup(row),startTimeUTC:row.commenceTime||null};
    if(!Number.isFinite(start)){
      analyzed.push(unresolved(leg,`${normalizedSport.toLowerCase()}-event-time-unavailable`,base));
      continue;
    }
    if(now>=start){
      analyzed.push(unresolved(leg,`${normalizedSport.toLowerCase()}-trustworthy-live-final-source-not-connected`,{...base,gameState:'in-or-post'}));
      continue;
    }
    const probability=fairProbability(row);
    if(probability===null){
      analyzed.push(unresolved(leg,`${normalizedSport.toLowerCase()}-pinnacle-two-sided-price-not-available`,{...base,gameState:'pre'}));
      continue;
    }
    analyzed.push({...leg,...base,gameState:'pre',status:'PENDING',resolutionReason:null,displayMarket:displayMarket(),current:null,target:1,probability,probabilityPct:pct(probability),probabilityMethod:'pinnacle-devig-h2h',marketOptions:[]});
  }
  return {ok:true,generatedAt:new Date().toISOString(),dataGeneratedAt:snapshot?.meta?.fetchedAt||null,source:`The Sports Outpost ${normalizedSport} complete two-sided Pinnacle match-winner snapshot`,results:analyzed};
}

module.exports={GENERIC_SPORTS,sameSelection,findGenericOddsEvent,analyzeGenericMatchSlip,loadGenericMatchOdds};
