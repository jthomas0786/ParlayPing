const crypto=require('crypto');
const {analyzeMultiSport}=require('../lib/sport-router');
const {applyCorrelationSafety,buildPublicReply}=require('../lib/analysis-safety');
const {extractApiKey,apiAuth}=require('../lib/api-key-auth');

function parseBody(req){if(req.body&&typeof req.body==='object')return req.body;if(typeof req.body==='string'&&req.body.trim()){try{return JSON.parse(req.body);}catch{return{};}}return{};}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Use POST.'});

  const apiKey=extractApiKey(req);
  if(!apiKey)return res.status(401).json({ok:false,error:'ParlayPing API key required.'});
  const requestId=String(req.headers['x-request-id']||crypto.randomUUID()).slice(0,120);
  res.setHeader('X-Request-Id',requestId);

  const auth=await apiAuth({apiKey,endpoint:'/api/v1/analyze',requestId});
  if(!auth.ok)return res.status(auth.status).json(auth.payload);
  if(auth.payload?.monthlyLimit!=null)res.setHeader('X-RateLimit-Monthly-Limit',String(auth.payload.monthlyLimit));
  if(auth.payload?.monthlyUsed!=null)res.setHeader('X-RateLimit-Monthly-Used',String(auth.payload.monthlyUsed));
  if(auth.payload?.rateLimitPerMinute!=null)res.setHeader('X-RateLimit-Minute-Limit',String(auth.payload.rateLimitPerMinute));
  if(auth.payload?.minuteUsed!=null)res.setHeader('X-RateLimit-Minute-Used',String(auth.payload.minuteUsed));

  let statusCode=500;
  try{
    const body=parseBody(req);const legs=Array.isArray(body.legs)?body.legs:[];
    if(!legs.length){statusCode=400;return res.status(400).json({ok:false,error:'legs[] is required.',requestId});}
    if(legs.length>25){statusCode=400;return res.status(400).json({ok:false,error:'Maximum 25 legs per request.',requestId});}
    const host=req.headers['x-forwarded-host']||req.headers.host||'parlayping.net';
    const proto=req.headers['x-forwarded-proto']||'https';
    const raw=await analyzeMultiSport(legs,{baseUrl:`${proto}://${host}`,referenceTime:body.referenceTime||null});
    const result=applyCorrelationSafety(raw);result.replyText=buildPublicReply(result,{maxLegs:4});
    statusCode=200;
    return res.status(200).json({...result,requestId,api:{version:'v1',plan:auth.payload?.plan||null}});
  }catch(error){
    console.error('ParlayPing v1 analyze error',error);
    statusCode=500;return res.status(500).json({ok:false,error:error?.message||'Analysis failed.',requestId});
  }finally{
    try{await apiAuth({apiKey,endpoint:'/api/v1/analyze',requestId,action:'finalize',statusCode,metadata:{version:'v1'}});}catch(_){}
  }
};
