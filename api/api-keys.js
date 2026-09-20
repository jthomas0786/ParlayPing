const {requireUser,rpc}=require('./lib/supabase-account');

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
      const keys=await rpc(token,'parlayping_list_api_keys');
      return res.status(200).json({ok:true,keys:Array.isArray(keys)?keys:[]});
    }
    if(req.method==='POST'){
      const body=parseBody(req);const name=String(body.name||'').trim();
      if(!name)return res.status(400).json({ok:false,error:'name is required.'});
      const created=await rpc(token,'parlayping_create_api_key',{p_name:name,p_expires_at:body.expiresAt||null});
      return res.status(201).json({ok:true,key:created,note:'Copy the full API key now. ParlayPing stores only its hash and cannot show it again.'});
    }
    if(req.method==='DELETE'){
      const body=parseBody(req);const id=String(body.id||'');
      if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({ok:false,error:'Valid key id is required.'});
      const revoked=await rpc(token,'parlayping_revoke_api_key',{p_key_id:id});
      return res.status(revoked===true?200:404).json({ok:revoked===true,revoked:revoked===true});
    }
    return res.status(405).json({ok:false,error:'Use GET, POST, or DELETE.'});
  }catch(error){
    const status=error?.status===401?401:/limit reached/i.test(error?.message||'')?409:500;
    return res.status(status).json({ok:false,error:error?.message||'API key request failed.'});
  }
};
