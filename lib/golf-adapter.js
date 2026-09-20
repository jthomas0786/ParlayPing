const OUTPOST_URL='https://raw.githubusercontent.com/jthomas0786/The-Sports-Outpost/main/slates/golf-outrights.json';

const finite=value=>value===null||value===undefined||value===''?null:(Number.isFinite(Number(value))?Number(value):null);
const pct=value=>Number.isFinite(value)?Math.round(value*1000)/10:null;
function norm(value){return String(value||'').toLowerCase().normalize('NFKD').replace(/[.'’]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
function tokenKey(value){return norm(value).split(' ').filter(Boolean).sort().join(' ');}
function sameGolfer(a,b){const x=norm(a),y=norm(b);if(!x||!y)return false;return x===y||tokenKey(x)===tokenKey(y);}
function displayMarket(){return 'TOURNAMENT WINNER';}
function unresolved(leg,reason,extra={}){return {...leg,...extra,status:'UNRESOLVED',resolutionReason:reason,displayMarket:displayMarket(),probability:null,probabilityPct:null,probabilityMethod:null,current:null,target:1,marketOptions:[]};}

async function loadGolfOutrights(){
  const response=await fetch(OUTPOST_URL,{headers:{accept:'application/json','user-agent':'ParlayPing/0.11'},cache:'no-store'});
  if(response.status===404)return {meta:{source:'not-yet-published',settlementConnected:false},rows:[]};
  if(!response.ok)throw new Error(`Golf outright snapshot request failed (${response.status})`);
  return response.json();
}
function matchingRows(snapshot,leg){
  return (snapshot?.rows||[]).filter(row=>row?.sport==='GOLF'&&row?.market==='tournamentWinner'&&sameGolfer(row?.selection,leg?.player));
}
function groupKey(row){return [row?.sportKey,row?.eventId,row?.marketId].map(v=>String(v||'')).join('|');}
function findGolfOutright(snapshot,leg){
  const rows=matchingRows(snapshot,leg);
  if(!rows.length)return null;
  if(leg?.gameId){
    const id=String(leg.gameId);
    const exact=rows.filter(row=>String(row?.eventId||'')===id||String(row?.marketId||'')===id||groupKey(row)===id);
    return exact.length===1?exact[0]:null;
  }
  const groups=new Map();
  for(const row of rows){const key=groupKey(row);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  if(groups.size!==1)return null;
  const only=[...groups.values()][0];
  return only.length===1?only[0]:null;
}
function fairProbability(row){const value=finite(row?.fairProbability);return value!==null&&value>0&&value<1?value:null;}

async function analyzeGolfSlip(rawLegs,options={}){
  const legs=(Array.isArray(rawLegs)?rawLegs:[]).filter(leg=>String(leg?.sport||'').toUpperCase()==='GOLF').slice(0,20);
  if(!legs.length)throw new Error('No GOLF legs were provided.');
  const snapshot=options.snapshot||await loadGolfOutrights();
  const analyzed=[];
  for(const leg of legs){
    if(leg.market!=='tournamentWinner'){
      analyzed.push(unresolved(leg,'golf-market-not-supported-by-outright-feed'));
      continue;
    }
    const row=findGolfOutright(snapshot,leg);
    if(!row){
      analyzed.push(unresolved(leg,'golf-tournament-winner-not-found-or-ambiguous'));
      continue;
    }
    const probability=fairProbability(row);
    const base={gameId:groupKey(row),matchup:row.tournament||row.sportKey||'Golf Tournament',tournament:row.tournament||null,sportKey:row.sportKey||null};
    if(probability===null){
      analyzed.push(unresolved(leg,'golf-pinnacle-outright-price-not-available',base));
      continue;
    }
    analyzed.push({...leg,...base,gameState:'sportsbook-only',status:'PENDING',resolutionReason:null,displayMarket:displayMarket(),current:null,target:1,probability,probabilityPct:pct(probability),probabilityMethod:'pinnacle-devig-outright-field',marketOptions:[]});
  }
  return {ok:true,generatedAt:new Date().toISOString(),dataGeneratedAt:snapshot?.meta?.fetchedAt||null,source:'The Sports Outpost GOLF complete Pinnacle outright field snapshot',results:analyzed};
}

module.exports={sameGolfer,findGolfOutright,analyzeGolfSlip,loadGolfOutrights,groupKey};
