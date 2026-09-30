const crypto=require('crypto');

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
  if(supplied&&safeHashEqual(hashSecret(supplied),expectedHash))return true;

  const cronSecret=String(process.env.CRON_SECRET||'');
  const authorization=String(req?.headers?.authorization||'');
  if(!cronSecret||!authorization.startsWith('Bearer '))return false;
  const bearer=authorization.slice(7);
  return Boolean(bearer)&&safeHashEqual(hashSecret(bearer),hashSecret(cronSecret));
}

module.exports={SCHEDULER_SECRET_SHA256,hashSecret,safeHashEqual,schedulerAuthorized};
