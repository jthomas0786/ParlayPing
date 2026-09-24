(()=>{if(!document.querySelector('script[data-pp-app-nav]')){const script=document.createElement('script');script.src='/app-nav.js?v=20260924c';script.dataset.ppAppNav='1';document.head.appendChild(script);}})();
const SUPABASE_URL='https://avwqjgiitxqphvmitolw.supabase.co';
const SUPABASE_KEY='sb_publishable_7mYXjjkRrQq3iRig7UYHNQ_b6EZZiJA';
const SESSION_KEY='parlayping_supabase_session_v1';
const $=id=>document.getElementById(id);

function show(id,message,error=false){const el=$(id);if(!el)return;el.textContent=message;el.classList.remove('hidden');el.classList.toggle('error',error);}
function hide(id){const el=$(id);if(el)el.classList.add('hidden');}
function getSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{return null;}}
function setSession(value){try{if(value)localStorage.setItem(SESSION_KEY,JSON.stringify(value));else localStorage.removeItem(SESSION_KEY);}catch{}}
function initials(value){return String(value||'PP').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join('')||'PP';}
function safeNext(){const value=new URLSearchParams(location.search).get('next');return value&&value.startsWith('/')&&!value.startsWith('//')?value:null;}

async function supabase(path,{method='GET',body,token}={}){
  const headers={apikey:SUPABASE_KEY,'content-type':'application/json'};if(token)headers.authorization=`Bearer ${token}`;
  const response=await fetch(`${SUPABASE_URL}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await response.text();let payload={};try{payload=text?JSON.parse(text):{};}catch{payload={message:text};}
  if(!response.ok)throw new Error(payload?.msg||payload?.message||payload?.error_description||payload?.error||`Request failed (${response.status})`);
  return payload;
}
async function refreshSession(session){if(!session?.refresh_token)return null;try{const fresh=await supabase('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});setSession(fresh);return fresh;}catch{setSession(null);return null;}}
async function validSession(){let session=getSession();if(!session)return null;const exp=Number(session.expires_at||0)*1000;if(!exp||exp-Date.now()<60000)session=await refreshSession(session);return session;}
async function api(path,{method='GET',body}={}){const session=await validSession();if(!session?.access_token)throw new Error('Please sign in again.');const response=await fetch(path,{method,headers:{authorization:`Bearer ${session.access_token}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload?.error||`Request failed (${response.status})`);return payload;}

function consumeHashSession(){if(!location.hash.includes('access_token='))return;const params=new URLSearchParams(location.hash.slice(1));const access_token=params.get('access_token'),refresh_token=params.get('refresh_token'),expires_in=Number(params.get('expires_in')||3600);if(access_token&&refresh_token){setSession({access_token,refresh_token,expires_at:Math.floor(Date.now()/1000)+expires_in});history.replaceState({},'',location.pathname+location.search);}}
function renderAccount(data){const profile=data.profile||{},name=profile.display_name||data.user?.email?.split('@')[0]||'ParlayPing User';$('authCard').classList.add('hidden');$('accountApp').classList.remove('hidden');$('accountName').textContent=name;$('accountAvatar').textContent=initials(name);$('accountEmail').textContent=data.user?.email||'';$('displayName').value=profile.display_name||'';$('xUsername').value=profile.x_username||'';$('avatarUrl').value=profile.avatar_url||'';$('websiteUrl').value=profile.website_url||'';}
async function loadAccount({redirectIfNext=false}={}){try{const data=await api('/api/account');renderAccount(data);if(redirectIfNext&&safeNext())location.assign(safeNext());}catch(error){setSession(null);$('accountApp').classList.add('hidden');$('authCard').classList.remove('hidden');show('authStatus',error.message,true);}}

$('signInForm')?.addEventListener('submit',async event=>{event.preventDefault();hide('authStatus');const button=event.submitter;const old=button?.textContent;if(button){button.disabled=true;button.textContent='Signing in…';}try{const data=await supabase('/auth/v1/token?grant_type=password',{method:'POST',body:{email:$('loginEmail').value.trim(),password:$('loginPassword').value}});setSession(data);await loadAccount({redirectIfNext:true});}catch(error){show('authStatus',error.message,true);}finally{if(button){button.disabled=false;button.textContent=old;}}});
$('signUpForm')?.addEventListener('submit',async event=>{event.preventDefault();hide('authStatus');const button=event.submitter;const old=button?.textContent;if(button){button.disabled=true;button.textContent='Creating…';}try{const redirect='https://parlayping.net/account';const data=await supabase(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirect)}`,{method:'POST',body:{email:$('signupEmail').value.trim(),password:$('signupPassword').value,data:{name:$('signupName').value.trim()}}});if(data.access_token){setSession(data);await loadAccount({redirectIfNext:true});}else show('authStatus','Account created. Check your email to confirm your address, then come back and sign in.');}catch(error){show('authStatus',error.message,true);}finally{if(button){button.disabled=false;button.textContent=old;}}});
$('profileForm')?.addEventListener('submit',async event=>{event.preventDefault();hide('accountStatus');const button=event.submitter;const old=button?.textContent;if(button){button.disabled=true;button.textContent='Saving…';}try{await api('/api/account',{method:'PATCH',body:{display_name:$('displayName').value,x_username:$('xUsername').value,avatar_url:$('avatarUrl').value,website_url:$('websiteUrl').value}});show('accountStatus','Profile saved.');await loadAccount();}catch(error){show('accountStatus',error.message,true);}finally{if(button){button.disabled=false;button.textContent=old;}}});
$('signOutBtn')?.addEventListener('click',async()=>{const session=getSession();try{if(session?.access_token)await supabase('/auth/v1/logout',{method:'POST',token:session.access_token});}catch{}setSession(null);location.assign('/account');});

consumeHashSession();validSession().then(session=>{if(session?.access_token)loadAccount({redirectIfNext:Boolean(safeNext())});});
