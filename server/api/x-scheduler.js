const xWorker=require('./x-worker');
const {schedulerAuthorized,hashSecret}=require('./lib/scheduler-auth');

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!schedulerAuthorized(req))return res.status(401).json({ok:false,error:'Unauthorized scheduler request.'});

  const approved=String(process.env.X_AI_REPLY_APPROVED||'').toLowerCase()==='true';
  if(!approved)return res.status(200).json({ok:true,active:false,dryRun:true,reason:'x-approval-disabled',username:process.env.X_USERNAME||'ParlayPing',processed:0,candidates:[]});

  try{
    const idempotencySecret=req.headers['x-parlayping-scheduler-secret'];
    const candidates=await xWorker.processMentions({dryRun:false,idempotencySecret});
    return res.status(200).json({
      ok:true,
      active:true,
      dryRun:false,
      username:process.env.X_USERNAME||'ParlayPing',
      xApprovalRecorded:true,
      autoReplyMode:'trusted-scheduler',
      processed:candidates.length,
      candidates
    });
  }catch(error){
    console.error('ParlayPing trusted X scheduler',error);
    return res.status(error?.status===429?429:500).json({ok:false,active:false,error:error?.message||'X mention scheduler failed.',retryAfter:error?.retryAfter||null});
  }
};

module.exports.schedulerAuthorized=schedulerAuthorized;
module.exports.hashSecret=hashSecret;
