const {requireUser,supabaseFetch,rpc}=require('./lib/supabase-account');

function parseBody(req){
  if(req.body&&typeof req.body==='object')return req.body;
  if(typeof req.body==='string'&&req.body.trim()){try{return JSON.parse(req.body);}catch{return{};}}
  return{};
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  try{
    const{token,user}=await requireUser(req);
    if(req.method==='GET'){
      const [profiles,subscriptions,usage,keys]=await Promise.all([
        supabaseFetch(`/rest/v1/profiles?select=*&id=eq.${encodeURIComponent(user.id)}`,{token}),
        supabaseFetch(`/rest/v1/subscriptions?select=*,plans(*)&user_id=eq.${encodeURIComponent(user.id)}`,{token}),
        rpc(token,'parlayping_usage_summary'),
        rpc(token,'parlayping_list_api_keys'),
      ]);
      return res.status(200).json({ok:true,user:{id:user.id,email:user.email||null,createdAt:user.created_at||null},profile:profiles?.[0]||null,subscription:subscriptions?.[0]||null,usage,apiKeys:Array.isArray(keys)?keys:[]});
    }
    if(req.method==='PATCH'){
      const body=parseBody(req);
      const allowed=['display_name','x_username','avatar_url','developer_name','company_name','website_url'];
      const patch={};
      for(const key of allowed)if(Object.prototype.hasOwnProperty.call(body,key))patch[key]=body[key]===null?null:String(body[key]).trim().slice(0,300);
      if(!Object.keys(patch).length)return res.status(400).json({ok:false,error:'No supported profile fields supplied.'});
      const rows=await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`,{method:'PATCH',token,body:patch,headers:{Prefer:'return=representation'}});
      return res.status(200).json({ok:true,profile:rows?.[0]||null});
    }
    return res.status(405).json({ok:false,error:'Use GET or PATCH.'});
  }catch(error){
    return res.status(error?.status===401?401:500).json({ok:false,error:error?.message||'Account request failed.'});
  }
};
