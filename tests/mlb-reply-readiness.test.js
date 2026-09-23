const test=require('node:test');
const assert=require('node:assert/strict');
const {replyReadiness,applyCorrelationSafety,buildPublicReply}=require('../api/lib/analysis-safety');
const {buildXShareBundle}=require('../api/lib/x-share-bundle');

test('verified MLB legs with no model probability are still ready for an X reply',()=>{
  const originalShareSecret=process.env.PARLAYPING_SHARE_SECRET;
  process.env.PARLAYPING_SHARE_SECRET='mlb-reply-test-secret-0123456789abcdef';
  try{
    const legs=[
      {id:'mlb-1',sport:'MLB',player:'Riley Greene',team:'DETROIT TIGERS',market:'homeRun',side:'yes',line:null,inclusive:true,originalText:'Riley Greene To Hit A Home Run'},
      {id:'mlb-2',sport:'MLB',player:'Coby Mayo',team:'BALTIMORE ORIOLES',market:'homeRun',side:'yes',line:null,inclusive:true,originalText:'Coby Mayo To Hit A Home Run'},
      {id:'mlb-3',sport:'MLB',player:'Josh Bell',team:'MINNESOTA TWINS',market:'homeRun',side:'yes',line:null,inclusive:true,originalText:'Josh Bell To Hit A Home Run'},
      {id:'mlb-4',sport:'MLB',player:'Jake Burger',team:'TEXAS RANGERS',market:'homeRun',side:'yes',line:null,inclusive:true,originalText:'Jake Burger To Hit A Home Run'}
    ];
    const results=legs.map((leg,index)=>({...leg,status:'PENDING',gameId:String(1000+index),matchup:'MLB game',startTimeUTC:'2099-09-23T20:00:00Z',gameState:'pre',resolutionSource:'mlb-official-player-directory',displayMarket:'HR',current:0,target:1,probability:null,probabilityPct:null,marketOptions:[]}));
    const analysis=applyCorrelationSafety({ok:true,results,counts:{hit:0,miss:0,live:0,pending:4,void:0,unresolved:0},combinedTailProbability:null,tailUrl:null});
    const readiness=replyReadiness(analysis);
    assert.deepEqual(readiness,{ready:true,reason:null,unresolvedCount:0,resolvedCount:4});
    const publicReply=buildPublicReply(analysis,{maxLegs:3});
    assert.match(publicReply,/ParlayPing Live/);
    assert.match(publicReply,/4 left/);
    const bundle=buildXShareBundle({parsedLegs:legs,analysis,sourceReference:'x:test',baseUrl:'https://parlayping.net',maxReplyLegs:3});
    assert.equal(bundle.ready,true);
    assert.match(bundle.replyText,/Open betslip/);
  }finally{
    if(originalShareSecret===undefined)delete process.env.PARLAYPING_SHARE_SECRET;
    else process.env.PARLAYPING_SHARE_SECRET=originalShareSecret;
  }
});
