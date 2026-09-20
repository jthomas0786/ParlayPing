const {requireUser,accountEdge}=require('./lib/supabase-account');

function parseBody(req){
  if(req.body&&typeof req.body==='object')return req.body;
  if(typeof req.body==='string'&&req.body.trim()){try{return JSON.parse(req.body);}catch{return{};}}
  return{};
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  try{
    const{token}=await requireUser(req);
    if(req.method==='GET'){
      const data=await accountEdge(token,{action:'listKeys'});
      return res.status(200).json({ok:true,keys:Array.isArray(data?.keys)?data.keys:[]});
    }
    if(req.method==='POST'){
      const body=parseBody(req);const name=String(body.name||'').trim();
      if(!name)return res.status(400).json({ok:false,error:'name is required.'});
      const data=await accountEdge(token,{action:'createKey',name,expiresAt:body.expiresAt||null});
      return res.status(201).json(data);
    }
    if(req.method==='DELETE'){
      const body=parseBody(req);const id=String(body.id||'');
      if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({ok:false,error:'Valid key id is required.'});
      const data=await accountEdge(token,{action:'revokeKey',id});
      return res.status(data?.revoked===true?200:404).json(data||{ok:false,revoked:false});
    }
    return res.status(405).json({ok:false,error:'Use GET, POST, or DELETE.'});
  }catch(error){
    const status=error?.status===401?401:/limit reached/i.test(error?.message||'')?409:500;
    return res.status(status).json({ok:false,error:error?.message||'API key request failed.'});
  }
};
