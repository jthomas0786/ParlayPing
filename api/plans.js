const {supabaseFetch}=require('./lib/supabase-account');

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','public, max-age=60, s-maxage=300');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Use GET.'});
  try{
    const plans=await supabaseFetch('/rest/v1/plans?select=id,name,description,monthly_request_limit,rate_limit_per_minute,max_api_keys,features,price_monthly_cents&active=eq.true&is_public=eq.true&order=monthly_request_limit.asc');
    return res.status(200).json({ok:true,plans:Array.isArray(plans)?plans:[]});
  }catch(error){return res.status(500).json({ok:false,error:error?.message||'Unable to load plans.'});}
};
