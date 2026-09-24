const base=require('./slip-parser-wrapper-base');
const mlb=require('./mlb-parser-extension');

function stripInvisible(value){return String(value||'').replace(/[\u200B-\u200D\u2060\uFEFF]/g,'');}
function key(value){return stripInvisible(value).toLowerCase().normalize('NFKD').replace(/[.'’]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
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
function selectionSignature(leg){return [String(leg?.sport||'').toUpperCase(),key(leg?.team),leg?.market,String(leg?.side||''),semanticTarget(leg)].join('|');}
function editDistance(a,b){
  const x=key(a),y=key(b);if(x===y)return 0;if(!x||!y)return Math.max(x.length,y.length);
  let prev=Array.from({length:y.length+1},(_,i)=>i);
  for(let i=1;i<=x.length;i++){
    const next=[i];
    for(let j=1;j<=y.length;j++)next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(x[i-1]===y[j-1]?0:1));
    prev=next;
  }
  return prev[y.length];
}
function nearPlayerIdentity(a,b){
  const x=key(a).split(' ').filter(Boolean),y=key(b).split(' ').filter(Boolean);if(x.length<2||y.length<2)return false;
  const xLast=x[x.length-1],yLast=y[y.length-1],xFirst=x[0],yFirst=y[0];
  if(xLast!==yLast||xFirst[0]!==yFirst[0])return false;
  if(xFirst.slice(0,5)!==yFirst.slice(0,5))return false;
  return editDistance(a,b)<=2;
}
function cleanLeg(leg){
  if(!leg||typeof leg!=='object')return leg;
  return {...leg,player:stripInvisible(leg.player).replace(/\s+/g,' ').trim(),originalText:stripInvisible(leg.originalText)};
}
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
function preferLeg(next,current){
  const a=quality(next),b=quality(current);if(a!==b)return a>b;
  const nextName=key(next?.player),currentName=key(current?.player);
  if(nextName.length!==currentName.length)return nextName.length<currentName.length;
  return false;
}
function mergeLegs(primary,secondary){
  const candidates=[...primary,...secondary].filter(Boolean).map(cleanLeg),bySemantic=new Map(),order=[],seenPhrases=new Set();
  for(const leg of candidates){
    const player=key(leg.player),phrase=key(leg.originalText),sport=String(leg.sport||'').toUpperCase();
    const phraseId=phrase?`${sport}|${player}|${phrase}`:'';
    if(!player)continue;
    if(phraseId&&seenPhrases.has(phraseId))continue;
    const id=semanticId(leg);if(!id)continue;
    let matchId=bySemantic.has(id)?id:null;
    if(!matchId){
      const signature=selectionSignature(leg);
      matchId=order.find(existingId=>{
        const existing=bySemantic.get(existingId);
        return existing&&selectionSignature(existing)===signature&&nearPlayerIdentity(existing.player,leg.player);
      })||null;
    }
    if(!matchId){bySemantic.set(id,leg);order.push(id);if(phraseId)seenPhrases.add(phraseId);continue;}
    const existing=bySemantic.get(matchId);
    if(preferLeg(leg,existing))bySemantic.set(matchId,leg);
    if(phraseId)seenPhrases.add(phraseId);
  }
  return order.slice(0,20).map(id=>bySemantic.get(id));
}
function normalizeMlbRows(rows){
  return (rows||[]).map(cleanLeg).map(leg=>String(leg?.sport||'').toUpperCase()==='MLB'?(mlb.canonicalizeMlbLeg(leg)||null):leg).filter(Boolean);
}
async function parseSlip(input={}){
  const text=stripInvisible(input.text||'');
  const mediaUrls=Array.isArray(input.mediaUrls)?input.mediaUrls:[];
  const parsed=await base.parseSlip({...input,text});
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

module.exports={...base,parseSlip,mergeMlbLegs:mergeLegs,normalizeMlbRows,semanticMlbLegId:semanticId,semanticMlbTarget:semanticTarget,stripInvisibleMlbText:stripInvisible,nearMlbPlayerIdentity:nearPlayerIdentity,mlbEditDistance:editDistance};
