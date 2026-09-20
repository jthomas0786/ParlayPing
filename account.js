const SUPABASE_URL='https://avwqjgiitxqphvmitolw.supabase.co';
const SUPABASE_KEY='sb_publishable_7mYXjjkRrQq3iRig7UYHNQ_b6EZZiJA';
const SESSION_KEY='parlayping_supabase_session_v1';

const $=id=>document.getElementById(id);
function show(id,msg){const el=$(id);el.textContent=msg;el.classList.remove('hidden');}
function hide(id){$(id).classList.add('hidden');}
function getSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{return null;}}
function setSession(v){if(v)localStorage.setItem(SESSION_KEY,JSON.stringify(v));else localStorage.removeItem(SESSION_KEY);}
function authHeaders(token){return{apikey:SUPABASE_KEY,authorization:`Bearer ${token}`,'content-type':'application/json'};}

async function supabase(path,{method='GET',body,token}={}){
  const r=await fetch(`${SUPABASE_URL}${path}`,{method,headers:token?authHeaders(token):{apikey:SUPABASE_KEY,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text();let payload={};try{payload=text?JSON.parse(text):{};}catch{payload={message:text};}
  if(!r.ok)throw new Error(payload?.msg||payload?.message||payload?.error_description||payload?.error||`Request failed (${r.status})`);
  return payload;
}

async function refreshSession(session){
  if(!session?.refresh_token)return null;
  try{
    const fresh=await supabase('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});
    setSession(fresh);return fresh;
  }catch{setSession(null);return null;}
}

async function validSession(){
  let s=getSession();if(!s)return null;
  const exp=Number(s.expires_at||0)*1000;
  if(!exp||exp-Date.now()<60000)s=await refreshSession(s);
  return s;
}

async function api(path,{method='GET',body}={}){
  const s=await validSession();if(!s?.access_token)throw new Error('Please sign in again.');
  const r=await fetch(path,{method,headers:{authorization:`Bearer ${s.access_token}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(payload?.error||`Request failed (${r.status})`);
  return payload;
}

function consumeHashSession(){
  if(!location.hash.includes('access_token='))return;
  const p=new URLSearchParams(location.hash.slice(1));
  const access_token=p.get('access_token'),refresh_token=p.get('refresh_token'),expires_in=Number(p.get('expires_in')||3600);
  if(access_token&&refresh_token){setSession({access_token,refresh_token,expires_at:Math.floor(Date.now()/1000)+expires_in});history.replaceState({},'',location.pathname+location.search);}
}

async function loadAccount(){
  try{
    const data=await api('/api/account');
    $('authCard').classList.add('hidden');$('console').classList.remove('hidden');
    $('accountEmail').textContent=data.user?.email||'';
    $('displayName').value=data.profile?.display_name||'';
    $('xUsername').value=data.profile?.x_username||'';
    $('companyName').value=data.profile?.company_name||data.profile?.developer_name||'';
    $('websiteUrl').value=data.profile?.website_url||'';
    const usage=data.usage||{};$('planName').textContent=String(usage.plan||'free').toUpperCase();$('usageUsed').textContent=usage.monthlyUsed??0;$('usageLimit').textContent=usage.monthlyLimit??0;$('minuteLimit').textContent=usage.rateLimitPerMinute??0;$('keyLimit').textContent=usage.maxApiKeys??0;
    renderKeys(data.apiKeys||[]);
  }catch(error){setSession(null);$('console').classList.add('hidden');$('authCard').classList.remove('hidden');show('authStatus',error.message);}
}

function renderKeys(keys){
  const list=$('keysList');list.innerHTML='';
  if(!keys.length){const d=document.createElement('div');d.className='muted';d.textContent='No API keys yet.';list.appendChild(d);return;}
  for(const key of keys){
    const item=document.createElement('div');item.className='item row';item.style.justifyContent='space-between';
    const info=document.createElement('div');const title=document.createElement('strong');title.textContent=key.name;const meta=document.createElement('div');meta.className='muted';meta.textContent=`${key.key_prefix}… · ${key.revoked_at?'revoked':key.last_used_at?'last used '+new Date(key.last_used_at).toLocaleString():'never used'}`;info.append(title,meta);
    const b=document.createElement('button');b.className='danger';b.textContent='Revoke';b.disabled=Boolean(key.revoked_at);b.addEventListener('click',()=>revokeKey(key.id));
    item.append(info,b);list.appendChild(item);
  }
}

async function revokeKey(id){if(!confirm('Revoke this API key? This cannot be undone.'))return;try{await api('/api/api-keys',{method:'DELETE',body:{id}});await loadAccount();}catch(e){show('consoleStatus',e.message);}}

$('signInForm').addEventListener('submit',async e=>{e.preventDefault();hide('authStatus');try{const data=await supabase('/auth/v1/token?grant_type=password',{method:'POST',body:{email:$('loginEmail').value.trim(),password:$('loginPassword').value}});setSession(data);await loadAccount();}catch(err){show('authStatus',err.message);}});
$('signUpForm').addEventListener('submit',async e=>{e.preventDefault();hide('authStatus');try{const redirect=encodeURIComponent('https://parlayping.net/account');const data=await supabase(`/auth/v1/signup?redirect_to=${redirect}`,{method:'POST',body:{email:$('signupEmail').value.trim(),password:$('signupPassword').value,data:{name:$('signupName').value.trim()}}});if(data.access_token){setSession(data);await loadAccount();}else show('authStatus','Account created. Check your email to confirm your address, then return here to sign in.');}catch(err){show('authStatus',err.message);}});
$('signOutBtn').addEventListener('click',async()=>{const s=getSession();try{if(s?.access_token)await supabase('/auth/v1/logout',{method:'POST',token:s.access_token});}catch{}setSession(null);location.reload();});
$('profileForm').addEventListener('submit',async e=>{e.preventDefault();hide('consoleStatus');try{await api('/api/account',{method:'PATCH',body:{display_name:$('displayName').value,x_username:$('xUsername').value,company_name:$('companyName').value,website_url:$('websiteUrl').value}});show('consoleStatus','Profile saved.');await loadAccount();}catch(err){show('consoleStatus',err.message);}});
$('keyForm').addEventListener('submit',async e=>{e.preventDefault();hide('consoleStatus');hide('newKeyBox');try{const data=await api('/api/api-keys',{method:'POST',body:{name:$('keyName').value.trim()}});$('newKey').textContent=data.key?.key||'';$('newKeyBox').classList.remove('hidden');$('keyName').value='';await loadAccount();}catch(err){show('consoleStatus',err.message);}});

consumeHashSession();validSession().then(s=>{if(s?.access_token)loadAccount();});
