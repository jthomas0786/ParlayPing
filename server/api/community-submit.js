const {parseSlip}=require('../../lib/slip-parser-wrapper');
const {analyzeMultiSport}=require('./lib/sport-router-live');
const {encodeShareSlip,mergeAnalysisIntoSlip,buildShareUrl,buildCardUrl}=require('./lib/share-slip');
const {builderUrl}=require('./builder-page');
const {requireUser}=require('./lib/supabase-account');

const START_BUFFER_MS=60_000;
const MAX_IMAGE_CHARS=3_300_000;
const SUPPORTED=new Set(['NFL','NCAAF','NBA','WNBA','NCAAB','MLB','NHL','SOCCER','TENNIS','MMA','ESPORTS','TABLE_TENNIS','VOLLEYBALL','CRICKET','RUGBY_LEAGUE','AFL','BOXING','GOLF']);

function clean(value,max=240){return String(value??'').replace(/\s+/g,' ').trim().slice(0,max);}
function validImageDataUrl(value){
  const text=String(value||'');
  if(!/^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/=\r\n]+$/i.test(text))return false;
  return text.length<=MAX_IMAGE_CHARS;
}
function cleanSourceUrl(value){
  const text=clean(value,1200);if(!text)return null;
  try{const url=new URL(text);if(url.protocol!=='https:')return null;const host=url.hostname.toLowerCase().replace(/^www\./,'');if(!['x.com','twitter.com'].includes(host))return null;url.hash='';return url.toString();}catch{return null;}
}
function futurePending(analysis,expectedLegs,now=Date.now()){
  const results=Array.isArray(analysis?.results)?analysis.results:[];
  if(!results.length||results.length!==expectedLegs)return{ok:false,reason:'Not every leg could be matched to an upcoming event.'};
  for(const result of results){
    const status=String(result?.status||'').toUpperCase();
    if(status!=='PENDING')return{ok:false,reason:'At least one leg is already live, settled, or unresolved.'};
    const start=Date.parse(result?.startTimeUTC||'');
    if(!Number.isFinite(start))return{ok:false,reason:'At least one leg is missing a confirmed event start time.'};
    if(start<=now+START_BUFFER_MS)return{ok:false,reason:'At least one leg has already started or is starting now.'};
  }
  return{ok:true,results};
}
function combinedPct(analysis){
  const raw=analysis?.combinedTailProbability;
  if(raw===null||raw===undefined||raw==='')return null;
  const n=Number(raw);if(!Number.isFinite(n)||n<0)return null;
  const pct=n<=1?n*100:n;
  return Math.round(Math.min(100,pct)*1000)/1000;
}
function sportLabel(legs){const sports=[...new Set(legs.map(l=>String(l?.sport||'').toUpperCase()).filter(Boolean))];return sports.length===1?sports[0]:'MULTI';}
function publicLeg(leg){return {id:leg?.id||null,sport:leg?.sport||null,player:leg?.player||null,team:leg?.team||null,market:leg?.market||null,displayMarket:leg?.displayMarket||null,side:leg?.side||null,line:leg?.line??null,inclusive:Boolean(leg?.inclusive),originalText:leg?.originalText||null,oddsAmerican:leg?.oddsAmerican??null,sportsbook:leg?.sportsbook||null,matchup:leg?.matchup||null,startTimeUTC:leg?.startTimeUTC||null,status:leg?.status||'PENDING',pregameProbability:leg?.pregameProbability??null,probabilitySource:leg?.probabilitySource||null};}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Use POST.'});
  try{
    await requireUser(req);
    const imageDataUrl=String(req.body?.imageDataUrl||'');
    if(!validImageDataUrl(imageDataUrl))return res.status(400).json({ok:false,error:'Upload a JPG, PNG, or WebP screenshot under the size limit.'});
    const suppliedSource=clean(req.body?.sourceUrl,1200),sourceUrl=cleanSourceUrl(suppliedSource);
    if(suppliedSource&&!sourceUrl)return res.status(400).json({ok:false,error:'The optional source link must be an https://x.com or https://twitter.com post.'});

    const parsed=await parseSlip({text:'',mediaUrls:[imageDataUrl]});
    const legs=(parsed?.legs||[]).filter(leg=>SUPPORTED.has(String(leg?.sport||'').toUpperCase()));
    if(!legs.length)return res.status(422).json({ok:false,error:'ParlayPing could not confidently read supported bet legs from this screenshot. Try a tighter, clearer crop.'});

    let analysis;
    try{analysis=await analyzeMultiSport(legs,{baseUrl:process.env.PUBLIC_BASE_URL||'https://parlayping.net'});}catch(error){return res.status(422).json({ok:false,error:clean(error?.message||'Could not verify these legs against upcoming events.',300)});}
    const future=futurePending(analysis,legs.length);
    if(!future.ok)return res.status(422).json({ok:false,error:future.reason});

    const source=sourceUrl?'Community submission · X source':'Community submission';
    const merged=mergeAnalysisIntoSlip({source,sourceReference:sourceUrl||null,legs},analysis);
    const token=encodeShareSlip(merged),probability=combinedPct(analysis),sport=sportLabel(merged.legs);
    const title=`${merged.legs.length}-Leg ${sport==='MULTI'?'Sports':sport} Parlay`;
    const summary=`${merged.legs.length} leg${merged.legs.length===1?'':'s'} verified pregame${probability!=null?` · ${probability<0.1?'<0.1':probability.toFixed(probability%1?1:0)}% modeled probability`:''}.`;
    return res.status(200).json({ok:true,verified:true,shareToken:token,builderUrl:builderUrl(token),shareUrl:buildShareUrl(token),cardUrl:buildCardUrl(token),title,sport,legCount:merged.legs.length,legs:merged.legs.map(publicLeg),betProbabilityPct:probability,analysisSummary:summary,sourceUrl,rawScreenshotStored:false});
  }catch(error){
    const status=Number(error?.status)||500;
    console.error('Community betslip submission',{status,message:error?.message});
    return res.status(status).json({ok:false,error:status===401?'Sign in to submit a betslip.':clean(error?.message||'Could not verify this betslip.',300)});
  }
};

module.exports.validImageDataUrl=validImageDataUrl;
module.exports.cleanSourceUrl=cleanSourceUrl;
module.exports.futurePending=futurePending;
