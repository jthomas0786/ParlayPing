const crypto=require('crypto');
const {schedulerAuthorized}=require('./lib/scheduler-auth');

const X_API='https://api.x.com/2';
const SUPABASE_URL=process.env.SUPABASE_URL||'https://avwqjgiitxqphvmitolw.supabase.co';
const SUPABASE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_7mYXjjkRrQq3iRig7UYHNQ_b6EZZiJA';
const FETCH_TIMEOUT_MS=9000;

const SPORTS=[
  {sport:'NFL',google:'NFL player team injury trade starter streak record matchup',espn:'football/nfl'},
  {sport:'NCAAF',google:'college football player team injury transfer starter streak ranking',espn:'football/college-football'},
  {sport:'NBA',google:'NBA player team injury trade starter minutes streak record matchup',espn:'basketball/nba'},
  {sport:'WNBA',google:'WNBA player team injury trade starter minutes streak record matchup',espn:'basketball/wnba'},
  {sport:'NCAAB',google:'college basketball player team injury starter streak ranking matchup',espn:'basketball/mens-college-basketball'},
  {sport:'MLB',google:'MLB player team injury lineup starter streak record matchup',espn:'baseball/mlb'},
  {sport:'NHL',google:'NHL player team injury goalie lineup streak record matchup',espn:'hockey/nhl'},
];

const X_SEARCH_QUERY='("bet slip" OR betslip OR parlay OR SGP OR "same game parlay") (FanDuel OR DraftKings OR BetMGM OR bet365 OR Caesars OR "ESPN BET") has:media -is:retweet -is:reply lang:en';

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function clean(value,max=2000){return String(value??'').replace(/\s+/g,' ').trim().slice(0,max);}
function sha(value){return crypto.createHash('sha256').update(String(value||'')).digest('hex');}
function pct(value){return encodeURIComponent(String(value)).replace(/!/g,'%21').replace(/'/g,'%27').replace(/\(/g,'%28').replace(/\)/g,'%29').replace(/\*/g,'%2A');}
function stripHtml(value){return clean(String(value||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' '),1000);}
function decodeXml(value){
  return clean(String(value||'')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>'),2000);
}
function xmlTag(block,tag){const match=String(block||'').match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'i'));return match?decodeXml(match[1]):'';}
function ageHours(value){const time=Date.parse(value||'');return Number.isFinite(time)?Math.max(0,(Date.now()-time)/3600000):168;}
function sourceKey(item){return sha(`${item.sport}|${item.source_url}|${item.headline}`);}

async function fetchText(url,options={}){
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(FETCH_TIMEOUT_MS)});
  const text=await response.text();
  if(!response.ok){const error=new Error(`Source request failed (${response.status})`);error.status=response.status;error.body=text.slice(0,300);throw error;}
  return text;
}
async function fetchJson(url,options={}){const text=await fetchText(url,options);try{return text?JSON.parse(text):{};}catch{throw new Error('Source returned invalid JSON.');}}

function categoryForHeadline(value){
  const text=String(value||'').toLowerCase();
  if(/injur|questionable|doubtful|ruled out|inactive|day-to-day|concussion|hamstring|ankle|knee|illness/.test(text))return 'Injury / availability';
  if(/trade|traded|signs|signed|waiv|released|acquired|roster|transfer portal/.test(text))return 'Roster move';
  if(/starter|starting|lineup|depth chart|minutes|snap count|targets|touches|role|rotation|goalie/.test(text))return 'Role / lineup';
  if(/streak|record|milestone|career-high|career high|leads? the league|historic|history/.test(text))return 'Trend / milestone';
  if(/matchup|vs\.? |versus|series|preview/.test(text))return 'Matchup';
  return 'Team / player update';
}
function insightScore(item){
  const age=ageHours(item.source_published_at);
  const freshness=clamp(100-age*3.4,8,100);
  const categoryBoost={
    'Injury / availability':24,
    'Role / lineup':18,
    'Roster move':18,
    'Trend / milestone':14,
    'Matchup':8,
    'Team / player update':5,
  }[item.category]||0;
  const sourceBoost=/espn/i.test(item.source_name||'')?7:0;
  return Math.round((freshness+categoryBoost+sourceBoost)*10)/10;
}
function normalizedHeadline(value){return clean(value,500).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}

