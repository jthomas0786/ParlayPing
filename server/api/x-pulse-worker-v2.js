const crypto=require('crypto');
const {schedulerAuthorized}=require('./lib/scheduler-auth');

const SUPABASE_URL=process.env.SUPABASE_URL||'https://avwqjgiitxqphvmitolw.supabase.co';
const SUPABASE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_7mYXjjkRrQq3iRig7UYHNQ_b6EZZiJA';
const PUBLIC_BASE=String(process.env.PUBLIC_BASE_URL||'https://parlayping.net').replace(/\/$/,'');
const X_API='https://api.x.com/2';
const X_USERNAME=process.env.X_USERNAME||'ParlayPing';
const TIMEOUT=9000;
const DEFAULT_MIN_INTERVAL_MINUTES=90;
const DEFAULT_REFRESH_HOURS=4;
const GROUP_ORDER=['TD','RECEPTIONS','RUSH_YDS','REC_YDS','PASSING','OTHER'];

function clean(value,max=160){return String(value??'').replace(/\s+/g,' ').trim().slice(0,max);}
function number(value){const n=Number(value);return Number.isFinite(n)?n:0;}
function clamp(value,min,max,fallback){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;}
function minIntervalMs(){return clamp(process.env.X_PULSE_MIN_INTERVAL_MINUTES,30,360,DEFAULT_MIN_INTERVAL_MINUTES)*60_000;}
function refreshMs(){return clamp(process.env.X_PULSE_REFRESH_HOURS,2,12,DEFAULT_REFRESH_HOURS)*60*60_000;}
function pct(value){return encodeURIComponent(String(value)).replace(/!/g,'%21').replace(/'/g,'%27').replace(/\(/g,'%28').replace(/\)/g,'%29').replace(/\*/g,'%2A');}
function propGroup(row){const text=`${row?.market||''} ${row?.display_market||''}`.toLowerCase();if(/\batd\b|touchdown|td scorer|first td/.test(text))return'TD';if(/receptions|\brec\b/.test(text)&&!/(yards|yds)/.test(text))return'RECEPTIONS';if(/rushyds|rushing/.test(text))return'RUSH_YDS';if(/recyds|receiving/.test(text))return'REC_YDS';if(/passyds|passing|pass td|completions|attempts|interceptions/.test(text))return'PASSING';return'OTHER';}
function socialScore(row){return number(row?.like_count)+number(row?.repost_count);}
function trendScore(row){return number(row?.observed_count)*100+number(row?.verified_count)*25+number(row?.attention_score)+socialScore(row)*0.2;}
function rankRows(a,b){return trendScore(b)-trendScore(a)||number(b?.observed_count)-number(a?.observed_count)||number(b?.verified_count)-number(a?.verified_count)||number(b?.attention_score)-number(a?.attention_score);}
function compactLabel(row){const player=clean(row?.player||'NFL prop',24);const market=clean(row?.display_market||row?.market||'prop',24).toUpperCase();return clean(`${player} ${market}`,48);}
function diversifiedSelections(rows,limit=4){
  const valid=(Array.isArray(rows)?rows:[]).filter(row=>String(row?.sport||'').toUpperCase()==='NFL'&&row?.player&&row?.market);
  const leaders=[];
  for(const group of GROUP_ORDER){const best=valid.filter(row=>propGroup(row)===group).sort(rankRows)[0];if(best)leaders.push(best);}
  leaders.sort(rankRows);
  const chosen=leaders.slice(0,limit),seen=new Set(chosen.map(row=>String(row.selection_key||`${row.player}|${row.market}|${row.line}`)));
  if(chosen.length<limit){const counts=new Map(chosen.map(row=>[propGroup(row),1]));for(const row of [...valid].sort(rankRows)){const key=String(row.selection_key||`${row.player}|${row.market}|${row.line}`),group=propGroup(row);if(seen.has(key)||(counts.get(group)||0)>=2)continue;seen.add(key);counts.set(group,(counts.get(group)||0)+1);chosen.push(row);if(chosen.length>=limit)break;}}
  return chosen;
}
function snapshotFor(picks){
  const top=(picks||[]).map((row,index)=>({rank:index+1,selectionKey:String(row?.selection_key||''),group:propGroup(row),player:clean(row?.player,80),market:clean(row?.market,80),displayMarket:clean(row?.display_market,100),observedCount:number(row?.observed_count),verifiedCount:number(row?.verified_count),attentionScore:Number(number(row?.attention_score).toFixed(1)),likes:number(row?.like_count),reposts:number(row?.repost_count),earliestStartAt:row?.earliest_start_at||null}));
  return {sport:'NFL',generatedAt:new Date().toISOString(),top,totalObserved:top.reduce((sum,row)=>sum+row.observedCount,0),totalVerified:top.reduce((sum,row)=>sum+row.verifiedCount,0),propGroups:[...new Set(top.map(row=>row.group))]};
}
function buildPulsePost(picks){
  let selected=[...(picks||[])];
  const render=()=>{
    const body=selected.map(row=>`• ${compactLabel(row)} · ${Math.max(1,number(row?.observed_count))} seen · ${number(row?.verified_count)} verified`).join('\n');
    return `🔥 NFL X BETTING PULSE\n\nTrending in ParlayPing's X scan:\n${body}\n\nPregame only • ${PUBLIC_BASE.replace(/^https?:\/\//,'')}/trending`;
  };
  let text=render();
  while(text.length>275&&selected.length>3){selected=selected.slice(0,-1);text=render();}
  if(text.length>280){const footer=`\n\nPregame only • ${PUBLIC_BASE.replace(/^https?:\/\//,'')}/trending`;const room=Math.max(40,280-footer.length);text=`${text.slice(0,room).trimEnd()}${footer}`.slice(0,280);}
  return {text,picks:selected};
}
function snapshotChanged(current,previous){
  const nowKeys=(current?.top||[]).map(row=>row.selectionKey).filter(Boolean),oldKeys=(previous?.top||[]).map(row=>row.selectionKey).filter(Boolean);
  if(!oldKeys.length)return{meaningful:true,reason:'first-pulse'};
  if(nowKeys.join('|')!==oldKeys.join('|'))return{meaningful:true,reason:'top-props-changed'};
  let maxDelta=0;const oldCounts=new Map((previous?.top||[]).map(row=>[row.selectionKey,number(row.observedCount??row.slipCount)]));
  for(const row of current?.top||[])maxDelta=Math.max(maxDelta,Math.abs(number(row.observedCount)-number(oldCounts.get(row.selectionKey))));
  if(maxDelta>=2)return{meaningful:true,reason:'observed-count-jump',maxDelta};
  const oldTotal=number(previous?.totalObserved??previous?.totalSlips);if(Math.abs(number(current?.totalObserved)-oldTotal)>=4)return{meaningful:true,reason:'pulse-volume-change'};
  return{meaningful:false,reason:'no-meaningful-change',maxDelta};
}
function evaluateCandidate(current,lastAccepted,{force=false,now=Date.now()}={}){if(force)return{allowed:true,reason:'forced-preview'};if(!lastAccepted)return{allowed:true,reason:'first-pulse'};const lastAt=Date.parse(lastAccepted?.createdAt||lastAccepted?.updatedAt||'');if(Number.isFinite(lastAt)&&now-lastAt<minIntervalMs())return{allowed:false,reason:'cooldown',retryAfterMs:minIntervalMs()-(now-lastAt)};const changed=snapshotChanged(current,lastAccepted?.snapshot||null);if(changed.meaningful)return{allowed:true,...changed};if(Number.isFinite(lastAt)&&now-lastAt>=refreshMs())return{allowed:true,reason:'refresh-window'};return{allowed:false,...changed};}
async function rpc(name,body){const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{'content-type':'application/json',apikey:SUPABASE_KEY},body:JSON.stringify(body),signal:AbortSignal.timeout(TIMEOUT)});const text=await response.text();let payload={};try{payload=text?JSON.parse(text):{};}catch{payload={raw:text.slice(0,500)};}if(!response.ok)throw new Error(payload?.message||payload?.error||`${name} failed (${response.status})`);return payload;}
async function readSelections(){const fields='selection_key,sport,player,market,side,line,display_market,observed_count,verified_count,like_count,repost_count,reply_count,attention_score,avg_leg_probability_pct,earliest_start_at,last_observed_at,sample_tweet_id';const url=`${SUPABASE_URL}/rest/v1/x_nfl_prop_pulse?select=${fields}&order=observed_count.desc,attention_score.desc&limit=250`,response=await fetch(url,{headers:{apikey:SUPABASE_KEY},signal:AbortSignal.timeout(TIMEOUT)}),payload=await response.json().catch(()=>[]);if(!response.ok)throw new Error(payload?.message||`NFL pulse feed unavailable (${response.status})`);return Array.isArray(payload)?payload:[];}
function oauthCredentials(){const apiKey=process.env.X_API_KEY,apiSecret=process.env.X_API_SECRET,accessToken=process.env.X_ACCESS_TOKEN,accessTokenSecret=process.env.X_ACCESS_TOKEN_SECRET;if(!apiKey||!apiSecret||!accessToken||!accessTokenSecret)throw new Error('X OAuth 1.0a credentials are incomplete.');return{apiKey,apiSecret,accessToken,accessTokenSecret};}
function oauthHeader(method,rawUrl){const{apiKey,apiSecret,accessToken,accessTokenSecret}=oauthCredentials(),url=new URL(rawUrl),oauth={oauth_consumer_key:apiKey,oauth_nonce:crypto.randomBytes(18).toString('hex'),oauth_signature_method:'HMAC-SHA1',oauth_timestamp:String(Math.floor(Date.now()/1000)),oauth_token:accessToken,oauth_version:'1.0'},pairs=[];for(const[key,value]of url.searchParams.entries())pairs.push([pct(key),pct(value)]);for(const[key,value]of Object.entries(oauth))pairs.push([pct(key),pct(value)]);pairs.sort((a,b)=>a[0]===b[0]?a[1].localeCompare(b[1]):a[0].localeCompare(b[0]));const parameterString=pairs.map(([k,v])=>`${k}=${v}`).join('&'),baseUrl=`${url.protocol}//${url.host}${url.pathname}`,signatureBase=[method.toUpperCase(),pct(baseUrl),pct(parameterString)].join('&'),signingKey=`${pct(apiSecret)}&${pct(accessTokenSecret)}`;oauth.oauth_signature=crypto.createHmac('sha1',signingKey).update(signatureBase).digest('base64');return`OAuth ${Object.keys(oauth).sort().map(key=>`${pct(key)}="${pct(oauth[key])}"`).join(', ')}`;}
async function postTweet(text){const url=`${X_API}/tweets`,response=await fetch(url,{method:'POST',headers:{authorization:oauthHeader('POST',url),'content-type':'application/json'},body:JSON.stringify({text}),signal:AbortSignal.timeout(12_000)}),raw=await response.text();let payload={};try{payload=raw?JSON.parse(raw):{};}catch{payload={detail:raw};}if(!response.ok){const error=new Error(payload?.detail||payload?.title||payload?.errors?.[0]?.message||`X post failed (${response.status})`);error.status=response.status;throw error;}const id=payload?.data?.id;if(!id)throw new Error('X post succeeded without returning a tweet id.');return String(id);}
async function run(secret,options={}){const rows=await readSelections(),picks=diversifiedSelections(rows,4);if(picks.length<3)return{ok:true,active:false,mode:'dry-run',reason:'not-enough-diverse-nfl-props',selectionCount:rows.length,pickCount:picks.length};const built=buildPulsePost(picks),snapshot=snapshotFor(built.picks),contentHash=crypto.createHash('sha256').update(built.text).digest('hex');const context=await rpc('parlayping_x_pulse_context',{p_scheduler_secret:secret}),evaluation=evaluateCandidate(snapshot,context?.lastAccepted||null,{force:Boolean(options?.force)});const autopublish=String(process.env.X_PULSE_AUTOPUBLISH_ENABLED||'false').toLowerCase()==='true';if(!evaluation.allowed)return{ok:true,active:true,mode:autopublish?'publish':'dry-run',published:false,reason:evaluation.reason,retryAfterMs:evaluation.retryAfterMs||null,selectionCount:rows.length,pickCount:built.picks.length,preview:{text:built.text,charCount:built.text.length,snapshot}};const claim=await rpc('parlayping_x_pulse_claim',{p_scheduler_secret:secret,p_content_hash:contentHash,p_post_text:built.text,p_snapshot:snapshot,p_publish_requested:autopublish});if(!claim?.claimed)return{ok:true,active:true,mode:autopublish?'publish':'dry-run',published:false,reason:claim?.reason||'duplicate-content',draftId:claim?.id||null,preview:{text:built.text,charCount:built.text.length,snapshot}};if(!autopublish)return{ok:true,active:true,mode:'dry-run',published:false,reason:evaluation.reason,draftId:claim.id,preview:{text:built.text,charCount:built.text.length,snapshot}};try{const tweetId=await postTweet(built.text);await rpc('parlayping_x_pulse_finalize',{p_scheduler_secret:secret,p_id:claim.id,p_status:'published',p_x_tweet_id:tweetId,p_reason:evaluation.reason});return{ok:true,active:true,mode:'publish',published:true,xTweetId:tweetId,username:X_USERNAME,reason:evaluation.reason,postText:built.text,snapshot};}catch(error){await rpc('parlayping_x_pulse_finalize',{p_scheduler_secret:secret,p_id:claim.id,p_status:'error',p_x_tweet_id:null,p_reason:clean(error?.message||error,240)}).catch(()=>null);throw error;}}
module.exports=async function handler(req,res){res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({ok:false,error:'Use POST.'});if(!schedulerAuthorized(req))return res.status(401).json({ok:false,error:'Unauthorized scheduler request.'});try{const secret=req.headers['x-parlayping-scheduler-secret'],options=req.body&&typeof req.body==='object'?req.body:{};return res.status(200).json(await run(secret,options));}catch(error){console.error('ParlayPing X pulse worker v2',{message:error?.message,status:error?.status||null});return res.status(error?.status===429?429:500).json({ok:false,error:error?.message||'X pulse worker failed.'});}};
module.exports.propGroup=propGroup;module.exports.diversifiedSelections=diversifiedSelections;module.exports.snapshotFor=snapshotFor;module.exports.buildPulsePost=buildPulsePost;module.exports.snapshotChanged=snapshotChanged;module.exports.evaluateCandidate=evaluateCandidate;module.exports.run=run;
