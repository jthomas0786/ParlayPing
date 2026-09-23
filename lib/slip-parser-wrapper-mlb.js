const base=require('./slip-parser-wrapper-base');
const mlb=require('./mlb-parser-extension');

function key(value){return String(value||'').toLowerCase().normalize('NFKD').replace(/[.'’]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
function mergeLegs(primary,secondary){
  const out=[],seen=new Set(),phrases=new Set();
  for(const leg of [...primary,...secondary]){
    if(!leg)continue;
    const phrase=key(leg.originalText);
    const id=[String(leg.sport||'').toUpperCase(),key(leg.player),leg.market,leg.side,leg.line??'null',leg.inclusive?'1':'0'].join('|');
    if(seen.has(id))continue;
    if(phrase&&phrases.has(`${key(leg.player)}|${phrase}`))continue;
    seen.add(id);if(phrase)phrases.add(`${key(leg.player)}|${phrase}`);out.push(leg);if(out.length>=20)break;
  }
  return out;
}
function normalizeMlbRows(rows){
  return (rows||[]).map(leg=>String(leg?.sport||'').toUpperCase()==='MLB'?(mlb.canonicalizeMlbLeg(leg)||leg):leg).filter(Boolean);
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

module.exports={...base,parseSlip,mergeMlbLegs:mergeLegs,normalizeMlbRows};
