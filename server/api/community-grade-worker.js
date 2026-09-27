const { schedulerAuthorized } = require('./lib/scheduler-auth');
const { canonicalSlip } = require('./lib/share-slip');
const { hydrateSharedSlip } = require('./lib/share-hydrate');

const SUPABASE_URL=process.env.SUPABASE_URL||'https://avwqjgiitxqphvmitolw.supabase.co';
const SUPABASE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_7mYXjjkRrQq3iRig7UYHNQ_b6EZZiJA';
const PUBLIC_BASE=String(process.env.PUBLIC_BASE_URL||'https://parlayping.net').replace(/\/$/,'');
const RPC_TIMEOUT_MS=9000;
const MAX_ROWS=8;
const EARLY_WINDOW_MS=20*60*1000;
const FINAL_STATUSES=new Set(['HIT','MISS','PUSH','VOID']);

function normalizeLegStatus(value){
  const status=String(value||'PENDING').toUpperCase();
  return ['PENDING','LIVE','HIT','MISS','PUSH','VOID','UNRESOLVED'].includes(status)?status:'PENDING';
}
function earliestStart(legs){
  const starts=(Array.isArray(legs)?legs:[]).map(leg=>Date.parse(leg?.startTimeUTC||'')).filter(Number.isFinite);
  return starts.length?Math.min(...starts):null;
}
function countsFor(legs){
  const counts={HIT:0,MISS:0,PUSH:0,VOID:0,LIVE:0,PENDING:0,UNRESOLVED:0};
  for(const leg of Array.isArray(legs)?legs:[])counts[normalizeLegStatus(leg?.status)]++;
  return counts;
}
function gradeStatus(legs){
  const rows=Array.isArray(legs)?legs:[];
  if(!rows.length)return{status:'UNRESOLVED',summary:'No graded legs are available yet.'};
  const statuses=rows.map(leg=>normalizeLegStatus(leg?.status)),counts=countsFor(rows),allFinal=statuses.every(status=>FINAL_STATUSES.has(status));
  let status;
  if(allFinal){
    if(counts.MISS>0)status='LOST';
    else if(counts.HIT>0)status='WON';
    else if(counts.VOID===rows.length)status='VOID';
    else status='PUSH';
  }else if(counts.LIVE>0)status='LIVE';
  else if(counts.UNRESOLVED>0)status='UNRESOLVED';
  else status='PENDING';
  const parts=[];
  if(counts.HIT)parts.push(`${counts.HIT}/${rows.length} hit`);
  if(counts.MISS)parts.push(`${counts.MISS} missed`);
  if(counts.LIVE)parts.push(`${counts.LIVE} live`);
  if(counts.PENDING)parts.push(`${counts.PENDING} pending`);
  if(counts.UNRESOLVED)parts.push(`${counts.UNRESOLVED} unresolved`);
  if(counts.PUSH)parts.push(`${counts.PUSH} push`);
  if(counts.VOID)parts.push(`${counts.VOID} void`);
  const summary=parts.length?parts.join(' · '):`${rows.length} legs graded`;
  return{status,summary};
}
function compactLeg(leg){
  return {
    id:leg?.id||null,sport:leg?.sport||null,player:leg?.player||null,team:leg?.team||null,
    market:leg?.market||null,displayMarket:leg?.displayMarket||null,side:leg?.side||null,line:leg?.line??null,
    inclusive:Boolean(leg?.inclusive),originalText:leg?.originalText||null,oddsAmerican:leg?.oddsAmerican??null,
    sportsbook:leg?.sportsbook||null,matchup:leg?.matchup||null,startTimeUTC:leg?.startTimeUTC||null,
    status:normalizeLegStatus(leg?.status),current:Number.isFinite(Number(leg?.current))?Number(leg.current):null,
    target:Number.isFinite(Number(leg?.target))?Number(leg.target):(Number.isFinite(Number(leg?.line))?Number(leg.line):null),
    progressText:leg?.progressText||null,pregameProbability:leg?.pregameProbability??null,
    liveProbability:leg?.liveProbability??null,probabilitySource:leg?.probabilitySource||null
  };
}
async function rpc(name,body){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{'content-type':'application/json',apikey:SUPABASE_KEY},body:JSON.stringify(body),signal:AbortSignal.timeout(RPC_TIMEOUT_MS)});
  const text=await response.text();let payload=null;try{payload=text?JSON.parse(text):null;}catch{payload={raw:text.slice(0,500)};}
  if(!response.ok)throw new Error(payload?.message||payload?.error||`${name} failed (${response.status})`);return payload;
}
async function gradeOne(row,now=Date.now()){
  const id=String(row?.id||'');const legs=Array.isArray(row?.legs)?row.legs:[];
  if(!id||!legs.length)return{id,result_status:'UNRESOLVED',result_summary:'No valid legs are available for grading.',legs};
  const start=earliestStart(legs);
  if(Number.isFinite(start)&&start>now+EARLY_WINDOW_MS){return{id,result_status:'PENDING',result_summary:'Verified pregame · waiting for the games to start.',legs:legs.map(compactLeg)};}
  try{
    const slip=canonicalSlip({source:'Community verified submission',createdAt:row?.created_at||new Date(now).toISOString(),legs});
    const hydrated=await hydrateSharedSlip(slip,{baseUrl:PUBLIC_BASE,referenceTime:row?.created_at||null,now:new Date(now).toISOString()});
    if(!hydrated.liveDataAvailable)return{id,result_status:'UNRESOLVED',result_summary:'Live grading data is temporarily unavailable · ParlayPing will retry.',legs:legs.map(compactLeg)};
    const nextLegs=(hydrated?.slip?.legs||legs).map(compactLeg),grade=gradeStatus(nextLegs);
    return{id,result_status:grade.status,result_summary:grade.summary,legs:nextLegs};
  }catch(error){
    return{id,result_status:'UNRESOLVED',result_summary:`Grading unavailable · ParlayPing will retry.`,legs:legs.map(compactLeg),error:String(error?.message||error).slice(0,180)};
  }
}
async function run(secret){
  const runAt=new Date().toISOString();
  const candidates=await rpc('parlayping_community_grade_candidates',{p_scheduler_secret:secret,p_limit:MAX_ROWS,p_run_at:runAt});
  const rows=Array.isArray(candidates)?candidates:[];
  const settled=await Promise.allSettled(rows.map(row=>gradeOne(row)));
  const grades=settled.map((result,index)=>result.status==='fulfilled'?result.value:{id:String(rows[index]?.id||''),result_status:'UNRESOLVED',result_summary:'Grading failed · ParlayPing will retry.',legs:rows[index]?.legs||[]});
  const applied=grades.length?await rpc('parlayping_apply_community_grades',{p_scheduler_secret:secret,p_rows:grades,p_run_at:new Date().toISOString()}):{ok:true,updated:0};
  const summary=grades.reduce((map,row)=>{const key=row.result_status||'UNRESOLVED';map[key]=(map[key]||0)+1;return map;},{});
  return{checked:rows.length,applied,summary};
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Use POST.'});
  if(!schedulerAuthorized(req))return res.status(401).json({ok:false,error:'Unauthorized scheduler request.'});
  try{return res.status(200).json({ok:true,worker:'community-grade-v1',...(await run(req.headers['x-parlayping-scheduler-secret']))});}
  catch(error){console.error('ParlayPing community grade worker',{message:error?.message});return res.status(500).json({ok:false,error:error?.message||'Community grading failed.'});}
};
module.exports.run=run;
module.exports.gradeOne=gradeOne;
module.exports.gradeStatus=gradeStatus;
module.exports.compactLeg=compactLeg;
