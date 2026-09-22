const {samePerson}=require('./extended-live-grading');
const {quoteProbability,displayMarket,targetForLeg}=require('./extended-market-engine');

const OUTPOST_BASE='https://raw.githubusercontent.com/jthomas0786/The-Sports-Outpost/main/slates';
const ODDS_FILE='table-tennis-odds.json';
const LIVE_FILE='table-tennis-live.json';
const MAX_DISTANCE_MS=48*60*60*1000;
const UNANCHORED_WINDOW_MS=6*60*60*1000;

function dateDistance(a,b){
  const x=Date.parse(a||''),y=Date.parse(b||'');
  return Number.isFinite(x)&&Number.isFinite(y)?Math.abs(x-y):Infinity;
}
async function fetchJson(file){
  const r=await fetch(`${OUTPOST_BASE}/${file}`,{headers:{accept:'application/json','user-agent':'ParlayPing/0.9'},cache:'no-store'});
  if(r.status===404)return null;
  if(!r.ok)throw new Error(`TABLE_TENNIS ${file} request failed (${r.status})`);
  return r.json();
}
function oddsRows(snapshot,leg){
  return (snapshot?.rows||[]).filter(r=>r?.market==='matchWinner'&&samePerson(r?.player,leg?.player));
}
function closestOddsRow(snapshot,leg,referenceTime){
  const ref=Date.parse(referenceTime||'');
  const rows=oddsRows(snapshot,leg).filter(r=>Number.isFinite(Date.parse(r?.commenceTime||'')));
  rows.sort((a,b)=>{
    const at=Date.parse(a.commenceTime),bt=Date.parse(b.commenceTime);
    const da=Number.isFinite(ref)?Math.abs(at-ref):at;
    const db=Number.isFinite(ref)?Math.abs(bt-ref):bt;
    return da-db;
  });
  return rows[0]||null;
}
function eventOpponents(row){return [row?.homeTeam,row?.awayTeam].filter(Boolean);}
function matchMatchesEvent(match,row){
  const expected=eventOpponents(row);if(!expected.length)return true;
  const actual=(match?.players||[]).map(p=>p?.name).filter(Boolean);
  return expected.every(name=>actual.some(x=>samePerson(name,x)));
}
function findTableTennisMatch(snapshot,leg,{referenceTime,eventRow}={}){
  const anchor=eventRow?.commenceTime||referenceTime||null;
  const candidates=[];
  for(const match of Object.values(snapshot?.matches||{})){
    const player=(match?.players||[]).find(p=>samePerson(p?.name,leg?.player));
    if(!player)continue;
    const distance=anchor?dateDistance(match?.startTime,anchor):0;
    if(anchor&&distance>MAX_DISTANCE_MS)continue;
    if(eventRow&&!matchMatchesEvent(match,eventRow))continue;
    candidates.push({match,player,distance});
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  if(!candidates.length)return null;
  if(eventRow)return candidates[0];
  // Without sportsbook opponent identity, refuse to choose among multiple nearby matches.
  const nearby=candidates.filter(c=>!anchor||c.distance<=UNANCHORED_WINDOW_MS);
  if(nearby.length!==1)return null;
  return nearby[0];
}
function matchup(match){return (match?.players||[]).map(p=>p?.name).filter(Boolean).join(' vs ');}
function fields(match){
  return {
    gameId:String(match?.id||''),
    eventId:String(match?.eventId||''),
    matchup:matchup(match),
    startTimeUTC:match?.startTime||null,
    gameState:match?.final?'post':match?.state||null,
    period:match?.currentGameNumber??null,
    score:match?.overallScore||null
  };
}
function unresolved(leg,reason,extra={}){
  return {...leg,...extra,status:'UNRESOLVED',resolutionReason:reason,displayMarket:displayMarket(leg),current:null,target:targetForLeg(leg),probability:null,probabilityPct:null,probabilityMethod:null,marketOptions:[]};
}
function gradeTableTennisMatch(leg,found){
  if(!found)return null;
  const {match,player}=found;
  const extra=fields(match);
  if(match?.state==='pre'&&!match?.final)return null;
  if(match?.final&&match?.voidLike)return unresolved(leg,'table-tennis-final-void-like',extra);
  if(!match?.final){
    return {...leg,...extra,status:'LIVE',resolutionReason:null,displayMarket:displayMarket(leg),current:null,target:targetForLeg(leg),probability:null,probabilityPct:null,probabilityMethod:null,marketOptions:[]};
  }
  const winners=(match?.players||[]).filter(p=>p?.winner===true);
  if(winners.length!==1||typeof player?.winner!=='boolean')return unresolved(leg,'table-tennis-winner-not-available',extra);
  const current=player.winner?1:0;
  const wantsNo=String(leg?.side||'yes').toLowerCase()==='no';
  const status=current?(wantsNo?'MISS':'HIT'):(wantsNo?'HIT':'MISS');
  return {...leg,...extra,status,resolutionReason:null,displayMarket:displayMarket(leg),current,target:targetForLeg(leg),probability:null,probabilityPct:null,probabilityMethod:null,marketOptions:[]};
}
function latestTime(...values){
  const ts=values.map(v=>Date.parse(v||'')).filter(Number.isFinite);
  return ts.length?new Date(Math.max(...ts)).toISOString():null;
}

async function analyzeTableTennisSlip(rawLegs,options={}){
  const legs=(Array.isArray(rawLegs)?rawLegs:[]).filter(l=>String(l?.sport||'').toUpperCase()==='TABLE_TENNIS').slice(0,20);
  if(!legs.length)throw new Error('No TABLE_TENNIS legs were provided.');
  const [odds,live]=await Promise.all([fetchJson(ODDS_FILE).catch(()=>null),fetchJson(LIVE_FILE).catch(()=>null)]);
  const snapshot=odds||{meta:{sport:'TABLE_TENNIS'},rows:[]};
  const referenceTime=options.referenceTime||new Date().toISOString();
  const now=Number.isFinite(Number(options.now))?Number(options.now):Date.now();
  const results=[];
  for(const leg of legs){
    if(leg.market!=='matchWinner'){
      results.push(unresolved(leg,'table-tennis-market-not-live-gradeable'));
      continue;
    }
    const eventRow=closestOddsRow(snapshot,leg,referenceTime);
    if(live){
      const found=findTableTennisMatch(live,leg,{referenceTime,eventRow});
      const graded=gradeTableTennisMatch(leg,found);
      if(graded){results.push(graded);continue;}
    }
    if(!eventRow){
      const reason=live?'table-tennis-player-market-not-found-and-no-unambiguous-official-match':'table-tennis-live-feed-unavailable';
      results.push(unresolved(leg,reason));
      continue;
    }
    const start=Date.parse(eventRow.commenceTime||'');
    if(!Number.isFinite(start)){
      results.push(unresolved(leg,'table-tennis-event-time-unavailable'));
      continue;
    }
    if(now>=start){
      results.push({...unresolved(leg,live?'table-tennis-live-match-not-found':'table-tennis-live-feed-unavailable'),gameId:String(eventRow.eventId||''),matchup:`${eventRow.awayTeam||''} @ ${eventRow.homeTeam||''}`.trim(),startTimeUTC:eventRow.commenceTime||null,gameState:'in-or-post'});
      continue;
    }
    const quote=quoteProbability(snapshot,leg,eventRow);
    if(!Number.isFinite(quote.probability)){
      results.push({...unresolved(leg,'table-tennis-requested-line-not-currently-priced'),gameId:String(eventRow.eventId||''),matchup:`${eventRow.awayTeam||''} @ ${eventRow.homeTeam||''}`.trim(),startTimeUTC:eventRow.commenceTime||null,gameState:'pre'});
      continue;
    }
    results.push({...leg,gameId:String(eventRow.eventId||''),matchup:`${eventRow.awayTeam||''} @ ${eventRow.homeTeam||''}`.trim(),startTimeUTC:eventRow.commenceTime||null,gameState:'pre',status:'PENDING',resolutionReason:null,displayMarket:displayMarket(leg),current:null,target:targetForLeg(leg),probability:quote.probability,probabilityPct:Math.round(quote.probability*1000)/10,probabilityMethod:quote.method,marketOptions:[]});
  }
  return {ok:true,generatedAt:new Date().toISOString(),dataGeneratedAt:latestTime(snapshot?.meta?.fetchedAt,live?.generatedAt),source:'The Sports Outpost TABLE_TENNIS ParlayAPI sportsbook snapshot + official World Table Tennis live/final grading',results};
}

module.exports={analyzeTableTennisSlip,findTableTennisMatch,gradeTableTennisMatch,closestOddsRow};
