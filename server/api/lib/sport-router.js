const { analyzeSlip: analyzeNflSlip, normalizeLeg, encodeSlip } = require('./parlay-engine');
const { analyzeNcaafSlip } = require('./ncaaf-engine');
const { analyzeMlbSlip } = require('./mlb-engine-v2');
const { analyzeNhlSlip } = require('./nhl-engine');
const { applyCorrelationSafety } = require('./analysis-safety');
const { analyzeBasketballSlip } = require('../../lib/basketball-adapter');
const { analyzeMmaSlip } = require('../../lib/mma-adapter');
const { analyzeTableTennisSlip } = require('../../lib/table-tennis-adapter');
const { analyzeEsportsSlip } = require('../../lib/esports-adapter');
const { analyzeGolfSlip } = require('../../lib/golf-adapter');
const { analyzeGenericMatchSlip, GENERIC_SPORTS } = require('../../lib/generic-match-adapter');
const { analyzeExtendedSlip } = require('../../lib/extended-market-engine');

const EXTENDED_SPORTS=new Set(['SOCCER','TENNIS','MMA','ESPORTS','TABLE_TENNIS','GOLF',...GENERIC_SPORTS]);
const SUPPORTED_ANALYSIS = new Set(['NFL','NCAAF','MLB','NHL','NBA','NCAAB','WNBA',...EXTENDED_SPORTS]);
const MAX_ANALYSIS_LEGS=25;
const ADAPTER_BATCH_SIZE=20;
const MLB_FIRST_NAME_GROUPS=[
  ['leonardo','leo'],['michael','mike'],['matthew','matt'],['nicholas','nick'],['christopher','chris'],['jonathan','jon'],
  ['alexander','alex'],['joseph','joe'],['william','will','bill'],['robert','rob','bob'],['benjamin','ben'],['joshua','josh'],
  ['jacob','jake'],['nathaniel','nate'],['zachary','zach'],['timothy','tim'],['daniel','dan'],['samuel','sam'],['theodore','theo'],
  ['gregory','greg'],['stephen','steven','steve'],['ronald','ron'],['anthony','tony'],['edward','ed','eddie'],['andrew','andy'],
  ['thomas','tom','tommy'],['james','jim','jimmy'],['richard','rick','ricky'],['charles','charlie'],['patrick','pat'],['kenneth','ken','kenny']
];
const MLB_FIRST_ALIAS_MAP=new Map();
for(const group of MLB_FIRST_NAME_GROUPS)for(const name of group)MLB_FIRST_ALIAS_MAP.set(name,group);

