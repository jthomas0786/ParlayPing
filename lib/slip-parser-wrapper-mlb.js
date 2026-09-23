const base=require('./slip-parser-wrapper-base');
const mlb=require('./mlb-parser-extension');

function key(value){return String(value||'').toLowerCase().normalize('NFKD').replace(/[.'’]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
function numeric(value){const n=Number(value);return Number.isFinite(n)?n:null;}
function semanticTarget(leg){
  if(mlb.MLB_BINARY.has(leg?.market))return 'binary';
  const line=numeric(leg?.line);if(line==null)return 'none';
  const side=String(leg?.side||'over').toLowerCase();
  if(side==='under')return `under:${line}`;
  if(leg?.inclusive)return `over:${line}`;
  return `over:${Number.isInteger(line)?line+1:Math.floor(line)+1}`;
}
function semanticId(leg){return [String(leg?.sport||'').toUpperCase(),key(leg?.player),key(leg?.team),leg?.market,String(leg?.side||''),semanticTarget(leg)].join('|');}
function quality(leg){
  let score=0;
  const line=numeric(leg?.line);
  if(leg?.team)score+=3;
  if(leg?.originalText&&key(leg.originalText).includes(key(leg.player)))score+=2;
  if(line!=null)score+=1;
  if(line!=null&&!Number.isInteger(line)&&!leg?.inclusive)score+=4;
  if(leg?.inclusive)score+=0.25;
  return score;
}
function mergeLegs(primary,secondary){
  const candidates=[...primary,...secondary].filter(Boolean),bySemantic=new Map(),order=[],seenPhrases=new Set();
  for(const leg of candidates){
    const player=key(leg.player),phrase=key(leg.originalText),sport=String(leg.sport||'').toUpperCase();
    const phraseId=phrase?`${sport}|${player}|${phrase}`:'';
    if(!player)continue;
    if(phraseId&&seenPhrases.has(phraseId))continue;
    const id=semanticId(leg);if(!id)continue;
    const existing=bySemantic.get(id);
    if(!existing){bySemantic.set(id,leg);order.push(id);if(phraseId)seenPhrases.add(phraseId);continue;}
    if(quality(leg)>quality(existing))bySemantic.set(id,leg);
    if(phraseId)seenPhrases.add(phraseId);
  }
  return order.slice(0,20).map(id=>bySemantic.get(id));
}
function normalizeMlbRows(rows){
  return (rows||[]).map(leg=>String(leg?.sport||'').toUpperCase()==='MLB'?(mlb.canonicalizeMlbLeg(leg)||null):leg).filter(Boolean);
}
async function parseSlip(input={}){
  const text=String(input.text||'');
  const mediaUrls=Array.isArray(input.mediaUrls)?input.mediaUrls:[];
  const parsed=await base.parseSlip(input);
  const normalized=normalizeMlbRows(parsed.legs||[]);
  const heuristic=mlb.mlbHeuristic(text);
  let supplemental=[];
  const hasMlbSignal=normalized.some(leg=>String(leg?.sport||'').toUpperCase()==='MLB')||mlb.hasMlbContext(text);
  if(mediaUrls.length&&!parsed.visionError&&hasMlbSignal){
    try{supplemental=await mlb.supplementalMlbVision({text,mediaUrls});}
    catch(error){console.error('ParlayPing MLB vision supplement',error?.message||error);}
  }
  const legs=mergeLegs([...supplemental,...heuristic],normalized);
  const sports=[...new Set(legs.map(leg=>leg.sport).filter(Boolean))];
  return {...parsed,legs,sports,sport:sports.length===1?sports[0]:sports.length?'MIXED':null,mlbParser:Boolean(heuristic.length||supplemental.length||normalized.some(leg=>leg.sport==='MLB'))};
}

module.exports={...base,parseSlip,mergeMlbLegs:mergeLegs,normalizeMlbRows,semanticMlbLegId:semanticId,semanticMlbTarget:semanticTarget};
