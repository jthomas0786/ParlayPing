const legacy=require('../server/api/lib/slip-parser');

const MLB_BINARY=new Set(['homeRun','pitcherWin']);
const MLB_MARKETS=new Set([
  'homeRun','hits','totalBases','rbi','hrr','stolenBases','runs','singles','doubles','triples','walks','batterStrikeouts',
  'hitsRuns','hitsRbi','runsRbi','extraBaseHits','pitcherStrikeouts','pitchingOuts','hitsAllowed','earnedRuns','walksAllowed',
  'homeRunsAllowed','pitcherWin'
]);
const MLB_ALIASES={
  homeRuns:'homeRun',hr:'homeRun',homer:'homeRun',rbis:'rbi',runsBattedIn:'rbi',hitsRunsRbi:'hrr',hitsRunsRbis:'hrr',
  stolenBase:'stolenBases',strikeoutsBatter:'batterStrikeouts',batterKs:'batterStrikeouts',pitcherKs:'pitcherStrikeouts',
  strikeoutsPitcher:'pitcherStrikeouts',outsRecorded:'pitchingOuts',pitcherOuts:'pitchingOuts',basesOnBalls:'walks',
  basesOnBallsAllowed:'walksAllowed',pitcherWalks:'walksAllowed',pitcherHitsAllowed:'hitsAllowed',pitcherEarnedRuns:'earnedRuns'
};

