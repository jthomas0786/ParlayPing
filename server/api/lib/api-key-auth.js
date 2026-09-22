const SUPABASE_URL=process.env.SUPABASE_URL||'https://avwqjgiitxqphvmitolw.supabase.co';
const AUTH_URL=`${SUPABASE_URL}/functions/v1/parlayping-api-auth`;

function extractApiKey(req){
  const direct=String(req?.headers?.['x-api-key']||'').trim();
  if(direct)return direct;
  const auth=String(req?.headers?.authorization||'');
  const match=auth.match(/^Bearer\s+(pp_live_[0-9a-f]{48})$/i);
  return match?match[1]:'';
}

async function apiAuth({apiKey,endpoint,requestId,action='authenticate',statusCode,metadata}){
  const response=await fetch(AUTH_URL,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({apiKey,endpoint,requestId,action,statusCode,metadata}),
    signal:AbortSignal.timeout(8000),
  });
  const text=await response.text();let payload={};
  try{payload=text?JSON.parse(text):{};}catch{payload={error:text};}
  return{ok:response.ok,payload,status:response.status};
}

module.exports={extractApiKey,apiAuth,AUTH_URL};