function parseGoogleNews(xml,sport){
  const rows=[];
  for(const match of String(xml||'').matchAll(/<item>([\s\S]*?)<\/item>/gi)){
    const block=match[1];
    const source=xmlTag(block,'source')||'Google News';
    let headline=xmlTag(block,'title');
    headline=headline.replace(new RegExp(`\\s+-\\s+${source.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`,'i'),'').trim();
    const sourceUrl=xmlTag(block,'link');
    const published=xmlTag(block,'pubDate');
    if(!headline||!sourceUrl)continue;
    const category=categoryForHeadline(headline);
    const row={sport,category,headline,summary:null,entity_name:null,entity_type:null,source_name:source,source_url:sourceUrl,source_published_at:Number.isFinite(Date.parse(published))?new Date(published).toISOString():null,metadata:{sourceType:'google-news'}};
    row.score=insightScore(row);row.source_key=sourceKey(row);rows.push(row);
  }
  return rows;
}

async function googleNewsForSport(config){
  const query=`${config.google} when:1d`;
  const url=`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const xml=await fetchText(url,{headers:{accept:'application/rss+xml,text/xml;q=0.9,*/*;q=0.8'}});
  return parseGoogleNews(xml,config.sport).slice(0,14);
}

function parseEspnNews(payload,sport){
  const rows=[];
  for(const article of Array.isArray(payload?.articles)?payload.articles:[]){
    const headline=clean(article?.headline,500);if(!headline)continue;
    const sourceUrl=clean(article?.links?.web?.href||article?.link,2000);if(!sourceUrl)continue;
    const description=stripHtml(article?.description||article?.story||'');
    const published=article?.published||article?.lastModified||null;
    const row={sport,category:categoryForHeadline(headline),headline,summary:description||null,entity_name:null,entity_type:null,source_name:'ESPN',source_url:sourceUrl,source_published_at:Number.isFinite(Date.parse(published||''))?new Date(published).toISOString():null,metadata:{sourceType:'espn'}};
    row.score=insightScore(row);row.source_key=sourceKey(row);rows.push(row);
  }
  return rows;
}
async function espnNewsForSport(config){
  const url=`https://site.api.espn.com/apis/site/v2/sports/${config.espn}/news?limit=18`;
  return parseEspnNews(await fetchJson(url,{headers:{accept:'application/json'}}),config.sport);
}

function selectInsights(rows,limit=16){
  const deduped=[],seen=new Set();
  for(const row of rows.sort((a,b)=>b.score-a.score||ageHours(a.source_published_at)-ageHours(b.source_published_at))){
    const key=normalizedHeadline(row.headline);if(!key||seen.has(key))continue;seen.add(key);deduped.push(row);
  }
  const selected=[],perSport=new Map();
  for(const row of deduped){
    const count=perSport.get(row.sport)||0;if(count>=3)continue;
    selected.push(row);perSport.set(row.sport,count+1);if(selected.length>=limit)break;
  }
  if(selected.length<Math.min(limit,10))for(const row of deduped){if(selected.includes(row))continue;selected.push(row);if(selected.length>=limit)break;}
  return selected;
}

async function discoverInsights(){
  const tasks=[];
  for(const config of SPORTS){tasks.push(googleNewsForSport(config));tasks.push(espnNewsForSport(config));}
  const settled=await Promise.allSettled(tasks);
  const rows=[];const errors=[];
  settled.forEach((result,index)=>{if(result.status==='fulfilled')rows.push(...result.value);else errors.push({source:index%2===0?'google-news':'espn',sport:SPORTS[Math.floor(index/2)]?.sport||'SPORTS',error:clean(result.reason?.message||result.reason,240)});});
  return {rows:selectInsights(rows),sourceErrors:errors,sourceSuccesses:settled.length-errors.length};
}

