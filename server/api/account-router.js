const {requireUser,supabaseFetch,accountEdge}=require('./lib/supabase-account');
const {stripePost,priceIdForPlan}=require('./lib/stripe-billing');

// Canonical ParlayPing owner account. PARLAYPING_DEV_USER_ID may override this in Vercel.
const DEFAULT_DEV_USER_ID='a08636ec-508e-457d-8e5a-400a0ec39729';

function parseBody(req){
  if(req.body&&typeof req.body==='object')return req.body;
  if(typeof req.body==='string'&&req.body.trim()){try{return JSON.parse(req.body);}catch{return{};}}
  return{};
}

function developerUserId(){return String(process.env.PARLAYPING_DEV_USER_ID||DEFAULT_DEV_USER_ID).trim();}
function isDeveloperUser(user){return Boolean(user?.id)&&String(user.id)===developerUserId();}
function requireDeveloper(user){if(!isDeveloperUser(user)){const error=new Error('Developer access is restricted to the ParlayPing account.');error.status=403;throw error;}}
function errorStatus(error,fallback=500){const status=Number(error?.status)||fallback;return status>=400&&status<600?status:fallback;}

async function account(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  try{
    const{token,user}=await requireUser(req);
    const isDeveloper=isDeveloperUser(user);
    if(req.method==='GET'){
      const profilePromise=supabaseFetch(`/rest/v1/profiles?select=*&id=eq.${encodeURIComponent(user.id)}`,{token});
      let subscriptions=[],privateData=null;
      if(isDeveloper){
        [subscriptions,privateData]=await Promise.all([
          supabaseFetch(`/rest/v1/subscriptions?select=*,plans(*)&user_id=eq.${encodeURIComponent(user.id)}`,{token}),
          accountEdge(token,{action:'bootstrap'}),
        ]);
      }
      const profiles=await profilePromise;
      return res.status(200).json({
        ok:true,
        isDeveloper,
        user:{id:user.id,email:user.email||null,createdAt:user.created_at||null},
        profile:profiles?.[0]||null,
        subscription:isDeveloper?(subscriptions?.[0]||null):null,
        usage:isDeveloper?(privateData?.usage||null):null,
        apiKeys:isDeveloper&&Array.isArray(privateData?.keys)?privateData.keys:[],
      });
    }
    if(req.method==='PATCH'){
      const body=parseBody(req);
      const allowed=['display_name','x_username','avatar_url','website_url'];
      if(isDeveloper)allowed.push('developer_name','company_name');
      const patch={};
      for(const key of allowed)if(Object.prototype.hasOwnProperty.call(body,key))patch[key]=body[key]===null?null:String(body[key]).trim().slice(0,300);
      if(!Object.keys(patch).length)return res.status(400).json({ok:false,error:'No supported profile fields supplied.'});
      const rows=await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`,{method:'PATCH',token,body:patch,headers:{Prefer:'return=representation'}});
      return res.status(200).json({ok:true,isDeveloper,profile:rows?.[0]||null});
    }
    return res.status(405).json({ok:false,error:'Use GET or PATCH.'});
  }catch(error){
    return res.status(errorStatus(error)).json({ok:false,error:error?.message||'Account request failed.'});
  }
}

async function apiKeys(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  try{
    const{token,user}=await requireUser(req);requireDeveloper(user);
    if(req.method==='GET'){
      const data=await accountEdge(token,{action:'listKeys'});
      return res.status(200).json({ok:true,keys:Array.isArray(data?.keys)?data.keys:[]});
    }
    if(req.method==='POST'){
      const body=parseBody(req),name=String(body.name||'').trim();
      if(!name)return res.status(400).json({ok:false,error:'name is required.'});
      const data=await accountEdge(token,{action:'createKey',name,expiresAt:body.expiresAt||null});
      return res.status(201).json(data);
    }
    if(req.method==='DELETE'){
      const body=parseBody(req),id=String(body.id||'');
      if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({ok:false,error:'Valid key id is required.'});
      const data=await accountEdge(token,{action:'revokeKey',id});
      return res.status(data?.revoked===true?200:404).json(data||{ok:false,revoked:false});
    }
    return res.status(405).json({ok:false,error:'Use GET, POST, or DELETE.'});
  }catch(error){
    const status=/limit reached/i.test(error?.message||'')?409:errorStatus(error);
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
    const{token,user}=await requireUser(req);requireDeveloper(user);
    const body=parseBody(req),plan=String(body.plan||'').toLowerCase();
    if(!['pro','business'].includes(plan))return res.status(400).json({ok:false,error:'plan must be pro or business.'});
    const priceId=priceIdForPlan(plan);
    const rows=await supabaseFetch(`/rest/v1/subscriptions?select=*&user_id=eq.${encodeURIComponent(user.id)}`,{token});
    const sub=rows?.[0]||null;
    if(sub?.provider==='stripe'&&sub?.provider_subscription_id&&['active','trialing','past_due','unpaid'].includes(sub.status))return res.status(409).json({ok:false,error:'You already have a Stripe subscription. Use Manage billing to change or cancel it.'});
    const base=String(process.env.PUBLIC_BASE_URL||'https://parlayping.net').replace(/\/$/,'');
    const fields={mode:'subscription',success_url:`${base}/profile?tab=dev&billing=success&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${base}/profile?tab=dev&billing=cancelled`,'line_items[0][price]':priceId,'line_items[0][quantity]':1,client_reference_id:user.id,'metadata[user_id]':user.id,'metadata[plan_id]':plan,'subscription_data[metadata][user_id]':user.id,'subscription_data[metadata][plan_id]':plan,allow_promotion_codes:'true'};
    if(sub?.provider_customer_id)fields.customer=sub.provider_customer_id;else fields.customer_email=user.email||'';
    const checkout=await stripePost('/checkout/sessions',fields);
    return res.status(200).json({ok:true,url:checkout.url,id:checkout.id});
  }catch(error){return res.status(errorStatus(error)).json({ok:false,error:error?.message||'Unable to start checkout.'});}
}

async function billingPortal(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Use POST.'});
  try{
    const{token,user}=await requireUser(req);requireDeveloper(user);
    const rows=await supabaseFetch(`/rest/v1/subscriptions?select=*&user_id=eq.${encodeURIComponent(user.id)}`,{token});
    const sub=rows?.[0]||null;
    if(!sub?.provider_customer_id)return res.status(409).json({ok:false,error:'No Stripe billing profile exists yet.'});
    const base=String(process.env.PUBLIC_BASE_URL||'https://parlayping.net').replace(/\/$/,'');
    const portal=await stripePost('/billing_portal/sessions',{customer:sub.provider_customer_id,return_url:`${base}/profile?tab=dev`});
    return res.status(200).json({ok:true,url:portal.url,id:portal.id});
  }catch(error){return res.status(errorStatus(error)).json({ok:false,error:error?.message||'Unable to open billing portal.'});}
}

const handlers={account,'api-keys':apiKeys,plans,'billing-checkout':billingCheckout,'billing-portal':billingPortal};
module.exports=async function handler(req,res){
  const route=String(req.query?.route||'').trim().toLowerCase();
  const selected=handlers[route];
  if(!selected){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');return res.status(404).json({ok:false,error:'Unknown account API route.'});}
  return selected(req,res);
};

module.exports.isDeveloperUser=isDeveloperUser;
