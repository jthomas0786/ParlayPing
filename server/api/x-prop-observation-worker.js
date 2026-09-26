const crypto=require('crypto');
const pregame=require('./discovery-worker-pregame');
const {parseSlip}=require('../../lib/slip-parser-wrapper');
const {schedulerAuthorized}=require('./lib/scheduler-auth');

const SUPABASE_URL=process.env.SUPABASE_URL||'https://avwqjgiitxqphvmitolw.supabase.co';
const SUPABASE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_7mYXjjkRrQq3iRig7UYHNQ_b6EZZiJA';
const TIMEOUT=9000;
const MAX_CANDIDATES=30;
const MAX_OFFSET=150;
const LOOKBACK_MS=48*60*60*1000;
const BATCH_SIZE=10;
const START_BUFFER_MS=60_000;

function clean(v,max=240){return String(v??'').replace(/\s+/g,' ').trim().slice(0,max);}
function clampOffset(value){const n=Math.floor(Number(value)||0);return Math.max(0,Math.min(MAX_OFFSET,n));}
function defaultOffset(){const slices=[0,30,60,90,120,150];return slices[Math.floor(Date.now()/600000)%slices.length];}
function selectionKey(leg){const raw=['NFL',clean(leg?.player,120).toLowerCase(),String(leg?.market||'').toLowerCase(),String(leg?.side||'').toLowerCase(),leg?.line??''].join('|');return crypto.createHash('md5').update(raw).digest('hex');}
function displayMarket(leg){const original=clean(leg?.originalText,90);if(original)return original;const market=clean(leg?.market,40).toUpperCase(),line=leg?.line===null||leg?.line===undefined?'':` ${leg.line}`;return clean(`${market}${line}`,90);}
async function rpc(name,body){const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{'content-type':'application/json',apikey:SUPABASE_KEY},body:JSON.stringify(body),signal:AbortSignal.timeout(TIMEOUT)}),text=await r.text();let p={};try{p=text?JSON.parse(text):{};}catch{p={raw:text.slice(0,500)};}if(!r.ok)throw new Error(p?.message||p?.error||`${name} failed (${r.status})`);return p;}
async function readCandidates(secret,offset){const p=await rpc('parlayping_prop_observation_candidates',{p_scheduler_secret:secret,p_offset:clampOffset(offset),p_limit:MAX_CANDIDATES,p_cutoff:new Date(Date.now()-LOOKBACK_MS).toISOString()});return Array.isArray(p)?p:[];}
async function observeOne(row){
  const validation=await pregame.validateTrend(row);
  if(!validation?.ok)return{ok:false,tweet_id:String(row.tweet_id),reason:validation?.reason||'not-pregame'};
  const start=Date.parse(validation?.event_start_at||'');
  if(!Number.isFinite(start)||start<=Date.now()+START_BUFFER_MS)return{ok:false,tweet_id:String(row.tweet_id),reason:'event-started-or-missing'};
  const parsed=await parseSlip({text:pregame.corePostText(row.text),mediaUrls:row.media_url?[row.media_url]:[]});
  const legs=(parsed?.legs||[]).filter(leg=>String(leg?.sport||'').toUpperCase()==='NFL'&&clean(leg?.player,120)&&clean(leg?.market,80));
  if(!legs.length)return{ok:false,tweet_id:String(row.tweet_id),reason:'no-nfl-props'};
  const isVerified=Boolean(row?.builder_ready&&row?.is_pregame_confirmed&&Date.parse(row?.event_start_at||'')>Date.now()+START_BUFFER_MS);
  const seen=new Set(),observations=[];
  for(const leg of legs){
    const key=selectionKey(leg);if(seen.has(key))continue;seen.add(key);
    observations.push({tweet_id:String(row.tweet_id),selection_key:key,sport:'NFL',player:clean(leg.player,120),market:clean(leg.market,80),side:clean(leg.side,40)||null,line:leg?.line===null||leg?.line===undefined?null:String(leg.line),display_market:displayMarket(leg),event_start_at:new Date(start).toISOString(),source_created_at:row.created_at||null,tweet_url:row.tweet_url||null,author_username:row.author_username||null,like_count:Number(row.like_count)||0,repost_count:Number(row.repost_count)||0,reply_count:Number(row.reply_count)||0,attention_score:Number(row.attention_score)||0,leg_probability_pct:null,is_verified:isVerified});
  }
  return{ok:true,tweet_id:String(row.tweet_id),count:observations.length,observations};
}
async function run(secret,options={}){
  const offset=clampOffset(options?.analysisOffset===undefined||options?.analysisOffset===null?defaultOffset():options.analysisOffset),rows=await readCandidates(secret,offset),observations=[],rejected=[];
  for(let i=0;i<rows.length;i+=BATCH_SIZE){const batch=rows.slice(i,i+BATCH_SIZE),settled=await Promise.allSettled(batch.map(observeOne));settled.forEach((result,index)=>{const row=batch[index];if(result.status==='fulfilled'&&result.value?.ok)observations.push(...result.value.observations);else rejected.push(result.status==='fulfilled'?result.value:{tweet_id:String(row.tweet_id),reason:'observation-error',detail:clean(result.reason?.message||result.reason,180)});});}
  const unique=new Map();for(const obs of observations)unique.set(`${obs.tweet_id}|${obs.selection_key}`,obs);const rowsOut=[...unique.values()];
  const applied=rowsOut.length?await rpc('parlayping_upsert_prop_observations',{p_scheduler_secret:secret,p_rows:rowsOut,p_run_at:new Date().toISOString()}):{ok:true,upserted:0};
  return{offset,checked:rows.length,observedTweets:new Set(rowsOut.map(r=>r.tweet_id)).size,observations:rowsOut.length,applied,rejected:rejected.length,rejectionReasons:rejected.reduce((m,r)=>{const k=r?.reason||'unknown';m[k]=(m[k]||0)+1;return m;},{})};
}
module.exports=async function handler(req,res){res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({ok:false,error:'Use POST.'});if(!schedulerAuthorized(req))return res.status(401).json({ok:false,error:'Unauthorized scheduler request.'});try{const secret=req.headers['x-parlayping-scheduler-secret'],options=req.body&&typeof req.body==='object'?req.body:{};return res.status(200).json({ok:true,worker:'nfl-x-prop-observation-v2',...(await run(secret,options))});}catch(error){console.error('NFL X prop observation worker',{message:error?.message});return res.status(error?.status===429?429:500).json({ok:false,error:error?.message||'Observation worker failed.'});}};
module.exports.run=run;
