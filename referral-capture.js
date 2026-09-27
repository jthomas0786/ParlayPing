(()=>{
  const SUPABASE_URL='https://avwqjgiitxqphvmitolw.supabase.co';
  const SUPABASE_KEY='sb_publishable_7mYXjjkRrQq3iRig7UYHNQ_b6EZZiJA';
  const SESSION_KEY='parlayping_supabase_session_v1';
  const REFERRAL_KEY='parlayping_referral_code_v1';
  let claimed=false,attempts=0;

  function validCode(value){const code=String(value||'').trim().toUpperCase();return /^[A-Z0-9][A-Z0-9_-]{1,23}$/.test(code)?code:null;}
  function codeFromLocation(){return validCode(new URLSearchParams(location.search).get('ref'));}
  function remember(){const code=codeFromLocation();if(!code)return pending();try{localStorage.setItem(REFERRAL_KEY,code);}catch{}return code;}
  function pending(){try{return validCode(localStorage.getItem(REFERRAL_KEY));}catch{return null;}}
  function clear(){try{localStorage.removeItem(REFERRAL_KEY);}catch{}}
  function session(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{return null;}}
  function banner(code){if(!code)return;const card=document.getElementById('authCard');if(!card||document.querySelector('[data-pp-referral-banner]'))return;const node=document.createElement('div');node.dataset.ppReferralBanner='1';node.style.cssText='margin:0 0 18px;padding:12px 15px;border:1px solid rgba(72,220,205,.28);border-radius:14px;background:rgba(22,207,192,.08);color:#bceee8;font:600 13px/1.4 Inter,system-ui,sans-serif';node.innerHTML=`Invited to ParlayPing · referral <strong style="color:#fff">${code}</strong>. Create your account and the invite will be credited automatically.`;card.prepend(node);}
  async function claim(){
    if(claimed)return true;const code=pending(),s=session();if(!code||!s?.access_token)return false;
    attempts++;
    try{
      const userResponse=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_KEY,authorization:`Bearer ${s.access_token}`}});if(!userResponse.ok)return false;const user=await userResponse.json();if(!user?.id)return false;
      const response=await fetch(`${SUPABASE_URL}/rest/v1/member_referrals`,{method:'POST',headers:{apikey:SUPABASE_KEY,authorization:`Bearer ${s.access_token}`,'content-type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({referred_user_id:user.id,referral_code_used:code})});
      if(response.ok||response.status===409){claimed=true;clear();return true;}
      if(response.status===400||response.status===403){clear();claimed=true;return false;}
    }catch{}
    return false;
  }
  function init(){const code=remember();banner(code);claim();const timer=setInterval(async()=>{if(claimed||attempts>=120){clearInterval(timer);return;}await claim();},1000);setTimeout(()=>clearInterval(timer),120000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();