const legacy=require('../api/lib/slip-parser');

const EXTENDED_SPORTS=new Set(['SOCCER','TENNIS','MMA','ESPORTS','TABLE_TENNIS']);
const EXTENDED_BINARY=new Set(['anytimeGoal','toReceiveCard','matchWinner','fightWinner']);
const EXTENDED_MARKETS={
  SOCCER:new Set(['shots','shotsOnTarget','assists','goalsAssists','fouls','goals','anytimeGoal','toReceiveCard','saves']),
  TENNIS:new Set(['gamesWon','gamesPlayed','setsWon','setsPlayed','aces','doubleFaults','breakPointsWon','tiebreaksPlayed','firstSetAces','matchWinner']),
  MMA:new Set(['fightWinner']),
  ESPORTS:new Set(['matchWinner','killsMaps12','killsMaps123','killsMaps13','map1Kills','map3Kills','map4Kills','map5Kills','headshotsMaps12','map3Headshots','firstBloodsMaps12','points','assists']),
  TABLE_TENNIS:new Set(['matchWinner'])
};

function clean(value){return String(value||'').replace(/^[-•✅☑️🔥🔒\s]+/,'').replace(/\s+/g,' ').trim();}
function key(value){return String(value||'').toLowerCase().normalize('NFKD').replace(/[.'’]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
function normalizeSport(value){
  const raw=String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const aliases={UFC:'MMA',MIXEDMARTIALARTS:'MMA',TABLETENNIS:'TABLE_TENNIS',PINGPONG:'TABLE_TENNIS',EPL:'SOCCER',PREMIERLEAGUE:'SOCCER',MLS:'SOCCER',LALIGA:'SOCCER',SERIEA:'SOCCER',BUNDESLIGA:'SOCCER',LIGUE1:'SOCCER',CS2:'ESPORTS',COUNTERSTRIKE:'ESPORTS',COUNTERSTRIKE2:'ESPORTS',VALORANT:'ESPORTS',LEAGUEOFLEGENDS:'ESPORTS',LOL:'ESPORTS',DOTA:'ESPORTS',DOTA2:'ESPORTS'};
  return aliases[raw]||raw;
}
function contextSport(text){
  const value=String(text||'');
  if(/\b(table\s+tennis|ping[-\s]?pong)\b/i.test(value))return 'TABLE_TENNIS';
  if(/\b(ufc|mma|mixed\s+martial\s+arts)\b/i.test(value))return 'MMA';
  if(/\b(esports?|cs2|counter[-\s]?strike|valorant|league\s+of\s+legends|\blol\b|dota\s*2?)\b/i.test(value))return 'ESPORTS';
  if(/\b(tennis|atp|wta|grand\s+slam|wimbledon|us\s+open|french\s+open|australian\s+open)\b/i.test(value))return 'TENNIS';
  if(/\b(soccer|football\s+club|premier\s+league|\bepl\b|\bmls\b|la\s+liga|serie\s+a|bundesliga|ligue\s*1|champions\s+league)\b/i.test(value))return 'SOCCER';
  return null;
}
function sanitizeExtended(raw){
  if(!raw||typeof raw!=='object')return null;
  const sport=normalizeSport(raw.sport);if(!EXTENDED_SPORTS.has(sport))return null;
  const player=clean(raw.player);const market=String(raw.market||'').trim();
  if(!player||!EXTENDED_MARKETS[sport]?.has(market))return null;
  const binary=EXTENDED_BINARY.has(market);
  const side=String(raw.side||(binary?'yes':'over')).toLowerCase();if(!['over','under','yes','no'].includes(side))return null;
  const line=raw.line==null?null:Number(raw.line);if(!binary&&!Number.isFinite(line))return null;
  return {sport,player,team:raw.team?String(raw.team).trim().toUpperCase():null,market,side:binary?(side==='no'?'no':'yes'):(side==='under'?'under':'over'),line:binary?null:line,inclusive:binary?true:Boolean(raw.inclusive),originalText:String(raw.originalText||'').trim().slice(0,240)};
}
function canonicalizeLeg(raw){
  const sport=normalizeSport(raw?.sport);
  if(!EXTENDED_SPORTS.has(sport))return raw;
  let market=String(raw?.market||'').trim();
  const aliases={
    SOCCER:{shotsOnGoal:'shotsOnTarget',sot:'shotsOnTarget',goalScorer:'anytimeGoal',anytimeGoalScorer:'anytimeGoal',card:'toReceiveCard',receiveCard:'toReceiveCard'},
    TENNIS:{games:'gamesPlayed',totalGames:'gamesPlayed',gameWins:'gamesWon',sets:'setsPlayed',setWins:'setsWon',doubleFault:'doubleFaults',breakPoints:'breakPointsWon',winner:'matchWinner',moneyline:'matchWinner'},
    MMA:{winner:'fightWinner',moneyline:'fightWinner',matchWinner:'fightWinner'},
    ESPORTS:{winner:'matchWinner',moneyline:'matchWinner',ml:'matchWinner',kills:'killsMaps12',headshots:'headshotsMaps12',firstBloods:'firstBloodsMaps12'},
    TABLE_TENNIS:{winner:'matchWinner',moneyline:'matchWinner'}
  };
  market=aliases[sport]?.[market]||market;
  return sanitizeExtended({...raw,sport,market});
}
function numeric(line,re,market,sport){
  const match=line.match(re);if(!match)return null;
  const valueMatch=line.match(/(?:over|under|\bo\b|\bu\b)?\s*(\d+(?:\.\d+)?)\s*\+?/i);if(!valueMatch)return null;
  const marketIndex=match.index??line.length,numberIndex=valueMatch.index??line.length;
  const cut=Math.min(marketIndex,numberIndex);let player=clean(line.slice(0,cut).replace(/[-–—:]\s*$/,''));
  if(!player||player.length<2)return null;
  return sanitizeExtended({sport,player,market,side:/\bunder\b|\bu\s*\d/i.test(line)?'under':'over',line:Number(valueMatch[1]),inclusive:/\d+(?:\.\d+)?\s*\+/.test(line),originalText:line});
}
function extendedHeuristic(text){
  const sport=contextSport(text);if(!sport)return [];
  const lines=String(text||'').split(/\n|\r|;|\s+\|\s+/).map(s=>s.trim()).filter(Boolean),out=[];
  const words={
    SOCCER:[[/shots?\s+on\s+target|\bsot\b/i,'shotsOnTarget'],[/\bshots?\b/i,'shots'],[/goals?\s*\+\s*assists?|goal\s+contributions?/i,'goalsAssists'],[/\bassists?\b/i,'assists'],[/\bfouls?\b/i,'fouls'],[/\bsaves?\b/i,'saves'],[/\bgoals?\b/i,'goals']],
    TENNIS:[[/first\s+set\s+aces?|1st\s+set\s+aces?/i,'firstSetAces'],[/double\s+faults?/i,'doubleFaults'],[/break\s+points?\s+won/i,'breakPointsWon'],[/tiebreak(?:er)?s?\s+played|tiebreaks?/i,'tiebreaksPlayed'],[/games?\s+won/i,'gamesWon'],[/games?\s+played|total\s+games?/i,'gamesPlayed'],[/sets?\s+won/i,'setsWon'],[/sets?\s+played|total\s+sets?/i,'setsPlayed'],[/\baces?\b/i,'aces']],
    ESPORTS:[[/kills?\s+(?:on\s+)?maps?\s*1\s*[-+]\s*2\s*[-+]\s*3/i,'killsMaps123'],[/kills?\s+(?:on\s+)?maps?\s*1\s*[-+]\s*3/i,'killsMaps13'],[/kills?\s+(?:on\s+)?maps?\s*1\s*[-+]\s*2/i,'killsMaps12'],[/map\s*1\s+kills?/i,'map1Kills'],[/map\s*3\s+kills?/i,'map3Kills'],[/map\s*4\s+kills?/i,'map4Kills'],[/map\s*5\s+kills?/i,'map5Kills'],[/headshots?\s+(?:on\s+)?maps?\s*1\s*[-+]\s*2/i,'headshotsMaps12'],[/map\s*3\s+headshots?/i,'map3Headshots'],[/first\s+bloods?\s+(?:on\s+)?maps?\s*1\s*[-+]\s*2/i,'firstBloodsMaps12'],[/\bpoints?\b/i,'points'],[/\bassists?\b/i,'assists']]
  };
  for(const line of lines){
    if(sport==='SOCCER'){
      let m=line.match(/^(.{2,80}?)(?:\s+[-–—:]?\s*)(?:anytime\s+(?:goal|goalscorer|goal\s+scorer)|to\s+score(?:\s+a\s+goal)?)\b/i);
      if(m){const leg=sanitizeExtended({sport,player:m[1],market:'anytimeGoal',side:'yes',line:null,inclusive:true,originalText:line});if(leg){out.push(leg);continue;}}
      m=line.match(/^(.{2,80}?)(?:\s+[-–—:]?\s*)(?:to\s+(?:receive|get)\s+(?:a\s+)?card|booked|to\s+be\s+carded)\b/i);
      if(m){const leg=sanitizeExtended({sport,player:m[1],market:'toReceiveCard',side:'yes',line:null,inclusive:true,originalText:line});if(leg){out.push(leg);continue;}}
    }
    if(['TENNIS','TABLE_TENNIS'].includes(sport)){
      const m=line.match(/^(.{2,80}?)(?:\s+[-–—:]?\s*)(?:to\s+win(?:\s+the)?\s+match|match\s+winner|moneyline|\bml\b)/i);
      if(m){const leg=sanitizeExtended({sport,player:m[1],market:'matchWinner',side:'yes',line:null,inclusive:true,originalText:line});if(leg){out.push(leg);continue;}}
    }
    if(sport==='MMA'){
      const m=line.match(/^(.{2,80}?)(?:\s+[-–—:]?\s*)(?:to\s+win(?:\s+the)?\s+fight|fight\s+winner|moneyline|\bml\b)/i);
      if(m){const leg=sanitizeExtended({sport,player:m[1],market:'fightWinner',side:'yes',line:null,inclusive:true,originalText:line});if(leg){out.push(leg);continue;}}
    }
    if(sport==='ESPORTS'){
      const m=line.match(/^(.{2,80}?)(?:\s+[-–—:]?\s*)(?:to\s+win(?:\s+the)?\s+(?:match|series)|match\s+winner|series\s+winner|moneyline|\bml\b)/i);
      if(m){const leg=sanitizeExtended({sport,player:m[1],market:'matchWinner',side:'yes',line:null,inclusive:true,originalText:line});if(leg){out.push(leg);continue;}}
    }
    for(const [re,market] of words[sport]||[]){if(!re.test(line))continue;const leg=numeric(line,re,market,sport);if(leg)out.push(leg);break;}
  }
  return out;
}
function mergeLegs(primary,secondary){
  const out=[],seen=new Set(),phrases=new Set();
  for(const leg of [...primary,...secondary]){
    if(!leg)continue;
    const phrase=key(leg.originalText);const id=[leg.sport,key(leg.player),leg.market,leg.side,leg.line??'null',leg.inclusive?'1':'0'].join('|');
    if(seen.has(id))continue;
    if(phrases.has(`${key(leg.player)}|${phrase}`))continue;
    seen.add(id);if(phrase)phrases.add(`${key(leg.player)}|${phrase}`);out.push(leg);if(out.length>=20)break;
  }
  return out;
}
function responseText(payload){if(typeof payload?.output_text==='string')return payload.output_text;for(const item of payload?.output||[])for(const c of item?.content||[])if(typeof c?.text==='string')return c.text;return '';}
async function supplementalVision({text,mediaUrls}){
  if(!process.env.OPENAI_API_KEY||!mediaUrls?.length)return [];
  const content=[{type:'input_text',text:`Extract only explicit player/fighter props for SOCCER, TENNIS, MMA, ESPORTS, or TABLE_TENNIS, plus ESPORTS team match-winner selections. Use exact canonical markets: SOCCER shots, shotsOnTarget, assists, goalsAssists, fouls, goals, anytimeGoal, toReceiveCard, saves; TENNIS gamesWon, gamesPlayed, setsWon, setsPlayed, aces, doubleFaults, breakPointsWon, tiebreaksPlayed, firstSetAces, matchWinner; MMA fightWinner; ESPORTS matchWinner, killsMaps12, killsMaps123, killsMaps13, map1Kills, map3Kills, map4Kills, map5Kills, headshotsMaps12, map3Headshots, firstBloodsMaps12, points, assists; TABLE_TENNIS matchWinner. Winner markets are binary yes with null line. For ESPORTS only, a team moneyline/match winner is allowed and the team name belongs in player. Do not treat team/game moneylines in other sports as player props. Omit uncertain legs. Post text: ${String(text||'').slice(0,3000)}` }];
  for(const url of mediaUrls.slice(0,4))content.push({type:'input_image',image_url:url,detail:'high'});
  const schema={type:'object',additionalProperties:false,properties:{legs:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,properties:{sport:{type:'string',enum:['SOCCER','TENNIS','MMA','ESPORTS','TABLE_TENNIS','OTHER']},player:{type:'string'},team:{type:['string','null']},market:{type:'string'},side:{type:'string',enum:['over','under','yes','no']},line:{type:['number','null']},inclusive:{type:'boolean'},originalText:{type:'string'}},required:['sport','player','team','market','side','line','inclusive','originalText']}}},required:['legs']};
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5.6-luna',store:false,reasoning:{effort:'none'},max_output_tokens:1800,input:[{role:'user',content}],text:{format:{type:'json_schema',name:'parlayping_extended_slip',strict:true,schema}}})});
  const payload=await response.json();if(!response.ok)throw new Error(payload?.error?.message||`Extended vision parse failed (${response.status})`);
  const raw=responseText(payload);if(!raw)return [];
  return (JSON.parse(raw)?.legs||[]).map(canonicalizeLeg).filter(Boolean);
}
async function parseSlip(input={}){
  const text=String(input.text||''),mediaUrls=legacy.normalizeMediaUrls(input.mediaUrls||[]);
  const base=await legacy.parseSlip({text,mediaUrls});
  const normalized=(base.legs||[]).map(leg=>canonicalizeLeg(leg)||leg);
  const heur=extendedHeuristic(text);
  let supplemental=[];
  const needsExtendedVision=mediaUrls.length&&(!normalized.length||normalized.some(leg=>leg.sport==='OTHER'));
  if(needsExtendedVision){try{supplemental=await supplementalVision({text,mediaUrls});}catch(error){console.error('ParlayPing extended vision fallback',error?.message||error);}}
  const legs=mergeLegs([...supplemental,...heur],normalized);
  const sports=[...new Set(legs.map(l=>l.sport))];
  return {...base,legs,sports,sport:sports.length===1?sports[0]:sports.length?'MIXED':null,extendedParser:Boolean(heur.length||supplemental.length)};
}

module.exports={parseSlip,extendedHeuristic,canonicalizeLeg,sanitizeExtended,normalizeSport,EXTENDED_SPORTS,EXTENDED_MARKETS,EXTENDED_BINARY};
