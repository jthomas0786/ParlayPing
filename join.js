(()=>{
  const SUPABASE_URL='https://avwqjgiitxqphvmitolw.supabase.co';
  const SUPABASE_KEY='sb_publishable_7mYXjjkRrQq3iRig7UYHNQ_b6EZZiJA';
  const REFERRAL_KEY='parlayping_referral_code_v1';
  const valid=value=>{const code=String(value||'').trim().toUpperCase();return /^[A-Z0-9][A-Z0-9_-]{1,23}$/.test(code)?code:null;};
  function referral(){const query=valid(new URLSearchParams(location.search).get('ref'));if(query)return query;const match=location.pathname.match(/^\/join\/([^/]+)/i);return valid(match?.[1]);}
  function safeNext(){const value=new URLSearchParams(location.search).get('next');return value&&value.startsWith('/')&&!value.startsWith('//')?value:'/submit';}
  function save(code){if(!code)return;try{localStorage.setItem(REFERRAL_KEY,code);}catch{}}
  function accountHref(code){const params=new URLSearchParams();if(code)params.set('ref',code);params.set('next',safeNext());return `/account.html?${params.toString()}`;}
  async function badge(code){if(!code)return null;const response=await fetch(`${SUPABASE_URL}/rest/v1/member_badges?referral_code=eq.${encodeURIComponent(code)}&select=referral_code,founding_number,invite_count,verified_submission_count&limit=1`,{headers:{apikey:SUPABASE_KEY}});if(!response.ok)return null;const rows=await response.json();return Array.isArray(rows)?rows[0]||null:null;}
  async function init(){
    const code=referral(),codeNode=document.getElementById('inviteCode'),badgeNode=document.getElementById('inviteBadge'),join=document.getElementById('joinCta'),signin=document.getElementById('signInCta');
    if(!code){codeNode.textContent='Open invitation';badgeNode.textContent='No referral code is required. You can still join and submit your first verified betslip.';return;}
    save(code);join.href=signin.href=accountHref(code);codeNode.textContent=code;
    try{const row=await badge(code);if(!row){badgeNode.textContent='This referral code is not active. You can still create an account normally.';try{localStorage.removeItem(REFERRAL_KEY);}catch{}join.href=signin.href=accountHref(null);return;}if(row.founding_number)badgeNode.textContent=`Invited by Founding Member #${String(row.founding_number).padStart(3,'0')} · ${row.invite_count||0} member invite${Number(row.invite_count)===1?'':'s'}`;else badgeNode.textContent='Active ParlayPing member referral · your invite will be credited when you sign in.';}catch{badgeNode.textContent='Referral saved. Continue to create your ParlayPing account.';}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();