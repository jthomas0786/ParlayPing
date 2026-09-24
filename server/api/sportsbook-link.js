const { resolveSportsbookBetslip } = require('./lib/odds-api-deeplink');

function cleanLeg(input={}){
  const text=(value,max=180)=>value==null?null:String(value).replace(/\s+/g,' ').trim().slice(0,max)||null;
  const number=value=>value===null||value===undefined||value===''?null:(Number.isFinite(Number(value))?Number(value):null);
  return {
    sport:text(input.sport,24),
    player:text(input.player||input.playerName,120),
    gameId:text(input.gameId||input.eventId,120),
    matchup:text(input.matchup,160),
    market:text(input.market,120),
    displayMarket:text(input.displayMarket,180),
    side:text(input.side||input.selection,24),
    line:number(input.line),
    inclusive:Boolean(input.inclusive),
    startTimeUTC:text(input.startTimeUTC,80)
  };
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(String(req.method||'GET').toUpperCase()!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({ok:false,error:'Method not allowed.'});
  }
  if(!process.env.ODDS_API_KEY){
    return res.status(503).json({ok:false,code:'ODDS_API_NOT_CONFIGURED',error:'Exact sportsbook betslip enrichment is not configured.'});
  }
  try{
    const body=req.body&&typeof req.body==='object'?req.body:{};
    const book=String(body.book||body.sportsbook||'').trim();
    const source=Array.isArray(body.legs)?body.legs:[];
    if(!book)return res.status(400).json({ok:false,error:'Sportsbook is required.'});
    if(!source.length||source.length>25)return res.status(400).json({ok:false,error:'Provide between 1 and 25 betslip legs.'});
    const legs=source.map(cleanLeg);
    if(legs.some(leg=>!leg.sport||!leg.player||!leg.market))return res.status(400).json({ok:false,error:'Each leg requires sport, player, and market.'});
    const result=await resolveSportsbookBetslip({book,legs});
    return res.status(200).json({ok:true,...result});
  }catch(error){
    console.error('ParlayPing sportsbook deeplink resolver failed',error);
    const status=Number(error?.status);
    return res.status(Number.isInteger(status)&&status>=400&&status<600?status:502).json({
      ok:false,
      error:error?.message||'Unable to resolve an exact sportsbook betslip.'
    });
  }
};

module.exports.cleanLeg=cleanLeg;
