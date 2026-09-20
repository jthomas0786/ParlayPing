const SUPABASE_URL=process.env.SUPABASE_URL||'https://avwqjgiitxqphvmitolw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_7mYXjjkRrQq3iRig7UYHNQ_b6EZZiJA';

function bearer(req){
  const raw=String(req?.headers?.authorization||'');
  return /^Bearer\s+.+/i.test(raw)?raw:null;
}

async function supabaseFetch(path,{method='GET',token,body,headers={}}={}){
  const response=await fetch(`${SUPABASE_URL}${path}`,{
    method,
    headers:{
      apikey:SUPABASE_PUBLISHABLE_KEY,
      ...(token?{authorization:token}:{}),
      ...(body!==undefined?{'content-type':'application/json'}:{}),
      ...headers,
    },
    body:body===undefined?undefined:JSON.stringify(body),
    signal:AbortSignal.timeout(8000),
  });
  const text=await response.text();
  let payload=null;
  try{payload=text?JSON.parse(text):null;}catch{payload={raw:text};}
  if(!response.ok){
    const error=new Error(payload?.message||payload?.error_description||payload?.error||`Supabase request failed (${response.status})`);
    error.status=response.status;
    error.payload=payload;
    throw error;
  }
  return payload;
}

async function requireUser(req){
  const token=bearer(req);
  if(!token){const error=new Error('Authentication required.');error.status=401;throw error;}
  const user=await supabaseFetch('/auth/v1/user',{token});
  if(!user?.id){const error=new Error('Invalid session.');error.status=401;throw error;}
  return{token,user};
}

async function rpc(token,name,body={}){
  return supabaseFetch(`/rest/v1/rpc/${name}`,{method:'POST',token,body});
}

module.exports={SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,bearer,supabaseFetch,requireUser,rpc};
