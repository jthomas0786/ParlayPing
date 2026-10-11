'use strict';
// Signed-in TSO users can build a Parlay Ping share slip from exact TSO prop
// selection KEYS. Never take price, model probability or sportsbook links
// from the browser. Re-fetch the current official TSO prop data server-side.
const {requireHostUser}=require('./lib/tso-auth');
const {encodeShareSlip,MAX_SHARE_LEGS}=require('./lib/share-slip');
const TSO_PROPS_URL='https://thesportsoutpost.com/api/props?league=all';
const MAX_LEGS=MAX_SHARE_LEGS;
const MAX_RESPONSE_BYTES=9_000_000;
const clean=(v,n=130)=>String(v==null?'':v).trim().replace(/\s+/g,' ').slice(0,n);
const finite=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
function selectionKeys(body){
  const raw=body?.selectionKeys;
  if(!Array.isArray(raw)||raw.length<1||raw.length>MAX_LEGS)throw Object.assign(new Error('Select 1–'+MAX_LEGS+' TSO props to build a betslip.'),{status:400});
  const keys=raw.map(x=>clean(x,220));
  if(keys.some(x=>!x||x.length>200)||new Set(keys).size!==keys.length)
    throw Object.assign(new Error('Selections must have unique, valid TSO prop IDs.'),{status:400});
  return keys;
}
async function liveRows(){
  const response=await fetch(TSO_PROPS_URL,{headers:{accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Object.assign(new Error('The TSO live prop feed is temporarily unavailable. Try again shortly.'),{status:503});
  const body=await response.text();
  if(body.length>MAX_RESPONSE_BYTES)throw Object.assign(new Error('The current TSO prop feed exceeded its size limit.'),{status:503});
  let parsed;try{parsed=JSON.parse(body)}catch{throw Object.assign(new Error('The TSO live prop feed did not return valid JSON.'),{status:503});}
  if(!Array.isArray(parsed?.rows))throw Object.assign(new Error('The TSO prop feed does not contain exact selections.'),{status:503});
  return parsed.rows;
}
function modelChance(row){
  const model=row?.model||{};
  const value=finite(model.probabilityPct);
  if(value===null||value<=0||value>=100||String(model.phase||'pregame').toLowerCase()==='live')return null;
  // Match the TSO public model guardrail instead of reintroducing rejected
  // NFL simulator extremes or a non-comparable market-derived percentage.
  if(String(row?.sport||'').toLowerCase()==='nfl'){
    const implied=finite(row.impliedPct);
    if(value<=0.05||value>=99.95||(implied!==null&&Math.abs(value-implied)>35))return null;
  }
  return Number((value/100).toFixed(6));
}
function exactOffers(row){
  const offers={};
  const rows=Array.isArray(row?.books)?row.books:[];
  for(const book of rows.slice(0,24)){
    const name=clean(book?.book,80),price=finite(book?.price);
    if(!name||price===null||price===0||Math.abs(price)>100000)continue;
    const offer={oddsAmerican:price};
    // Selection deep-links, when present, must belong to the exact snapshot.
    const link=clean(book?.selectionLink||book?.deepLink,1200);
    if(link){try{const u=new URL(link);if(u.protocol==='https:')offer.selectionLink=u.toString()}catch{}}
    offers[name]=offer;
    if(Object.keys(offers).length>=16)break;
  }
  return offers;
}
function toLeg(row){
  const sport=clean(row.sport,20).toUpperCase(),player=clean(row.player,120),market=clean(row.market,100);
  if(!['NFL','NHL','NBA','MLB'].includes(sport)||!player||!market)throw Object.assign(new Error('A selection in your draft cannot be verified as a supported TSO player prop.'),{status:422});
  const side=clean(row.side,16).toLowerCase(),line=finite(row.line), price=finite(row.price);
  if(!['over','under','yes','no'].includes(side)&&!['atd','atg','fgs','hr'].includes(market.toLowerCase()))
    throw Object.assign(new Error('A selected TSO prop does not identify its exact side.'),{status:422});
  if(line===null&&!['atd','atg','fgs','hr'].includes(market.toLowerCase()))
    throw Object.assign(new Error('A selected TSO prop is missing its exact line.'),{status:422});
  const matchup=[clean(row.awayTeam,24),clean(row.homeTeam,24)].filter(Boolean).join(' @ ');
  const offers=exactOffers(row);
  if(price!==null&&price!==0&&Math.abs(price)<=100000&&row.book){
    const name=clean(row.book,80);
    if(!offers[name])offers[name]={oddsAmerican:price};
  }
  const starts=clean(row.startTimeUTC||row.startTime||row.commenceTime||row.gameTime,80);
  const date=Date.parse(starts);
  const chance=modelChance(row);
  return {
    id:clean(row.key,80),sport,player,playerId:clean(row.playerId,100),
    team:clean(row.team,32),playerImageUrl:clean(row.headshotUrl,1200),
    gameId:clean(row.eventId,120),matchup,
    market,displayMarket:clean(row.marketLabel,120),
    side:side||(['atd','atg','fgs','hr'].includes(market.toLowerCase())?'yes':null),
    line,oddsAmerican:price!==null&&price!==0&&Math.abs(price)<=100000?price:null,
    sportsbook:clean(row.book,80)||null,bookOffers:offers,
    pregameProbability:chance,probabilitySource:chance!==null?'tso_verified_pregame_model':null,
    status:'PENDING',startTimeUTC:Number.isFinite(date)?new Date(date).toISOString():null
  };
}
function assemble(keys,rows){
  const lookup=new Map();
  for(const row of rows){const key=String(row?.key||'');if(!key)continue;if(lookup.has(key))lookup.set(key,null);else lookup.set(key,row);}
  const selected=keys.map(key=>lookup.get(key));
  if(selected.some(row=>!row))throw Object.assign(new Error('A selected prop is no longer available as an exact TSO quote. Refresh Props and try again.'),{status:409});
  return {source:'The Sports Outpost exact prop selections',sourceReference:'TSO live props',
    combinedOddsAmerican:null,combinedOddsVerified:false,legs:selected.map(toLeg)};
}
async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST required.'});
  try{
    const {identityProvider}=await requireHostUser(req);
    if(identityProvider!=='tso2')return res.status(403).json({ok:false,error:'A signed-in TSO account is required.'});
    const keys=selectionKeys(req.body);
    const slip=assemble(keys,await liveRows());
    const token=encodeShareSlip(slip);
    return res.status(200).json({ok:true,path:'/build/'+encodeURIComponent(token)+'?tso_embed=1',legCount:slip.legs.length});
  }catch(error){
    const status=Number(error?.status)||500;
    console.error('TSO prop-to-slip build',{status,message:String(error?.message||'').slice(0,180)});
    return res.status(status).json({ok:false,error:status===500?'Could not build the betslip. Please try again.':error.message});
  }
}
module.exports=handler;
module.exports.selectionKeys=selectionKeys;
module.exports.assemble=assemble;
module.exports.toLeg=toLeg;
module.exports.modelChance=modelChance;
