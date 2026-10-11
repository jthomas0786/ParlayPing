import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const enc=new TextEncoder();
const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const SERVICE_ROLE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})}
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let out=0;for(let i=0;i<a.length;i++)out|=a.charCodeAt(i)^b.charCodeAt(i);return out===0;}
async function sb(path:string,{method='GET',body}:{method?:string,body?:unknown}={}){const r=await fetch(`${SUPABASE_URL}${path}`,{method,headers:{apikey:SERVICE_ROLE_KEY,authorization:`Bearer ${SERVICE_ROLE_KEY}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let payload:any=null;try{payload=text?JSON.parse(text):null}catch{payload=text}if(!r.ok)throw new Error(typeof payload==='string'?payload:(payload?.message||payload?.error||`Supabase ${r.status}`));return payload;}
async function rpc(name:string,args:Record<string,unknown>={}){return sb(`/rest/v1/rpc/${name}`,{method:'POST',body:args});}
async function webhookSecret(){const value=await rpc('parlayping_get_stripe_webhook_secret');if(typeof value!=='string'||!value.startsWith('whsec_'))throw new Error('Stripe webhook secret is unavailable.');return value;}
async function hmacHex(secret:string,message:string){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,enc.encode(message));return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,'0')).join('');}
async function verifyStripe(raw:string,header:string){const secret=await webhookSecret();const parts=header.split(',').map(x=>x.trim());const t=parts.find(x=>x.startsWith('t='))?.slice(2)||'';const signatures=parts.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));if(!t||!signatures.length)return false;const ts=Number(t);if(!Number.isFinite(ts)||Math.abs(Date.now()/1000-ts)>300)return false;const expected=await hmacHex(secret,`${t}.${raw}`);return signatures.some(sig=>safeEqual(sig,expected));}
async function finish(id:string,status:'processed'|'ignored'|'failed',error?:string){try{await rpc('parlayping_stripe_finish_event',{p_event_id:id,p_status:status,p_error:error||null})}catch{} }

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return json({ok:false,error:'Use POST.'},405);
  const raw=await req.text();
  const signature=req.headers.get('stripe-signature')||'';
  try{
    if(!await verifyStripe(raw,signature))return json({ok:false,error:'Invalid Stripe signature.'},401);
    const event=JSON.parse(raw);
    const claimed=await rpc('parlayping_stripe_claim_event',{p_event_id:event.id,p_event_type:event.type,p_stripe_created_at:event.created?new Date(event.created*1000).toISOString():null});
    if(claimed!==true)return json({ok:true,duplicate:true});
    if(!['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type)){
      await finish(event.id,'ignored');return json({ok:true,ignored:true});
    }
    const sub=event.data?.object||{};
    const item=sub.items?.data?.[0]||{};
    const priceId=item.price?.id||sub.plan?.id||null;
    let userId=sub.metadata?.user_id||null;
    if(!userId&&sub.id){const rows=await sb(`/rest/v1/subscriptions?select=user_id&provider_subscription_id=eq.${encodeURIComponent(sub.id)}&limit=1`);userId=rows?.[0]?.user_id||null;}
    if(!userId&&sub.customer){const rows=await sb(`/rest/v1/subscriptions?select=user_id&provider_customer_id=eq.${encodeURIComponent(sub.customer)}&limit=1`);userId=rows?.[0]?.user_id||null;}
    if(!userId)throw new Error('Unable to map Stripe subscription to ParlayPing user.');
    if(!priceId)throw new Error('Stripe subscription did not include a price ID.');
    const plans=await sb(`/rest/v1/plans?select=id&active=eq.true&stripe_price_id=eq.${encodeURIComponent(priceId)}&limit=1`);
    const planId=plans?.[0]?.id||null;
    if(!planId)throw new Error(`Unrecognized Stripe price ID: ${priceId}`);
    const status=event.type==='customer.subscription.deleted'?'canceled':String(sub.status||'incomplete');
    const periodStart=sub.current_period_start||item.current_period_start||null;
    const periodEnd=sub.current_period_end||item.current_period_end||null;
    const applied=await rpc('parlayping_stripe_apply_subscription_event',{
      p_event_id:String(event.id),
      p_user_id:userId,p_plan_id:planId,p_status:status,p_customer_id:String(sub.customer||''),p_subscription_id:String(sub.id||''),p_price_id:priceId,
      p_period_start:periodStart?new Date(periodStart*1000).toISOString():null,
      p_period_end:periodEnd?new Date(periodEnd*1000).toISOString():null,
      p_cancel_at_period_end:Boolean(sub.cancel_at_period_end),p_checkout_session_id:null
    });
    await finish(event.id,applied===true?'processed':'ignored');
    return json({ok:true,applied:applied===true,stale:applied===false});
  }catch(error){let id='';try{id=JSON.parse(raw)?.id||''}catch{}if(id)await finish(id,'failed',error instanceof Error?error.message:String(error));return json({ok:false,error:error instanceof Error?error.message:'Webhook failed.'},500);}
});
