const crypto=require('crypto');

function safeEqual(a,b){
  if(!a||!b)return false;
  const left=Buffer.from(String(a));
  const right=Buffer.from(String(b));
  if(left.length!==right.length)return false;
  return crypto.timingSafeEqual(left,right);
}

function authorizeWorkerRequest(req,env=process.env){
  const primary=env.X_WORKER_SECRET;
  const scheduler=env.X_SCHEDULER_SECRET;
  if(!primary&&!scheduler)return{ok:false,status:503,error:'Worker protection is not configured.',method:null};
  const primarySupplied=req?.headers?.['x-parlayping-secret'];
  if(primary&&safeEqual(primarySupplied,primary))return{ok:true,status:200,error:null,method:'primary-worker-secret'};
  const schedulerSupplied=req?.headers?.['x-parlayping-scheduler-secret'];
  if(scheduler&&safeEqual(schedulerSupplied,scheduler))return{ok:true,status:200,error:null,method:'supabase-scheduler-secret'};
  return{ok:false,status:401,error:'Unauthorized.',method:null};
}

module.exports={authorizeWorkerRequest,safeEqual};
