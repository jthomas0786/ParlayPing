const crypto = require('crypto');

const X_API = 'https://api.x.com/2';

function enc(v){return encodeURIComponent(String(v)).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());}
function creds(){
  const c={key:process.env.X_API_KEY,secret:process.env.X_API_SECRET,token:process.env.X_ACCESS_TOKEN,tokenSecret:process.env.X_ACCESS_TOKEN_SECRET};
  if(!c.key||!c.secret||!c.token||!c.tokenSecret) throw new Error('OAuth 1.0a credentials are incomplete.');
  return c;
}
function auth(method,url){
  const c=creds();
  const u=new URL(url);
  const oauth={oauth_consumer_key:c.key,oauth_nonce:crypto.randomBytes(16).toString('hex'),oauth_signature_method:'HMAC-SHA1',oauth_timestamp:String(Math.floor(Date.now()/1000)),oauth_token:c.token,oauth_version:'1.0'};
  const params=[];
  for(const [k,v] of u.searchParams.entries()) params.push([k,v]);
  for(const [k,v] of Object.entries(oauth)) params.push([k,v]);
  params.sort((a,b)=>enc(a[0]).localeCompare(enc(b[0]))||enc(a[1]).localeCompare(enc(b[1])));
  const paramString=params.map(([k,v])=>`${enc(k)}=${enc(v)}`).join('&');
  const baseUrl=`${u.protocol}//${u.host}${u.pathname}`;
  const base=`${method.toUpperCase()}&${enc(baseUrl)}&${enc(paramString)}`;
  const key=`${enc(c.secret)}&${enc(c.tokenSecret)}`;
  oauth.oauth_signature=crypto.createHmac('sha1',key).update(base).digest('base64');
  return 'OAuth '+Object.entries(oauth).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${enc(k)}="${enc(v)}"`).join(', ');
}

module.exports = async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    const url=`${X_API}/users/me?user.fields=id,name,username`;
    const r=await fetch(url,{headers:{authorization:auth('GET',url)}});
    const p=await r.json();
    if(!r.ok) return res.status(r.status).json({ok:false,status:r.status,error:p?.detail||p?.title||'X authentication failed'});
    return res.status(200).json({ok:true,authenticated:true,user:{id:p?.data?.id||null,username:p?.data?.username||null,name:p?.data?.name||null},postingSafety:{approvalRecorded:String(process.env.X_AI_REPLY_APPROVED||'').toLowerCase()==='true',autoReplyEnabled:String(process.env.X_AUTOREPLY_ENABLED||'').toLowerCase()==='true'}});
  }catch(e){return res.status(500).json({ok:false,error:e?.message||'Auth check failed'});}
};
