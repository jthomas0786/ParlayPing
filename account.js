(()=>{if(!document.querySelector('script[data-pp-app-nav]')){const script=document.createElement('script');script.src='/app-nav.js?v=20260924c';script.dataset.ppAppNav='1';document.head.appendChild(script);}})();
const SUPABASE_URL='https://avwqjgiitxqphvmitolw.supabase.co';
const SUPABASE_KEY='sb_publishable_7mYXjjkRrQq3iRig7UYHNQ_b6EZZiJA';
const SESSION_KEY='parlayping_supabase_session_v1';
const AVATAR_BUCKET='profile-avatars';
const AVATAR_SOURCE_LIMIT=20*1024*1024;
const AVATAR_SIZE=512;
const $=id=>document.getElementById(id);
let accountUser=null,accountProfile=null;

function show(id,message,error=false){const el=$(id);if(!el)return;el.textContent=message;el.classList.remove('hidden');el.classList.toggle('error',error);}
function hide(id){const el=$(id);if(el)el.classList.add('hidden');}
function getSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{return null;}}
function setSession(value){try{if(value)localStorage.setItem(SESSION_KEY,JSON.stringify(value));else localStorage.removeItem(SESSION_KEY);}catch{}}
function initials(value){return String(value||'PP').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join('')||'PP';}
function safeNext(){const value=new URLSearchParams(location.search).get('next');return value&&value.startsWith('/')&&!value.startsWith('//')?value:null;}
function safeAvatarUrl(value){try{const url=new URL(String(value||''),location.origin);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}}
function paintAvatar(node,name,url){if(!node)return;node.textContent='';const src=safeAvatarUrl(url);if(!src){node.textContent=initials(name);return;}const image=document.createElement('img');image.alt='';image.decoding='async';image.src=src;image.addEventListener('error',()=>{node.textContent=initials(name);},{once:true});node.appendChild(image);}

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

async function normalizeAvatar(file){
  if(!file)throw new Error('Choose an image first.');
  if(file.type&&!file.type.startsWith('image/'))throw new Error('Please choose an image file.');
  if(Number(file.size)>AVATAR_SOURCE_LIMIT)throw new Error('That photo is too large. Choose an image under 20 MB.');
  const source=URL.createObjectURL(file);
  try{
    const image=await new Promise((resolve,reject)=>{const node=new Image();node.onload=()=>resolve(node);node.onerror=()=>reject(new Error('That image format could not be opened. Try JPG, PNG, HEIC, or WebP.'));node.src=source;});
    const width=Number(image.naturalWidth)||0,height=Number(image.naturalHeight)||0;
    if(!width||!height)throw new Error('That image does not have a usable size.');
    const side=Math.min(width,height),sx=Math.max(0,(width-side)/2),sy=Math.max(0,(height-side)/2);
    const canvas=document.createElement('canvas');canvas.width=AVATAR_SIZE;canvas.height=AVATAR_SIZE;
    const context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('Your browser could not prepare the profile image.');
    context.drawImage(image,sx,sy,side,side,0,0,AVATAR_SIZE,AVATAR_SIZE);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.88));
    if(!blob)throw new Error('Your browser could not prepare the profile image.');
    return blob;
  }finally{URL.revokeObjectURL(source);}
}

async function uploadAvatar(blob,userId,token){
  const objectPath=`${encodeURIComponent(userId)}/avatar.jpg`;
  const response=await fetch(`${SUPABASE_URL}/storage/v1/object/${AVATAR_BUCKET}/${objectPath}`,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,authorization:`Bearer ${token}`,'content-type':'image/jpeg','cache-control':'3600','x-upsert':'true'},
    body:blob,
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload?.message||payload?.error||`Profile photo upload failed (${response.status}).`);
  return `${SUPABASE_URL}/storage/v1/object/public/${AVATAR_BUCKET}/${objectPath}?v=${Date.now()}`;
}

function consumeHashSession(){if(!location.hash.includes('access_token='))return;const params=new URLSearchParams(location.hash.slice(1));const access_token=params.get('access_token'),refresh_token=params.get('refresh_token'),expires_in=Number(params.get('expires_in')||3600);if(access_token&&refresh_token){setSession({access_token,refresh_token,expires_at:Math.floor(Date.now()/1000)+expires_in});history.replaceState({},'',location.pathname+location.search);}}
function renderAccount(data){const profile=data.profile||{},name=profile.display_name||data.user?.email?.split('@')[0]||'ParlayPing User',avatar=profile.avatar_url||'';accountUser=data.user||null;accountProfile=profile;$('authCard').classList.add('hidden');$('accountApp').classList.remove('hidden');$('accountName').textContent=name;paintAvatar($('accountAvatar'),name,avatar);paintAvatar($('avatarEditorPreview'),name,avatar);$('accountEmail').textContent=data.user?.email||'';$('displayName').value=profile.display_name||'';$('xUsername').value=profile.x_username||'';$('avatarUrl').value=avatar;$('websiteUrl').value=profile.website_url||'';$('avatarRemoveBtn')?.classList.toggle('hidden',!safeAvatarUrl(avatar));}
async function loadAccount({redirectIfNext=false}={}){try{const data=await api('/api/account');renderAccount(data);if(redirectIfNext&&safeNext())location.assign(safeNext());}catch(error){setSession(null);$('accountApp').classList.add('hidden');$('authCard').classList.remove('hidden');show('authStatus',error.message,true);}}

