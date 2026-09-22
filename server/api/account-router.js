const {requireUser,supabaseFetch,accountEdge}=require('./lib/supabase-account');
const {stripePost,priceIdForPlan}=require('./lib/stripe-billing');

function parseBody(req){
  if(req.body&&typeof req.body==='object')return req.body;
  if(typeof req.body==='string'&&req.body.trim()){try{return JSON.parse(req.body);}catch{return{};}}
  return{};
}

async function account(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  try{
    const{token,user}=await requireUser(req);
    if(req.method==='GET'){
      const [profiles,subscriptions,privateData]=await Promise.all([
        supabaseFetch(`/rest/v1/profiles?select=*&id=eq.${encodeURIComponent(user.id)}`,{token}),
        supabaseFetch(`/rest/v1/subscriptions?select=*,plans(*)&user_id=eq.${encodeURIComponent(user.id)}`,{token}),
        accountEdge(token,{action:'bootstrap'}),
      ]);
      return res.status(200).json({ok:true,user:{id:user.id,email:user.email||null,createdAt:user.created_at||null},profile:profiles?.[0]||null,subscription:subscriptions?.[0]||null,usage:privateData?.usage||null,apiKeys:Array.isArray(privateData?.keys)?privateData.keys:[]});
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
}

async function apiKeys(req,res){
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
}

async function plans(req,res){
  res.setHeader('Cache-Control','public, max-age=60, s-maxage=300');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Use GET.'});
  try{
    const rows=await supabaseFetch('/rest/v1/plans?select=id,name,description,monthly_request_limit,rate_limit_per_minute,max_api_keys,features,price_monthly_cents&active=eq.true&is_public=eq.true&order=monthly_request_limit.asc');
    return res.status(200).json({ok:true,plans:Array.isArray(rows)?rows:[]});
  }catch(error){return res.status(500).json({ok:false,error:error?.message||'Unable to load plans.'});}
}

async function billingCheckout(req,res){
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
}

async function billingPortal(req,res){
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
}

const handlers={account,'api-keys':apiKeys,plans,'billing-checkout':billingCheckout,'billing-portal':billingPortal};

module.exports=async function handler(req,res){
  const route=String(req.query?.route||'').trim().toLowerCase();
  const selected=handlers[route];
  if(!selected){
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.status(404).json({ok:false,error:'Unknown account API route.'});
  }
  return selected(req,res);
};
