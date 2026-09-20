const { analyzeSlip: analyzeNflSlip, normalizeLeg, encodeSlip } = require('./parlay-engine');
const { analyzeNcaafSlip } = require('./ncaaf-engine');
const { analyzeMlbSlip } = require('./mlb-engine');
const { analyzeNhlSlip } = require('./nhl-engine');
const { analyzeBasketballSlip } = require('./basketball-engine');

const SUPPORTED_ANALYSIS = new Set(['NFL','NCAAF','MLB','NHL','NBA','NCAAB','WNBA']);

function pct(v){ return Number.isFinite(v) ? Math.round(v*1000)/10 : null; }
function normalizeSport(value){
  const raw=String(value||'NFL').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const aliases={CFB:'NCAAF',COLLEGEFOOTBALL:'NCAAF',NCAAFOOTBALL:'NCAAF',PROFOOTBALL:'NFL',BASEBALL:'MLB',PROBASEBALL:'MLB',MAJORLEAGUEBASEBALL:'MLB',HOCKEY:'NHL',PROHOCKEY:'NHL',NATIONALHOCKEYLEAGUE:'NHL',BASKETBALL:'NBA',PROBASKETBALL:'NBA',COLLEGEBASKETBALL:'NCAAB',NCAAM:'NCAAB',NCAAMBB:'NCAAB',WOMENSNBA:'WNBA'};
  return aliases[raw]||raw||'NFL';
}
function normalizeUniversalLeg(input,index){
  const sport=normalizeSport(input?.sport);
  if(sport==='NFL') return normalizeLeg({...input,sport:'NFL'},index);
  return {
    id:input?.id||`${sport.toLowerCase()}-${index+1}`,
    sport,
    player:String(input?.player||'').trim(),
    team:input?.team?String(input.team).toUpperCase():null,
    gameId:input?.gameId?String(input.gameId):null,
    market:String(input?.market||'').trim(),
    side:String(input?.side||'over').toLowerCase(),
    line:input?.line==null?null:Number(input.line),
    inclusive:Boolean(input?.inclusive),
    originalText:input?.originalText||null
  };
}
function unsupportedResult(leg){
  return {
    ...leg,
    status:'UNRESOLVED',
    resolutionReason:`${leg.sport.toLowerCase()}-analysis-data-source-not-yet-connected`,
    displayMarket:leg.market||'PROP',
    probability:null,
    current:null,
    target:leg.line,
    marketOptions:[]
  };
}

async function analyzeMultiSport(rawLegs,options={}){
  const legs=(Array.isArray(rawLegs)?rawLegs:[]).slice(0,20).map(normalizeUniversalLeg).filter(l=>l.player&&l.market);
  if(!legs.length) throw new Error('No supported player-prop legs were provided.');
  const grouped=new Map();
  for(const leg of legs){ if(!grouped.has(leg.sport))grouped.set(leg.sport,[]); grouped.get(leg.sport).push(leg); }

  const analyses=[];
  for(const [sport,sportLegs] of grouped){
    if(sport==='NFL') analyses.push(await analyzeNflSlip(sportLegs,{baseUrl:options.baseUrl}));
    else if(sport==='NCAAF') analyses.push(await analyzeNcaafSlip(sportLegs));
    else if(sport==='MLB') analyses.push(await analyzeMlbSlip(sportLegs,{referenceTime:options.referenceTime}));
    else if(sport==='NHL') analyses.push(await analyzeNhlSlip(sportLegs,{referenceTime:options.referenceTime}));
    else if(['NBA','NCAAB','WNBA'].includes(sport)) analyses.push(await analyzeBasketballSlip(sport,sportLegs,{referenceTime:options.referenceTime}));
    else analyses.push({ok:true,generatedAt:new Date().toISOString(),source:`${sport} adapter pending`,results:sportLegs.map(unsupportedResult)});
  }

  const results=analyses.flatMap(a=>a.results||[]);
  const pending=results.filter(r=>r.status==='PENDING');
  const combinedTailProbability=pending.length&&pending.every(r=>Number.isFinite(r.probability))
    ? pending.reduce((p,r)=>p*r.probability,1)
    : null;
  const baseUrl=String(options.baseUrl||'https://parlayping.net').replace(/\/$/,'');
  const token=encodeSlip(legs);
  const tailUrl=pending.length?`${baseUrl}/tail?slip=${encodeURIComponent(token)}`:null;
  const dataTimes=analyses.map(a=>Date.parse(a.dataGeneratedAt||'')).filter(Number.isFinite);

  return {
    ok:true,
    generatedAt:new Date().toISOString(),
    dataGeneratedAt:dataTimes.length?new Date(Math.max(...dataTimes)).toISOString():null,
    source:[...new Set(analyses.map(a=>a.source).filter(Boolean))].join(' + '),
    sports:[...grouped.keys()],
    supportedSports:[...grouped.keys()].filter(s=>SUPPORTED_ANALYSIS.has(s)),
    unsupportedSports:[...grouped.keys()].filter(s=>!SUPPORTED_ANALYSIS.has(s)),
    results,
    counts:{
      hit:results.filter(r=>r.status==='HIT').length,
      miss:results.filter(r=>r.status==='MISS').length,
      live:results.filter(r=>r.status==='LIVE').length,
      pending:pending.length,
      unresolved:results.filter(r=>r.status==='UNRESOLVED').length
    },
    combinedTailProbability,
    combinedTailProbabilityPct:pct(combinedTailProbability),
    tailUrl
  };
}

module.exports={ analyzeMultiSport, normalizeSport, normalizeUniversalLeg, SUPPORTED_ANALYSIS };