$('signInForm')?.addEventListener('submit',async event=>{event.preventDefault();hide('authStatus');const button=event.submitter;const old=button?.textContent;if(button){button.disabled=true;button.textContent='Signing in…';}try{const data=await supabase('/auth/v1/token?grant_type=password',{method:'POST',body:{email:$('loginEmail').value.trim(),password:$('loginPassword').value}});setSession(data);await loadAccount({redirectIfNext:true});}catch(error){show('authStatus',error.message,true);}finally{if(button){button.disabled=false;button.textContent=old;}}});
$('signUpForm')?.addEventListener('submit',async event=>{event.preventDefault();hide('authStatus');const button=event.submitter;const old=button?.textContent;if(button){button.disabled=true;button.textContent='Creating…';}try{const redirect='https://parlayping.net/account';const data=await supabase(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirect)}`,{method:'POST',body:{email:$('signupEmail').value.trim(),password:$('signupPassword').value,data:{name:$('signupName').value.trim()}}});if(data.access_token){setSession(data);await loadAccount({redirectIfNext:true});}else show('authStatus','Account created. Check your email to confirm your address, then come back and sign in.');}catch(error){show('authStatus',error.message,true);}finally{if(button){button.disabled=false;button.textContent=old;}}});
$('avatarFile')?.addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;hide('accountStatus');const label=document.querySelector('label[for="avatarFile"]'),old=label?.textContent;if(label){label.textContent='Uploading…';label.classList.add('is-busy');}try{if(!accountUser?.id)throw new Error('Please sign in again.');const session=await validSession();if(!session?.access_token)throw new Error('Please sign in again.');const blob=await normalizeAvatar(file);const avatarUrl=await uploadAvatar(blob,accountUser.id,session.access_token);const result=await api('/api/account',{method:'PATCH',body:{avatar_url:avatarUrl}});accountProfile=result.profile||{...(accountProfile||{}),avatar_url:avatarUrl};$('avatarUrl').value=avatarUrl;const name=$('displayName').value.trim()||$('accountName').textContent||'ParlayPing User';paintAvatar($('accountAvatar'),name,avatarUrl);paintAvatar($('avatarEditorPreview'),name,avatarUrl);$('avatarRemoveBtn')?.classList.remove('hidden');show('accountStatus','Profile picture updated.');}catch(error){show('accountStatus',error.message,true);}finally{event.target.value='';if(label){label.textContent=old||'Choose from device';label.classList.remove('is-busy');}}});
$('avatarRemoveBtn')?.addEventListener('click',async event=>{hide('accountStatus');const button=event.currentTarget,old=button.textContent;button.disabled=true;button.textContent='Removing…';try{const result=await api('/api/account',{method:'PATCH',body:{avatar_url:null}});accountProfile=result.profile||{...(accountProfile||{}),avatar_url:null};$('avatarUrl').value='';const name=$('displayName').value.trim()||$('accountName').textContent||'ParlayPing User';paintAvatar($('accountAvatar'),name,null);paintAvatar($('avatarEditorPreview'),name,null);button.classList.add('hidden');show('accountStatus','Profile picture removed.');}catch(error){show('accountStatus',error.message,true);}finally{button.disabled=false;button.textContent=old;}});
$('profileForm')?.addEventListener('submit',async event=>{event.preventDefault();hide('accountStatus');const button=event.submitter;const old=button?.textContent;if(button){button.disabled=true;button.textContent='Saving…';}try{await api('/api/account',{method:'PATCH',body:{display_name:$('displayName').value,x_username:$('xUsername').value,avatar_url:$('avatarUrl').value||null,website_url:$('websiteUrl').value}});show('accountStatus','Profile saved.');await loadAccount();}catch(error){show('accountStatus',error.message,true);}finally{if(button){button.disabled=false;button.textContent=old;}}});
$('signOutBtn')?.addEventListener('click',async()=>{const session=getSession();try{if(session?.access_token)await supabase('/auth/v1/logout',{method:'POST',token:session.access_token});}catch{}setSession(null);location.assign('/account');});

consumeHashSession();validSession().then(session=>{if(session?.access_token)loadAccount({redirectIfNext:Boolean(safeNext())});});
