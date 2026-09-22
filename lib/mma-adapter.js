const {samePerson}=require('./extended-live-grading');
const {quoteProbability,displayMarket,targetForLeg}=require('./extended-market-engine');

const OUTPOST_BASE='https://raw.githubusercontent.com/jthomas0786/The-Sports-Outpost/main/slates';
const ODDS_FILE='mma-odds.json';
const LIVE_FILE='mma-live.json';
const MAX_DISTANCE_MS=48*60*60*1000;

const finite=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
function dateDistance(a,b){const x=Date.parse(a||''),y=Date.parse(b||'');return Number.isFinite(x)&&Number.isFinite(y)?Math.abs(x-y):Infinity;}
async function fetchJson(file){
  const r=await fetch(`${OUTPOST_BASE}/${file}`,{headers:{accept:'application/json','user-agent':'ParlayPing/0.9'},cache:'no-store'});
  if(r.status===404)return null;
  if(!r.ok)throw new Error(`MMA ${file} request failed (${r.status})`);
  return r.json();
}
function oddsRows(snapshot,leg){return (snapshot?.rows||[]).filter(r=>r?.market==='fightWinner'&&samePerson(r?.player,leg?.player));}
function closestOddsRow(snapshot,leg,referenceTime){
  const ref=Date.parse(referenceTime||'');
  const rows=oddsRows(snapshot,leg).filter(r=>Number.isFinite(Date.parse(r?.commenceTime||'')));
  rows.sort((a,b)=>{
    const at=Date.parse(a.commenceTime),bt=Date.parse(b.commenceTime);
    const da=Number.isFinite(ref)?Math.abs(at-ref):at,db=Number.isFinite(ref)?Math.abs(bt-ref):bt;
    return da-db;
  });
  return rows[0]||null;
}
function eventOpponents(row){return [row?.homeTeam,row?.awayTeam].filter(Boolean);}
function fightMatchesEvent(fight,row){
  const expected=eventOpponents(row);if(!expected.length)return true;
  const actual=(fight?.fighters||[]).map(f=>f?.name).filter(Boolean);
  return expected.every(name=>actual.some(x=>samePerson(name,x)));
}
function findFight(snapshot,leg,{referenceTime,eventRow}={}){
  const anchor=eventRow?.commenceTime||referenceTime||null;const candidates=[];
  for(const fight of Object.values(snapshot?.fights||{})){
    const fighter=(fight?.fighters||[]).find(f=>samePerson(f?.name,leg?.player));if(!fighter)continue;
    if(anchor&&dateDistance(fight?.startTime,anchor)>MAX_DISTANCE_MS)continue;
    if(eventRow&&!fightMatchesEvent(fight,eventRow))continue;
    candidates.push({fight,fighter,distance:anchor?dateDistance(fight?.startTime,anchor):0});
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  return candidates[0]||null;
}
function matchup(fight){return (fight?.fighters||[]).map(f=>f?.name).filter(Boolean).join(' vs ');}
function fields(fight){return {gameId:String(fight?.id||''),eventId:String(fight?.eventId||''),matchup:matchup(fight),event:fight?.event||null,startTimeUTC:fight?.startTime||null,gameState:fight?.final?'post':fight?.state||null,period:fight?.round??null,clock:fight?.clock||null};}
function unresolved(leg,reason,extra={}){return {...leg,...extra,status:'UNRESOLVED',resolutionReason:reason,displayMarket:displayMarket(leg),current:null,target:targetForLeg(leg),probability:null,probabilityPct:null,probabilityMethod:null,marketOptions:[]};}
function gradeFight(leg,found){
  if(!found)return null;const {fight,fighter}=found;const extra=fields(fight);
  if(fight?.state==='pre'&&!fight?.final)return null;
  if(!fight?.final)return {...leg,...extra,status:'LIVE',resolutionReason:null,displayMarket:displayMarket(leg),current:null,target:targetForLeg(leg),probability:null,probabilityPct:null,probabilityMethod:null,marketOptions:[]};
  const winners=(fight?.fighters||[]).filter(f=>f?.winner===true);
  if(winners.length!==1||typeof fighter?.winner!=='boolean')return unresolved(leg,'mma-final-result-has-no-single-winner',extra);
  const current=fighter.winner?1:0;const wantsNo=String(leg?.side||'yes').toLowerCase()==='no';
  const status=current?(wantsNo?'MISS':'HIT'):(wantsNo?'HIT':'MISS');
  return {...leg,...extra,status,resolutionReason:null,displayMarket:displayMarket(leg),current,target:targetForLeg(leg),probability:null,probabilityPct:null,probabilityMethod:null,marketOptions:[]};
}
function latestTime(...values){const ts=values.map(v=>Date.parse(v||'')).filter(Number.isFinite);return ts.length?new Date(Math.max(...ts)).toISOString():null;}

async function analyzeMmaSlip(rawLegs,options={}){
  const legs=(Array.isArray(rawLegs)?rawLegs:[]).filter(l=>String(l?.sport||'').toUpperCase()==='MMA').slice(0,20);
  if(!legs.length)throw new Error('No MMA legs were provided.');
  const [odds,live]=await Promise.all([fetchJson(ODDS_FILE).catch(()=>null),fetchJson(LIVE_FILE).catch(()=>null)]);
  const snapshot=odds||{meta:{sport:'MMA'},rows:[]};const referenceTime=options.referenceTime||new Date().toISOString();const now=Number.isFinite(Number(options.now))?Number(options.now):Date.now();const results=[];
  for(const leg of legs){
    if(leg.market!=='fightWinner'){results.push(unresolved(leg,'mma-market-not-live-gradeable'));continue;}
    const eventRow=closestOddsRow(snapshot,leg,referenceTime);
    if(live){const graded=gradeFight(leg,findFight(live,leg,{referenceTime,eventRow}));if(graded){results.push(graded);continue;}}
    if(!eventRow){results.push(unresolved(leg,'mma-fighter-market-not-found-in-current-snapshot'));continue;}
    const start=Date.parse(eventRow.commenceTime||'');
    if(!Number.isFinite(start)){results.push(unresolved(leg,'mma-event-time-unavailable'));continue;}
    if(now>=start){results.push({...unresolved(leg,live?'mma-live-fight-not-found':'mma-live-feed-unavailable'),gameId:String(eventRow.eventId||''),matchup:`${eventRow.awayTeam||''} @ ${eventRow.homeTeam||''}`.trim(),startTimeUTC:eventRow.commenceTime||null,gameState:'in-or-post'});continue;}
    const quote=quoteProbability(snapshot,leg,eventRow);
    if(!Number.isFinite(quote.probability)){results.push({...unresolved(leg,'mma-requested-line-not-currently-priced'),gameId:String(eventRow.eventId||''),matchup:`${eventRow.awayTeam||''} @ ${eventRow.homeTeam||''}`.trim(),startTimeUTC:eventRow.commenceTime||null,gameState:'pre'});continue;}
    results.push({...leg,gameId:String(eventRow.eventId||''),matchup:`${eventRow.awayTeam||''} @ ${eventRow.homeTeam||''}`.trim(),startTimeUTC:eventRow.commenceTime||null,gameState:'pre',status:'PENDING',resolutionReason:null,displayMarket:displayMarket(leg),current:null,target:targetForLeg(leg),probability:quote.probability,probabilityPct:Math.round(quote.probability*1000)/10,probabilityMethod:quote.method,marketOptions:[]});
  }
  return {ok:true,generatedAt:new Date().toISOString(),dataGeneratedAt:latestTime(snapshot?.meta?.fetchedAt,live?.generatedAt),source:'The Sports Outpost MMA ParlayAPI sportsbook snapshot + ESPN UFC live/final grading',results};
}

module.exports={analyzeMmaSlip,findFight,gradeFight,closestOddsRow};
