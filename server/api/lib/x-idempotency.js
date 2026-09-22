const IDEMPOTENCY_ENDPOINT='https://avwqjgiitxqphvmitolw.supabase.co/functions/v1/parlayping-x-idempotency';

function idempotencyTimeoutMs(){
  const configured=Number(process.env.X_IDEMPOTENCY_TIMEOUT_MS);
  return Number.isFinite(configured)?Math.max(2000,Math.min(10000,Math.round(configured))):5000;
}

async function idempotencyRequest(secret,action,payload={}){
  if(!secret)throw new Error('Durable X idempotency secret is unavailable.');
  const signal=typeof AbortSignal==='function'&&typeof AbortSignal.timeout==='function'?AbortSignal.timeout(idempotencyTimeoutMs()):undefined;
  const response=await fetch(IDEMPOTENCY_ENDPOINT,{
    method:'POST',
    headers:{'content-type':'application/json','x-parlayping-scheduler-secret':String(secret)},
    body:JSON.stringify({action,...payload}),
    signal,
  });
  const text=await response.text();
  let result={};
  try{result=text?JSON.parse(text):{};}catch(_){result={error:text||'Invalid idempotency response.'};}
  if(!response.ok||result?.ok!==true){
    const error=new Error(result?.error||`X idempotency ${action} failed (${response.status}).`);
    error.status=response.status;
    throw error;
  }
  return result;
}

const claimMention=(secret,mentionId)=>idempotencyRequest(secret,'claim',{mentionId:String(mentionId)});
const markMentionReplied=(secret,mentionId,replyId)=>idempotencyRequest(secret,'replied',{mentionId:String(mentionId),replyId:String(replyId)});
const markMentionError=(secret,mentionId,error)=>idempotencyRequest(secret,'error',{mentionId:String(mentionId),error:String(error||'post failed')});
const releaseMention=(secret,mentionId)=>idempotencyRequest(secret,'release',{mentionId:String(mentionId)});

module.exports={IDEMPOTENCY_ENDPOINT,idempotencyTimeoutMs,idempotencyRequest,claimMention,markMentionReplied,markMentionError,releaseMention};