function pct(v){ return Number.isFinite(v) ? Math.round(v*1000)/10 : null; }
function normalizeSport(value){
  const raw=String(value||'NFL').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const aliases={CFB:'NCAAF',COLLEGEFOOTBALL:'NCAAF',NCAAFOOTBALL:'NCAAF',PROFOOTBALL:'NFL',BASEBALL:'MLB',PROBASEBALL:'MLB',MAJORLEAGUEBASEBALL:'MLB',HOCKEY:'NHL',PROHOCKEY:'NHL',NATIONALHOCKEYLEAGUE:'NHL',BASKETBALL:'NBA',PROBASKBALL:'NBA',PROBASKETBALL:'NBA',COLLEGEBASKETBALL:'NCAAB',NCAAM:'NCAAB',NCAAMBB:'NCAAB',WOMENSNBA:'WNBA',UFC:'MMA',MIXEDMARTIALARTS:'MMA',TABLETENNIS:'TABLE_TENNIS',PINGPONG:'TABLE_TENNIS',EPL:'SOCCER',PREMIERLEAGUE:'SOCCER',MLS:'SOCCER',CS2:'ESPORTS',COUNTERSTRIKE:'ESPORTS',COUNTERSTRIKE2:'ESPORTS',VALORANT:'ESPORTS',LEAGUEOFLEGENDS:'ESPORTS',LOL:'ESPORTS',DOTA:'ESPORTS',DOTA2:'ESPORTS',VOLLEYBALL:'VOLLEYBALL',CRICKET:'CRICKET',NRL:'RUGBY_LEAGUE',RUGBYLEAGUE:'RUGBY_LEAGUE',AFL:'AFL',AUSSIERULES:'AFL',AUSTRALIANRULES:'AFL',BOXING:'BOXING',GOLF:'GOLF',PGA:'GOLF',DPWORLD:'GOLF',LIVGOLF:'GOLF'};
  return aliases[raw]||raw||'NFL';
}
function explicitQuoteFields(input){
  const rawOdds=input?.oddsAmerican==null?null:Number(input.oddsAmerican);
  return {
    oddsAmerican:Number.isFinite(rawOdds)&&rawOdds!==0&&Math.abs(rawOdds)>=100&&Math.abs(rawOdds)<=100000?Math.round(rawOdds):null,
    sportsbook:input?.sportsbook?String(input.sportsbook).trim().slice(0,80):null
  };
}
function normalizeUniversalLeg(input,index){
  const sport=normalizeSport(input?.sport);
  const quote=explicitQuoteFields(input);
  if(sport==='NFL') return {...normalizeLeg({...input,sport:'NFL'},index),...quote};
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
    originalText:input?.originalText||null,
    ...quote
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
function chunks(rows,size=ADAPTER_BATCH_SIZE){
  const out=[];
  for(let i=0;i<rows.length;i+=size)out.push(rows.slice(i,i+size));
  return out;
}
function mlbIdentityCandidates(player){
  const raw=String(player||'').trim();if(!raw)return [];
  const parts=raw.split(/\s+/);if(parts.length<2)return [raw];
  const first=parts[0].toLowerCase().replace(/[^a-z]/g,'');const group=MLB_FIRST_ALIAS_MAP.get(first);if(!group)return [raw];
  const rest=parts.slice(1).join(' '),seen=new Set(),out=[];
  for(const candidateFirst of [parts[0],...group]){
    const candidate=`${candidateFirst} ${rest}`.trim();const key=candidate.toLowerCase();if(seen.has(key))continue;seen.add(key);out.push(candidate);
  }
  return out;
}
function retryableMlbIdentityMiss(result){return String(result?.status||'').toUpperCase()==='UNRESOLVED'&&String(result?.resolutionReason||'')==='mlb-player-not-found-in-model-or-official-sources';}
async function analyzeMlbWithAliases(sportLegs,options={}){
  const analyzerOptions={referenceTime:options.referenceTime,now:options.now};
  const analysis=await analyzeMlbSlip(sportLegs,analyzerOptions);
  const results=[...(analysis?.results||[])];
  for(let i=0;i<results.length;i++){
    const result=results[i],leg=sportLegs.find(row=>String(row?.id||'')===String(result?.id||''))||sportLegs[i];
    if(!leg||!retryableMlbIdentityMiss(result))continue;
    const candidates=mlbIdentityCandidates(leg.player).slice(1);
    for(const alias of candidates){
      const retry=await analyzeMlbSlip([{...leg,player:alias}],analyzerOptions);
      const matched=retry?.results?.[0];
      if(!matched||String(matched.status||'').toUpperCase()==='UNRESOLVED')continue;
      results[i]={...matched,id:leg.id,player:leg.player,originalText:leg.originalText,matchedPlayerName:matched.player||alias,identityAlias:alias};
      break;
    }
  }
  return {...analysis,results};
}
async function analyzeSportBatch(sport,sportLegs,options){
  if(sport==='NFL') return analyzeNflSlip(sportLegs,{baseUrl:options.baseUrl});
  if(sport==='NCAAF') return analyzeNcaafSlip(sportLegs);
  if(sport==='MLB') return analyzeMlbWithAliases(sportLegs,options);
  if(sport==='NHL') return analyzeNhlSlip(sportLegs,{referenceTime:options.referenceTime});
  if(['NBA','NCAAB','WNBA'].includes(sport)) return analyzeBasketballSlip(sport,sportLegs,{referenceTime:options.referenceTime});
  if(sport==='MMA') return analyzeMmaSlip(sportLegs,{referenceTime:options.referenceTime,now:options.now});
  if(sport==='TABLE_TENNIS') return analyzeTableTennisSlip(sportLegs,{referenceTime:options.referenceTime,now:options.now});
  if(sport==='ESPORTS') return analyzeEsportsSlip(sportLegs,{referenceTime:options.referenceTime,now:options.now});
  if(sport==='GOLF') return analyzeGolfSlip(sportLegs,{referenceTime:options.referenceTime,now:options.now,snapshot:options.golfSnapshot});
  if(GENERIC_SPORTS.has(sport)) return analyzeGenericMatchSlip(sport,sportLegs,{referenceTime:options.referenceTime,now:options.now});
  if(EXTENDED_SPORTS.has(sport)) return analyzeExtendedSlip(sport,sportLegs,{referenceTime:options.referenceTime,now:options.now});
  return {ok:true,generatedAt:new Date().toISOString(),source:`${sport} adapter pending`,results:sportLegs.map(unsupportedResult)};
}

async function analyzeMultiSport(rawLegs,options={}){
  const legs=(Array.isArray(rawLegs)?rawLegs:[]).slice(0,MAX_ANALYSIS_LEGS).map(normalizeUniversalLeg).filter(l=>l.player&&l.market);
  if(!legs.length) throw new Error('No supported player-prop legs were provided.');
  const grouped=new Map();
  for(const leg of legs){ if(!grouped.has(leg.sport))grouped.set(leg.sport,[]); grouped.get(leg.sport).push(leg); }

  const analyses=[];
  for(const [sport,sportLegs] of grouped){
    for(const batch of chunks(sportLegs)) analyses.push(await analyzeSportBatch(sport,batch,options));
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

  return applyCorrelationSafety({
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
      void:results.filter(r=>r.status==='VOID').length,
      unresolved:results.filter(r=>r.status==='UNRESOLVED').length
    },
    combinedTailProbability,
    combinedTailProbabilityPct:pct(combinedTailProbability),
    tailUrl
  });
}

module.exports={ analyzeMultiSport, analyzeMlbWithAliases, mlbIdentityCandidates, normalizeSport, normalizeUniversalLeg, SUPPORTED_ANALYSIS, EXTENDED_SPORTS, MAX_ANALYSIS_LEGS, ADAPTER_BATCH_SIZE, chunks };