function clean(value){return String(value||'').replace(/^[-•✅☑️🔥🔒\s]+/,'').replace(/\s+/g,' ').trim();}
function playerKey(value){return clean(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();}
function likelyPlayerName(value){
  const raw=clean(value),key=playerKey(raw);
  if(!raw||raw.length<2||raw.length>90)return false;
  if(/https?:\/\//i.test(raw)||/@[a-z0-9_]+/i.test(raw))return false;
  if(/^(?:mlb|baseball|major league baseball)(?:\s+(?:hit|hits|hr|homer|home run|mega|parlay|props?|picks?|bets?|slip|special).*)?$/i.test(raw))return false;
  if(/^(?:hit|hr|home run|homer)\s+(?:mega|parlay|props?|picks?|bets?|slip|special)$/i.test(raw))return false;
  if(['mlb','baseball','major league baseball','sportsbook','parlay','bet slip','betslip'].includes(key))return false;
  const words=raw.replace(/[^A-Za-z'’.-]+/g,' ').trim().split(/\s+/).filter(Boolean);
  return words.length>=1&&words.length<=6&&words.some(word=>/[A-Za-z]{2}/.test(word));
}
function canonicalMarket(value){const raw=String(value||'').trim();return MLB_ALIASES[raw]||raw;}
function sanitizeMlbLeg(raw){
  if(!raw||typeof raw!=='object')return null;
  const sport=String(raw.sport||'').toUpperCase().replace(/[^A-Z]/g,'');if(sport!=='MLB')return null;
  const player=clean(raw.player),market=canonicalMarket(raw.market);if(!likelyPlayerName(player)||!/^[A-Za-z][A-Za-z0-9_]{1,63}$/.test(market))return null;
  const binary=MLB_BINARY.has(market)||((raw.line==null)&&['yes','no'].includes(String(raw.side||'').toLowerCase()));
  const side=String(raw.side||(binary?'yes':'over')).toLowerCase();if(!['over','under','yes','no'].includes(side))return null;
  const line=raw.line==null?null:Number(raw.line);if(!binary&&!Number.isFinite(line))return null;
  return {sport:'MLB',player,team:raw.team?String(raw.team).trim().toUpperCase():null,market,
    side:binary?(side==='no'?'no':'yes'):(side==='under'?'under':'over'),line:binary?null:line,inclusive:binary?true:Boolean(raw.inclusive),
    originalText:String(raw.originalText||'').trim().slice(0,240)};
}
function canonicalizeMlbLeg(raw){return sanitizeMlbLeg({...raw,sport:'MLB',market:canonicalMarket(raw?.market)});}
function hasMlbContext(text){
  return /\b(mlb|major league baseball|baseball|home run|homer|total bases?|stolen bases?|rbi|pitcher strikeouts?|pitching outs?|outs recorded|hits allowed|earned runs?|walks allowed|home runs allowed|extra base hits?)\b/i.test(String(text||''));
}
function numericLeg(line,re,market){
  const match=line.match(re);if(!match)return null;
  const number=line.match(/(?:over|under|\bo\b|\bu\b)?\s*(\d+(?:\.\d+)?)\s*\+?/i);if(!number)return null;
  const cut=Math.min(match.index??line.length,number.index??line.length);
  const player=clean(line.slice(0,cut).replace(/[-–—:]\s*$/,''));if(!likelyPlayerName(player))return null;
  return sanitizeMlbLeg({sport:'MLB',player,market,side:/\bunder\b|\bu\s*\d/i.test(line)?'under':'over',line:Number(number[1]),inclusive:/\d+(?:\.\d+)?\s*\+/.test(line),originalText:line});
}
function mlbHeuristic(text){
  if(!hasMlbContext(text))return [];
  const lines=String(text||'').split(/\n|\r|;|\s+\|\s+/).map(s=>s.trim()).filter(Boolean),out=[];
  const words=[
    [/hits?\s*\+\s*runs?\s*\+\s*rbi(?:s)?|hits?\s+runs?\s+rbi(?:s)?/i,'hrr'],
    [/hits?\s*\+\s*runs?/i,'hitsRuns'],[/hits?\s*\+\s*rbi(?:s)?/i,'hitsRbi'],[/runs?\s*\+\s*rbi(?:s)?/i,'runsRbi'],
    [/total\s+bases?/i,'totalBases'],[/stolen\s+bases?/i,'stolenBases'],[/extra[-\s]?base\s+hits?|\bxbh\b/i,'extraBaseHits'],
    [/pitcher\s+strikeouts?|pitching\s+strikeouts?|strikeouts?\s+(?:thrown|recorded)/i,'pitcherStrikeouts'],
    [/pitching\s+outs?|outs?\s+recorded/i,'pitchingOuts'],[/hits?\s+allowed/i,'hitsAllowed'],[/earned\s+runs?\s+allowed|earned\s+runs?/i,'earnedRuns'],
    [/walks?\s+allowed|bases?\s+on\s+balls?\s+allowed/i,'walksAllowed'],[/home\s+runs?\s+allowed/i,'homeRunsAllowed'],
    [/batter\s+strikeouts?|batting\s+strikeouts?/i,'batterStrikeouts'],[/\bsingles?\b/i,'singles'],[/\bdoubles?\b/i,'doubles'],[/\btriples?\b/i,'triples'],
    [/\bwalks?\b|bases?\s+on\s+balls?/i,'walks'],[/runs?\s+batted\s+in|\brbi(?:s)?\b/i,'rbi'],[/\bruns?\b/i,'runs'],[/\bhits?\b/i,'hits']
  ];
  for(const line of lines){
    let m=line.match(/^(.{2,90}?)(?:\s+[-–—:]?\s*)(?:to\s+(?:hit|record)\s+(?:a\s+)?home\s+run|(?:anytime\s+)?home\s+run|to\s+homer|homer)\b/i);
    if(m){const leg=sanitizeMlbLeg({sport:'MLB',player:m[1],market:'homeRun',side:'yes',line:null,inclusive:true,originalText:line});if(leg){out.push(leg);continue;}}
    m=line.match(/^(.{2,90}?)(?:\s+[-–—:]?\s*)(?:pitcher\s+to\s+(?:record|get)\s+(?:a\s+)?win|to\s+record\s+(?:a\s+)?pitcher\s+win|pitcher\s+win)\b/i);
    if(m){const leg=sanitizeMlbLeg({sport:'MLB',player:m[1],market:'pitcherWin',side:'yes',line:null,inclusive:true,originalText:line});if(leg){out.push(leg);continue;}}
    for(const [re,market] of words){if(!re.test(line))continue;const leg=numericLeg(line,re,market);if(leg)out.push(leg);break;}
  }
  return out;
}
function responseText(payload){if(typeof payload?.output_text==='string')return payload.output_text;for(const item of payload?.output||[])for(const c of item?.content||[])if(typeof c?.text==='string')return c.text;return '';}
async function supplementalMlbVision({text,mediaUrls}){
  if(!process.env.OPENAI_API_KEY||!mediaUrls?.length)return [];
  const instructions='Extract every explicit MLB player prop visible in the post or sportsbook screenshot. Do not emit slip titles, section headers, promo names, links, or league labels such as MLB HIT MEGA as player legs. Do not omit a valid MLB leg merely because a model probability may be unavailable. Canonical markets: home run=homeRun (yes/no binary); hits=hits; total bases=totalBases; RBI=rbi; hits+runs+RBI=hrr; stolen bases=stolenBases; runs=runs; singles=singles; doubles=doubles; triples=triples; walks/bases on balls=walks; batter strikeouts=batterStrikeouts; hits+runs=hitsRuns; hits+RBI=hitsRbi; runs+RBI=runsRbi; extra-base hits=extraBaseHits; pitcher strikeouts=pitcherStrikeouts; pitching outs/outs recorded=pitchingOuts; hits allowed=hitsAllowed; earned runs=earnedRuns; walks allowed=walksAllowed; home runs allowed=homeRunsAllowed; pitcher to record a win=pitcherWin (yes/no binary). If an explicit MLB player prop falls outside this list, preserve the market using a concise camelCase key instead of dropping the leg. Preserve visible player, team, line, side and original wording. Never invent a leg from a matchup, title, or URL alone. Omit only content that is genuinely unreadable or not a player prop.';
  const content=[{type:'input_text',text:`${instructions}\n\nPost text: ${String(text||'').slice(0,3000)}`}];
  for(const url of mediaUrls.slice(0,4))content.push({type:'input_image',image_url:url,detail:'high'});
  const schema={type:'object',additionalProperties:false,properties:{legs:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,properties:{sport:{type:'string',enum:['MLB']},player:{type:'string'},team:{type:['string','null']},market:{type:'string'},side:{type:'string',enum:['over','under','yes','no']},line:{type:['number','null']},inclusive:{type:'boolean'},originalText:{type:'string'}},required:['sport','player','team','market','side','line','inclusive','originalText']}}},required:['legs']};
  const signal=typeof AbortSignal==='function'&&typeof AbortSignal.timeout==='function'?AbortSignal.timeout(legacy.openAiTimeoutMs()):undefined;
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${process.env.OPENAI_API_KEY}`},signal,body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5.6-luna',store:false,reasoning:{effort:'none'},max_output_tokens:1800,input:[{role:'user',content}],text:{format:{type:'json_schema',name:'parlayping_mlb_slip',strict:true,schema}}})});
  const payload=await response.json();if(!response.ok)throw new Error(payload?.error?.message||`MLB supplemental vision parse failed (${response.status})`);
  const raw=responseText(payload);if(!raw)return [];
  return (JSON.parse(raw)?.legs||[]).map(canonicalizeMlbLeg).filter(Boolean);
}

module.exports={MLB_MARKETS,MLB_BINARY,canonicalizeMlbLeg,sanitizeMlbLeg,likelyPlayerName,hasMlbContext,mlbHeuristic,supplementalMlbVision};
