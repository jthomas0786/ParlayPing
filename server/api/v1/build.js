const crypto=require('crypto');
const {analyzeMultiSport}=require('../lib/sport-router');
const {extractApiKey,apiAuth}=require('../lib/api-key-auth');
const {normalizeBuildCandidate,buildFromAnalysis}=require('../lib/bet-builder');

function parseBody(req){
  if(req.body&&typeof req.body==='object')return req.body;
  if(typeof req.body==='string'&&req.body.trim()){
    try{return JSON.parse(req.body);}catch{return{};}
  }
  return{};
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Use POST.'});

  const apiKey=extractApiKey(req);
  if(!apiKey)return res.status(401).json({ok:false,error:'ParlayPing API key required.'});
  const requestId=String(req.headers['x-request-id']||crypto.randomUUID()).slice(0,120);
  res.setHeader('X-Request-Id',requestId);

  const auth=await apiAuth({apiKey,endpoint:'/api/v1/build',requestId});
  if(!auth.ok)return res.status(auth.status).json(auth.payload);
  if(auth.payload?.monthlyLimit!=null)res.setHeader('X-RateLimit-Monthly-Limit',String(auth.payload.monthlyLimit));
  if(auth.payload?.monthlyUsed!=null)res.setHeader('X-RateLimit-Monthly-Used',String(auth.payload.monthlyUsed));
  if(auth.payload?.rateLimitPerMinute!=null)res.setHeader('X-RateLimit-Minute-Limit',String(auth.payload.rateLimitPerMinute));
  if(auth.payload?.minuteUsed!=null)res.setHeader('X-RateLimit-Minute-Used',String(auth.payload.minuteUsed));

  let statusCode=500;
  try{
    const body=parseBody(req);
    const candidates=Array.isArray(body.candidates)?body.candidates:[];
    if(!candidates.length){statusCode=400;return res.status(400).json({ok:false,error:'candidates[] is required.',requestId});}
    if(candidates.length>25){statusCode=400;return res.status(400).json({ok:false,error:'Maximum 25 candidate legs per build request.',requestId});}

    const normalized=candidates.map(normalizeBuildCandidate).filter(row=>row.player&&row.market);
    if(!normalized.length){statusCode=400;return res.status(400).json({ok:false,error:'No valid candidate legs were provided.',requestId});}
    const host=req.headers['x-forwarded-host']||req.headers.host||'parlayping.net';
    const proto=req.headers['x-forwarded-proto']||'https';
    const analysis=await analyzeMultiSport(normalized,{baseUrl:`${proto}://${host}`,referenceTime:body.referenceTime||null});
    const build=buildFromAnalysis(analysis,{
      desiredLegs:body.desiredLegs,
      allowSameGame:body.allowSameGame===true,
      minProbability:body.minProbability,
      sports:body.sports,
    });

    statusCode=200;
    return res.status(200).json({
      ok:true,
      requestId,
      build,
      analysis:{
        generatedAt:analysis.generatedAt,
        dataGeneratedAt:analysis.dataGeneratedAt,
        source:analysis.source,
        sports:analysis.sports,
        counts:analysis.counts,
      },
      api:{version:'v1',plan:auth.payload?.plan||null},
    });
  }catch(error){
    console.error('ParlayPing v1 build error',error);
    statusCode=500;
    return res.status(500).json({ok:false,error:error?.message||'Build failed.',requestId});
  }finally{
    try{await apiAuth({apiKey,endpoint:'/api/v1/build',requestId,action:'finalize',statusCode,metadata:{version:'v1'}});}catch(_){}
  }
};

module.exports.parseBody=parseBody;
