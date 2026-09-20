const {requireUser,supabaseFetch}=require('./lib/supabase-account');
const {stripePost}=require('./lib/stripe-billing');

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Use POST.'});
  try{
    const{token,user}=await requireUser(req);
    const rows=await supabaseFetch(`/rest/v1/subscriptions?select=*&user_id=eq.${encodeURIComponent(user.id)}`,{token});
    const sub=rows?.[0]||null;
    if(!sub?.provider_customer_id)return res.status(409).json({ok:false,error:'No Stripe billing profile exists yet.'});
    const base=String(process.env.PUBLIC_BASE_URL||'https://parlayping.net').replace(/\/$/,'');
    const session=await stripePost('/billing_portal/sessions',{customer:sub.provider_customer_id,return_url:`${base}/account`});
    return res.status(200).json({ok:true,url:session.url,id:session.id});
  }catch(error){
    const status=Number(error?.status)||500;
    return res.status(status>=400&&status<600?status:500).json({ok:false,error:error?.message||'Unable to open billing portal.'});
  }
};