function oauthCredentials(){
  const apiKey=process.env.X_API_KEY,apiSecret=process.env.X_API_SECRET,accessToken=process.env.X_ACCESS_TOKEN,accessTokenSecret=process.env.X_ACCESS_TOKEN_SECRET;
  if(!apiKey||!apiSecret||!accessToken||!accessTokenSecret)throw new Error('X OAuth credentials are incomplete.');
  return{apiKey,apiSecret,accessToken,accessTokenSecret};
}
function oauthHeader(method,rawUrl){
  const{apiKey,apiSecret,accessToken,accessTokenSecret}=oauthCredentials();const url=new URL(rawUrl);
  const oauth={oauth_consumer_key:apiKey,oauth_nonce:crypto.randomBytes(18).toString('hex'),oauth_signature_method:'HMAC-SHA1',oauth_timestamp:String(Math.floor(Date.now()/1000)),oauth_token:accessToken,oauth_version:'1.0'};
  const pairs=[];for(const[key,value]of url.searchParams.entries())pairs.push([pct(key),pct(value)]);for(const[key,value]of Object.entries(oauth))pairs.push([pct(key),pct(value)]);
  pairs.sort((a,b)=>a[0]===b[0]?a[1].localeCompare(b[1]):a[0].localeCompare(b[0]));
  const parameterString=pairs.map(([k,v])=>`${k}=${v}`).join('&');const baseUrl=`${url.protocol}//${url.host}${url.pathname}`;
  const signatureBase=[method.toUpperCase(),pct(baseUrl),pct(parameterString)].join('&');const signingKey=`${pct(apiSecret)}&${pct(accessTokenSecret)}`;
  oauth.oauth_signature=crypto.createHmac('sha1',signingKey).update(signatureBase).digest('base64');
  return `OAuth ${Object.keys(oauth).sort().map(key=>`${pct(key)}="${pct(oauth[key])}"`).join(', ')}`;
}
async function xGet(path){
  const url=`${X_API}${path}`;
  const payload=await fetchJson(url,{headers:{authorization:oauthHeader('GET',url),accept:'application/json'}}).catch(error=>{error.source='x';throw error;});
  return payload;
}
function detectSport(text){
  const value=` ${String(text||'').toLowerCase()} `;
  const rules=[
    ['NFL',/\bnfl\b|touchdown|passing yards|receiving yards|rushing yards|anytime td|\bqb\b|\bwr\b/],
    ['NCAAF',/\bncaaf\b|college football|\bcfb\b/],
    ['NBA',/\bnba\b|points \+ rebounds|pra\b|three.?pointers|3pt/],
    ['WNBA',/\bwnba\b/],
    ['NCAAB',/\bncaab\b|college basketball|march madness/],
    ['MLB',/\bmlb\b|home run|hits\b|strikeouts|\brbi\b/],
    ['NHL',/\bnhl\b|shots on goal|goal scorer|saves\b/],
  ];
  for(const[sport,re]of rules)if(re.test(value))return sport;return 'SPORTS';
}
function looksLikeBetslip(tweet,mediaByKey){
  const text=String(tweet?.text||'');
  const keys=tweet?.attachments?.media_keys||[];
  if(!keys.some(key=>mediaByKey.has(String(key))))return false;
  return /bet\s*slip|betslip|parlay|same game|\bsgp\b|fanduel|draftkings|betmgm|bet365|caesars|espn bet|\+\d{3,5}/i.test(text);
}
function attentionScore(tweet){
  const m=tweet?.public_metrics||{};
  const likes=Number(m.like_count)||0,reposts=Number(m.retweet_count)||0,replies=Number(m.reply_count)||0,quotes=Number(m.quote_count)||0,bookmarks=Number(m.bookmark_count)||0,views=Number(m.impression_count)||0;
  const engagement=likes+reposts*2.4+replies*1.6+quotes*2.2+bookmarks*1.4;
  const viewSignal=Math.min(90,Math.log10(Math.max(1,views)+1)*16);
  const decay=Math.max(.2,Math.exp(-ageHours(tweet?.created_at)/54));
  return Math.round((engagement+viewSignal)*decay*10)/10;
}
async function discoverTrendingX(){
  const params=new URLSearchParams({query:X_SEARCH_QUERY,max_results:'100','tweet.fields':'author_id,created_at,public_metrics,attachments,possibly_sensitive,text',expansions:'author_id,attachments.media_keys','user.fields':'id,username,name','media.fields':'media_key,type,url,preview_image_url'});
  const payload=await xGet(`/tweets/search/recent?${params}`);
  const users=new Map((payload?.includes?.users||[]).map(user=>[String(user.id),user]));
  const mediaByKey=new Map((payload?.includes?.media||[]).map(media=>[String(media.media_key),media]));
  const candidates=[];
  for(const tweet of payload?.data||[]){
    if(tweet?.possibly_sensitive||!looksLikeBetslip(tweet,mediaByKey))continue;
    const author=users.get(String(tweet.author_id))||{};
    const media=(tweet?.attachments?.media_keys||[]).map(key=>mediaByKey.get(String(key))).find(Boolean);
    const m=tweet?.public_metrics||{};const score=attentionScore(tweet);
    const row={
      tweet_id:String(tweet.id),tweet_url:`https://x.com/${author.username||'i'}/status/${tweet.id}`,
      author_id:String(tweet.author_id||''),author_username:author.username||null,author_name:author.name||null,
      text:clean(tweet.text,1800),sport:detectSport(tweet.text),media_url:media?.url||media?.preview_image_url||null,
      created_at:Number.isFinite(Date.parse(tweet.created_at||''))?new Date(tweet.created_at).toISOString():null,
      like_count:Number(m.like_count)||0,repost_count:Number(m.retweet_count)||0,reply_count:Number(m.reply_count)||0,
      quote_count:Number(m.quote_count)||0,bookmark_count:Number(m.bookmark_count)||0,impression_count:Number(m.impression_count)||0,
      attention_score:score,metadata:{source:'x-recent-search',hasMedia:Boolean(media),queryVersion:1}
    };
    candidates.push(row);
  }
  candidates.sort((a,b)=>b.attention_score-a.attention_score||Date.parse(b.created_at||'')-Date.parse(a.created_at||''));
  const high=candidates.filter(row=>row.like_count+row.repost_count+row.reply_count+row.quote_count>=8||row.impression_count>=750);
  return (high.length>=3?high:candidates).slice(0,12);
}

