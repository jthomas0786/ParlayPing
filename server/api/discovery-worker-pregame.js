const baseWorker=require('./discovery-worker');
const {parseSlip}=require('../../lib/slip-parser-wrapper');
const {loadSnapshot}=require('./lib/sportsbook-enrich');
const {schedulerAuthorized}=require('./lib/scheduler-auth');

const SUPABASE_URL=process.env.SUPABASE_URL||'https://avwqjgiitxqphvmitolw.supabase.co';
const SUPABASE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_7mYXjjkRrQq3iRig7UYHNQ_b6EZZiJA';
const SUPPORTED_SPORTS=new Set(['NFL','NCAAF','NBA','WNBA','NCAAB','MLB','NHL']);
const SNAPSHOT_SPORTS=new Set(['NFL','NCAAF','NBA','WNBA','NCAAB','MLB','NHL']);
const SPORTS_OUTPOST_BASE=String(process.env.SPORTS_OUTPOST_BASE_URL||'https://thesportsoutpost.com').replace(/\/$/,'');
const FETCH_TIMEOUT_MS=9000;
const START_BUFFER_MS=60*1000;
const MAX_VALIDATION_ROWS=12;

function clean(value,max=1000){return String(value??'').replace(/\s+/g,' ').trim().slice(0,max);}
function norm(value){return clean(value,200).toLowerCase().normalize('NFKD').replace(/[.'’]/g,'').replace(/\b(jr|sr|ii|iii|iv|v)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
function compact(value){return norm(value).replace(/\s+/g,'');}
function finiteTime(value){const t=Date.parse(value||'');return Number.isFinite(t)?t:null;}
function futureIso(value,now=Date.now()){const t=finiteTime(value);return t!=null&&t>now+START_BUFFER_MS?new Date(t).toISOString():null;}
function corePostText(value){
  const raw=String(value||'');
  const promo=raw.search(/\s#(?:NBA|WNBA|CBB|NCAAB|MLB|NHL|NFL|CFB|NCAAF|PrizePicks|PROPS|POTD|Picks|Gambling|Sportsbetting|DraftKings|Fanduel)\b/i);
  return clean(promo>0?raw.slice(0,promo):raw,1800);
}
function fallbackSport(value){
  const text=` ${corePostText(value).toLowerCase()} `;
  if(/\bwnba\b/.test(text))return 'WNBA';
  if(/\bncaaf\b|\bcfb\b|college football/.test(text))return 'NCAAF';
  if(/\bncaab\b|\bcbb\b|college basketball/.test(text))return 'NCAAB';
  if(/\bmlb\b|home run|\bhrr\b|total bases|\brbi\b|stolen base/.test(text))return 'MLB';
  if(/\bnhl\b|shots on goal|goal scorer|goalie saves/.test(text))return 'NHL';
  if(/\bnba\b|rebounds?|three.?pointers?|\bpra\b/.test(text))return 'NBA';
  if(/\bnfl\b|touchdown|receiving yards?|rushing yards?|passing yards?/.test(text))return 'NFL';
  return null;
}
function rowSport(legs,text){
  const sports=[...new Set((legs||[]).map(leg=>String(leg?.sport||'').toUpperCase()).filter(sport=>SUPPORTED_SPORTS.has(sport)))];
  if(sports.length===1)return sports[0];
  if(sports.length>1)return 'MIXED';
  return fallbackSport(text);
}
function teamTokens(game){
  const out=[];
  const push=value=>{const n=norm(value);if(n&&!out.includes(n))out.push(n);};
  for(const key of ['away','home','awayTeam','homeTeam','awayName','homeName']){
    const value=game?.[key];
    if(value&&typeof value==='object')for(const field of ['name','displayName','shortDisplayName','abbr','abbreviation','team'])push(value?.[field]);
    else push(value);
  }
  return out;
}
function playerTokens(game){
  const out=[];
  const push=value=>{const n=norm(value);if(n&&!out.includes(n))out.push(n);};
  for(const row of Array.isArray(game?.players)?game.players:[])push(row?.name||row?.player||row?.playerName);
  for(const side of ['away','home']){
    const team=game?.[side];
    for(const row of Array.isArray(team?.lineup)?team.lineup:[])push(row?.name||row?.player||row?.playerName);
    for(const row of Array.isArray(team?.players)?team.players:[])push(row?.name||row?.player||row?.playerName);
  }
  return out;
}
function gameStart(game){return futureIso(game?.commenceTime||game?.startDateUTC||game?.startTimeUTC||game?.startTime||game?.date||game?.start);}
function eventLabel(game){
  const values=[];
  for(const key of ['awayName','awayTeam','away']){const v=game?.[key];const name=typeof v==='object'?(v?.abbr||v?.abbreviation||v?.shortDisplayName||v?.name):v;if(name){values.push(clean(name,80));break;}}
  for(const key of ['homeName','homeTeam','home']){const v=game?.[key];const name=typeof v==='object'?(v?.abbr||v?.abbreviation||v?.shortDisplayName||v?.name):v;if(name){values.push(clean(name,80));break;}}
  return values.length===2?`${values[0]} @ ${values[1]}`:null;
}
function matchesToken(a,b){const x=compact(a),y=compact(b);return Boolean(x&&y&&(x===y||x.includes(y)||y.includes(x)));}
async function loadPregameSnapshot(sport){
  const existing=await loadSnapshot(sport);if(existing)return existing;
  if(String(sport||'').toUpperCase()!=='NCAAF')return null;
  try{const response=await fetch(`${SPORTS_OUTPOST_BASE}/slates/ncaaf-odds.json`,{headers:{accept:'application/json','user-agent':'ParlayPing/1.3'},cache:'no-store',signal:AbortSignal.timeout(FETCH_TIMEOUT_MS)});if(!response.ok)return null;return await response.json();}catch{return null;}
}
function resolveLegFromSnapshot(leg,doc){
  const direct=futureIso(leg?.startTimeUTC);if(direct)return {start:direct,label:clean(leg?.matchup,160)||null,method:'leg-start'};
  const games=Array.isArray(doc?.games)?doc.games:[];
  const wantedPlayer=norm(leg?.player),wantedTeam=norm(leg?.team),wantedMatchup=norm(leg?.matchup);
  const candidates=[];
  for(const game of games){
    const start=gameStart(game);if(!start)continue;
    const players=playerTokens(game),teams=teamTokens(game);
    let score=0;
    if(wantedPlayer&&players.some(value=>matchesToken(value,wantedPlayer)))score+=8;
    if(wantedTeam&&teams.some(value=>matchesToken(value,wantedTeam)))score+=4;
    if(wantedMatchup&&teams.filter(value=>wantedMatchup.includes(value)||value.includes(wantedMatchup)).length)score+=3;
    if(score>0)candidates.push({start,label:eventLabel(game),method:'sports-outpost',score});
  }
  candidates.sort((a,b)=>b.score-a.score||Date.parse(a.start)-Date.parse(b.start));
  if(candidates.length&&(!candidates[1]||candidates[0].score>candidates[1].score||candidates[0].start===candidates[1].start))return candidates[0];
  const rows=Array.isArray(doc?.rows)?doc.rows:[];
  for(const row of rows){
    if(wantedPlayer&&!matchesToken(row?.player||row?.playerName||row?.name,wantedPlayer))continue;
    const start=futureIso(row?.commenceTime||row?.startDateUTC||row?.startTimeUTC||row?.startTime);if(start)return {start,label:clean(row?.matchup,160)||null,method:'sports-outpost-row'};
  }
  return null;
}
async function validateTrend(row,now=Date.now()){
  const postText=corePostText(row?.text);
  let parsed;
  try{parsed=await parseSlip({text:postText,mediaUrls:row?.media_url?[row.media_url]:[]});}
  catch(error){return {ok:false,tweet_id:String(row?.tweet_id||''),reason:'parse-failed',detail:clean(error?.message||error,180)};}
  const legs=(Array.isArray(parsed?.legs)?parsed.legs:[]).filter(leg=>SUPPORTED_SPORTS.has(String(leg?.sport||'').toUpperCase()));
  if(!legs.length)return {ok:false,tweet_id:String(row?.tweet_id||''),reason:'no-supported-legs'};
  const resolved=[];
  const snapshots=new Map();
  for(const leg of legs){
    const sport=String(leg?.sport||'').toUpperCase();
    let hit=futureIso(leg?.startTimeUTC,now)?{start:futureIso(leg.startTimeUTC,now),label:clean(leg?.matchup,160)||null,method:'leg-start'}:null;
    if(!hit&&SNAPSHOT_SPORTS.has(sport)){
      if(!snapshots.has(sport))snapshots.set(sport,await loadPregameSnapshot(sport));
      hit=resolveLegFromSnapshot(leg,snapshots.get(sport));
    }
    if(!hit||finiteTime(hit.start)<=now+START_BUFFER_MS)return {ok:false,tweet_id:String(row?.tweet_id||''),reason:'unconfirmed-or-started-leg',sport,player:clean(leg?.player,120)};
    resolved.push({...hit,sport,player:clean(leg?.player,120)});
  }
  if(!resolved.length)return {ok:false,tweet_id:String(row?.tweet_id||''),reason:'no-resolved-legs'};
  const earliest=Math.min(...resolved.map(item=>Date.parse(item.start)).filter(Number.isFinite));
  if(!Number.isFinite(earliest)||earliest<=now+START_BUFFER_MS)return {ok:false,tweet_id:String(row?.tweet_id||''),reason:'started'};
  const sport=rowSport(legs,postText);if(!sport)return {ok:false,tweet_id:String(row?.tweet_id||''),reason:'sport-unknown'};
  const labels=[...new Set(resolved.map(item=>item.label).filter(Boolean))];
  return {ok:true,tweet_id:String(row.tweet_id),sport,event_start_at:new Date(earliest).toISOString(),event_label:labels.length===1?labels[0]:labels.length>1?'Multi-game parlay':null,validation:{method:'visible-slip-plus-current-slate',parsedMethod:parsed?.method||null,legCount:legs.length,resolvedLegs:resolved.length,checkedAt:new Date(now).toISOString()}};
}
async function readActiveRows(){
  const select='tweet_id,text,sport,media_url,attention_score,created_at';
  const url=`${SUPABASE_URL}/rest/v1/x_trending_betslips?is_active=eq.true&select=${select}&order=attention_score.desc,created_at.desc&limit=${MAX_VALIDATION_ROWS}`;
  const response=await fetch(url,{headers:{apikey:SUPABASE_KEY},signal:AbortSignal.timeout(FETCH_TIMEOUT_MS)});
  const payload=await response.json().catch(()=>[]);if(!response.ok)throw new Error(payload?.message||`Could not read trending rows (${response.status}).`);
  return Array.isArray(payload)?payload:[];
}
async function applyPregame(secret,rows){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/parlayping_apply_trending_pregame`,{method:'POST',headers:{'content-type':'application/json',apikey:SUPABASE_KEY},signal:AbortSignal.timeout(FETCH_TIMEOUT_MS),body:JSON.stringify({p_scheduler_secret:secret,p_rows:rows,p_run_at:new Date().toISOString()})});
  const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload?.message||payload?.error||`Pregame publish failed (${response.status}).`);return payload;
}
async function postprocessTrending(secret){
  const rows=await readActiveRows();
  const results=[];
  for(let i=0;i<rows.length;i+=4){const batch=rows.slice(i,i+4);const settled=await Promise.allSettled(batch.map(row=>validateTrend(row)));settled.forEach((result,index)=>results.push({result,row:batch[index]}));}
  const approved=[],rejected=[];
  results.forEach(({result,row})=>{if(result.status==='fulfilled'&&result.value?.ok)approved.push(result.value);else rejected.push(result.status==='fulfilled'?result.value:{ok:false,tweet_id:String(row?.tweet_id||''),reason:'validation-error',detail:clean(result.reason?.message||result.reason,180)});});
  const applied=await applyPregame(secret,approved);
  return {checked:rows.length,approved:approved.length,rejected:rejected.length,applied,rejectionReasons:rejected.reduce((acc,row)=>{const key=row?.reason||'unknown';acc[key]=(acc[key]||0)+1;return acc;},{})};
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Use POST.'});
  if(!schedulerAuthorized(req))return res.status(401).json({ok:false,error:'Unauthorized scheduler request.'});
  const secret=req.headers['x-parlayping-scheduler-secret'];
  try{
    const discovery=await baseWorker.runDiscovery(secret);
    const pregame=await postprocessTrending(secret);
    return res.status(200).json({ok:true,worker:'hourly-sports-discovery-pregame',...discovery,pregame});
  }catch(error){
    console.error('ParlayPing pregame discovery worker',{message:error?.message});
    return res.status(error?.status===429?429:500).json({ok:false,error:error?.message||'Discovery worker failed.'});
  }
};

module.exports.corePostText=corePostText;
module.exports.fallbackSport=fallbackSport;
module.exports.rowSport=rowSport;
module.exports.resolveLegFromSnapshot=resolveLegFromSnapshot;
module.exports.validateTrend=validateTrend;
module.exports.postprocessTrending=postprocessTrending;
