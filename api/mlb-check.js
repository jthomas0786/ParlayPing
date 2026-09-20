const { analyzeMultiSport } = require('./lib/sport-router');
const { applyCorrelationSafety } = require('./lib/analysis-safety');

module.exports = async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'Use GET.'});
  try{
    const raw=await analyzeMultiSport([{
      sport:'MLB',player:'Bryce Harper',team:'PHI',market:'hits',side:'over',line:1,inclusive:true,originalText:'Bryce Harper 1+ Hits'
    }],{baseUrl:'https://parlayping.net',referenceTime:'2026-09-20T14:00:00Z'});
    const result=applyCorrelationSafety(raw);
    const row=result.results?.[0]||null;
    return res.status(200).json({
      ok:Boolean(result.ok),
      sports:result.sports,
      supportedSports:result.supportedSports,
      source:result.source,
      row:row?{sport:row.sport,player:row.player,market:row.market,status:row.status,gameId:row.gameId,probability:row.probability,probabilityPct:row.probabilityPct,modelHash:row.modelHash,startTimeUTC:row.startTimeUTC}:null
    });
  }catch(error){
    return res.status(500).json({ok:false,error:error?.message||'MLB check failed.'});
  }
};