async function publishDiscovery(secret,{insights,trending,insightsOk,trendingOk}){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/parlayping_publish_discovery`,{
    method:'POST',headers:{'content-type':'application/json',apikey:SUPABASE_KEY},signal:AbortSignal.timeout(FETCH_TIMEOUT_MS),
    body:JSON.stringify({p_scheduler_secret:secret,p_insights:insights,p_trending:trending,p_insights_ok:insightsOk,p_trending_ok:trendingOk,p_run_at:new Date().toISOString()})
  });
  const text=await response.text();let payload={};try{payload=text?JSON.parse(text):{};}catch{payload={raw:text.slice(0,500)};}
  if(!response.ok)throw new Error(payload?.message||payload?.error||`Discovery publish failed (${response.status}).`);
  return payload;
}

async function runDiscovery(secret){
  const [insightResult,xResult]=await Promise.allSettled([discoverInsights(),discoverTrendingX()]);
  const insightData=insightResult.status==='fulfilled'?insightResult.value:{rows:[],sourceErrors:[{error:clean(insightResult.reason?.message||insightResult.reason,240)}],sourceSuccesses:0};
  const trending=xResult.status==='fulfilled'?xResult.value:[];
  const insightsOk=insightResult.status==='fulfilled'&&insightData.rows.length>0;
  const trendingOk=xResult.status==='fulfilled'&&trending.length>0;
  if(!insightsOk&&!trendingOk){
    const error=new Error('Both discovery sources failed to produce fresh rows.');
    error.details={insights:insightData.sourceErrors,x:clean(xResult.reason?.message||xResult.reason,240)};throw error;
  }
  const published=await publishDiscovery(secret,{insights:insightData.rows,trending,insightsOk,trendingOk});
  return {published,insights:{ok:insightsOk,count:insightData.rows.length,sourceSuccesses:insightData.sourceSuccesses,sourceErrors:insightData.sourceErrors},trending:{ok:trendingOk,count:trending.length,error:xResult.status==='rejected'?clean(xResult.reason?.message||xResult.reason,240):null}};
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Use POST.'});
  if(!schedulerAuthorized(req))return res.status(401).json({ok:false,error:'Unauthorized scheduler request.'});
  const secret=req.headers['x-parlayping-scheduler-secret'];
  try{
    const result=await runDiscovery(secret);
    return res.status(200).json({ok:true,worker:'hourly-sports-discovery',...result});
  }catch(error){
    console.error('ParlayPing discovery worker',{message:error?.message,details:error?.details||null});
    return res.status(error?.status===429?429:500).json({ok:false,error:error?.message||'Discovery worker failed.',details:error?.details||null});
  }
};

module.exports.categoryForHeadline=categoryForHeadline;
module.exports.parseGoogleNews=parseGoogleNews;
module.exports.parseEspnNews=parseEspnNews;
module.exports.selectInsights=selectInsights;
module.exports.detectSport=detectSport;
module.exports.attentionScore=attentionScore;
module.exports.looksLikeBetslip=looksLikeBetslip;
module.exports.discoverTrendingX=discoverTrendingX;
module.exports.runDiscovery=runDiscovery;
