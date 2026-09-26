const xWorker=require('./x-worker');
const {schedulerAuthorized,hashSecret}=require('./lib/scheduler-auth');

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!schedulerAuthorized(req))return res.status(401).json({ok:false,error:'Unauthorized scheduler request.'});
  if(!process.env.X_WORKER_SECRET)return res.status(503).json({ok:false,error:'Primary worker protection is not configured.'});
  req.headers={...(req.headers||{}),'x-parlayping-secret':process.env.X_WORKER_SECRET};
  return xWorker(req,res);
};

module.exports.schedulerAuthorized=schedulerAuthorized;
module.exports.hashSecret=hashSecret;
