const crypto=require('crypto');
const xWorker=require('./x-worker');

const SCHEDULER_SECRET_SHA256='5f12ee2344aadd169ae6fae8f09a376104e49fc302865e1f9ffc788355a024c6';

function hashSecret(value){
  return crypto.createHash('sha256').update(String(value||'')).digest('hex');
}

function safeHashEqual(left,right){
  const a=Buffer.from(String(left||''));
  const b=Buffer.from(String(right||''));
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

function schedulerAuthorized(req,expectedHash=SCHEDULER_SECRET_SHA256){
  const supplied=req?.headers?.['x-parlayping-scheduler-secret'];
  return Boolean(supplied)&&safeHashEqual(hashSecret(supplied),expectedHash);
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!schedulerAuthorized(req))return res.status(401).json({ok:false,error:'Unauthorized scheduler request.'});
  if(!process.env.X_WORKER_SECRET)return res.status(503).json({ok:false,error:'Primary worker protection is not configured.'});
  req.headers={...(req.headers||{}),'x-parlayping-secret':process.env.X_WORKER_SECRET};
  return xWorker(req,res);
};

module.exports.schedulerAuthorized=schedulerAuthorized;
module.exports.hashSecret=hashSecret;
