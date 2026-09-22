function clampInt(value,min,max,fallback){
  const n=Number(value);
  if(!Number.isFinite(n))return fallback;
  return Math.max(min,Math.min(max,Math.trunc(n)));
}

function normalizeGameId(row){
  const value=row?.gameId??row?.event_id??row?.eventId??row?.game_pk??row?.gamePk??row?.game??null;
  return value==null||String(value).trim()===''?null:String(value).trim();
}

function normalizeBuildCandidate(input,index=0){
  const row=input&&typeof input==='object'?input:{};
  return {
    ...row,
    id:row.id||`candidate-${index+1}`,
    sport:String(row.sport||'NFL').toUpperCase(),
    player:String(row.player||row.player_name||'').trim(),
    market:String(row.market||row.prop_key||'').trim(),
    side:String(row.side||'over').toLowerCase(),
    line:row.line==null?null:Number(row.line),
    gameId:normalizeGameId(row),
  };
}

function probabilityPct(value){return Number.isFinite(value)?Math.round(value*1000)/10:null;}

function buildFromAnalysis(analysis,options={}){
  const desiredLegs=clampInt(options.desiredLegs,1,25,Math.min(4,(analysis?.results||[]).length||1));
  const allowSameGame=options.allowSameGame===true;
  const minProbabilityRaw=Number(options.minProbability);
  const minProbability=Number.isFinite(minProbabilityRaw)?Math.max(0,Math.min(.999,minProbabilityRaw)):0;
  const sports=new Set((Array.isArray(options.sports)?options.sports:[]).map(v=>String(v||'').toUpperCase()).filter(Boolean));

  const all=(Array.isArray(analysis?.results)?analysis.results:[]).map((row,index)=>({...row,__index:index}));
  const eligible=all.filter(row=>{
    if(row?.status!=='PENDING'||!Number.isFinite(row?.probability))return false;
    if(row.probability<minProbability)return false;
    if(sports.size&&!sports.has(String(row.sport||'').toUpperCase()))return false;
    return true;
  }).sort((a,b)=>b.probability-a.probability||a.__index-b.__index);

  const selected=[];
  const seenIds=new Set();
  const seenGames=new Set();
  for(const row of eligible){
    const id=String(row.id||'');
    if(id&&seenIds.has(id))continue;
    const gameId=normalizeGameId(row);
    if(!allowSameGame&&gameId&&seenGames.has(gameId))continue;
    selected.push(row);
    if(id)seenIds.add(id);
    if(gameId)seenGames.add(gameId);
    if(selected.length>=desiredLegs)break;
  }

  const publicRows=selected.map(({__index,...row})=>({...row,probabilityPct:probabilityPct(row.probability)}));
  const knownGameIds=publicRows.map(normalizeGameId).filter(Boolean);
  const correlationDetected=new Set(knownGameIds).size<knownGameIds.length;
  const independentCombined=publicRows.length&&publicRows.every(row=>Number.isFinite(row.probability))&&!correlationDetected
    ?publicRows.reduce((total,row)=>total*row.probability,1)
    :null;
  const buildable=publicRows.length===desiredLegs;
  const combined=buildable?independentCombined:null;

  return {
    buildable,
    reason:buildable?null:'not-enough-eligible-legs',
    strategy:allowSameGame?'highest-model-probability':'highest-model-probability-distinct-games',
    requestedLegs:desiredLegs,
    selectedLegs:publicRows,
    selectedCount:publicRows.length,
    eligibleCount:eligible.length,
    rejectedCount:Math.max(0,all.length-eligible.length),
    correlationDetected,
    combinedProbability:combined,
    combinedProbabilityPct:combined==null?null:probabilityPct(combined),
    note:!buildable
      ?'ParlayPing did not invent replacement legs. Add more supported pregame candidates or loosen the requested filters.'
      :correlationDetected
        ?'Same-game legs were allowed by the request. Combined probability is withheld because correlated legs are not multiplied as if independent.'
        :(allowSameGame?'Same-game legs were allowed by the request, but the selected build does not contain a repeated known game.':'Selected legs come from distinct games when game identity is available.'),
  };
}

module.exports={normalizeBuildCandidate,normalizeGameId,buildFromAnalysis,clampInt};
