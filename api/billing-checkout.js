const {requireUser,supabaseFetch}=require('./lib/supabase-account');
const {stripePost,priceIdForPlan}=require('./lib/stripe-billing');

function parseBody(req){
  if(req.body&&typeof req.body==='object')return req.body;
  if(typeof req.body==='string'&&req.body.trim()){try{return JSON.parse(req.body);}catch{return{};}}
  return{};
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Use POST.'});
  try{
    const{token,user}=await requireUser(req);
    const body=parseBody(req);const plan=String(body.plan||'').toLowerCase();
    if(!['pro','business'].includes(plan))return res.status(400).json({ok:false,error:'plan must be pro or business.'});
    const priceId=priceIdForPlan(plan);
    const rows=await supabaseFetch(`/rest/v1/subscriptions?select=*&user_id=eq.${encodeURIComponent(user.id)}`,{token});
    const sub=rows?.[0]||null;
    if(sub?.provider==='stripe'&&sub?.provider_subscription_id&&['active','trialing','past_due','unpaid'].includes(sub.status)){
      return res.status(409).json({ok:false,error:'You already have a Stripe subscription. Use Manage billing to change or cancel it.'});
    }
    const base=String(process.env.PUBLIC_BASE_URL||'https://parlayping.net').replace(/\/$/,'');
    const fields={
      mode:'subscription',
      success_url:`${base}/account?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${base}/account?billing=cancelled`,
      'line_items[0][price]':priceId,
      'line_items[0][quantity]':1,
      client_reference_id:user.id,
      'metadata[user_id]':user.id,
      'metadata[plan_id]':plan,
      'subscription_data[metadata][user_id]':user.id,
      'subscription_data[metadata][plan_id]':plan,
      allow_promotion_codes:'true',
    };
    if(sub?.provider_customer_id)fields.customer=sub.provider_customer_id;
    else fields.customer_email=user.email||'';
    const session=await stripePost('/checkout/sessions',fields);
    return res.status(200).json({ok:true,url:session.url,id:session.id});
  }catch(error){
    const status=Number(error?.status)||500;
    return res.status(status>=400&&status<600?status:500).json({ok:false,error:error?.message||'Unable to start checkout.'});
  }
};
