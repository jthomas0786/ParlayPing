/* TSO 2.0 first-party account bridge. No Parlay Ping registration required.
 * TSO Supabase JWT is transferred only by a trusted first-party parent frame,
 * verified against Supabase Auth and held in memory (never localStorage/URL).
 * All reads/writes use TSO RLS; no PP project token is fabricated. */
(()=>{
  const allowedParents=new Set(['https://thesportsoutpost.com','https://www.thesportsoutpost.com','https://staging.thesportsoutpost.com']);
  const params=new URLSearchParams(location.search);
  const embedded=window.parent!==window && (params.get('tso_embed')==='1'||sessionStorage.getItem('pp_tso2_embedded')==='1');
  if(!embedded)return;
  sessionStorage.setItem('pp_tso2_embedded','1');
  const base='https://hjhfbhpuuxnrexddplxd.supabase.co';
  const apikey='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqaGZiaHB1dXhucmV4ZGRwbHhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0OTY5ODQsImV4cCI6MjEwMjA3Mjk4NH0.6URv-aSJgFupp1dkO65AsTqPpZF_aUckczhxJZBWVJ0'; // Supabase's public anonymous/publishable client key; never service_role.
  let account=null,firstMessage=false,done;
  const ready=new Promise(resolve=>{done=resolve;});
  const headers=token=>({apikey,authorization:'Bearer '+token});
  function requestIdentity(){
    // Never send account secrets to the parent or the URL. Only request them.
    window.parent.postMessage({type:'tso2-parlayping-auth-request'},'*');
  }
  function requestSignIn(){window.parent.postMessage({type:'tso2-parlayping-signin-request'},'*');}
  function notify(){
    window.dispatchEvent(new CustomEvent('pp-tso-identity-changed',{detail:{signedIn:!!account,userId:account?.user?.id||null}}));
  }
  async function verify(token){
    if(!/^[A-Za-z0-9._-]{60,5000}$/.test(token||''))return null;
    const res=await fetch(base+'/auth/v1/user',{method:'GET',headers:headers(token),cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!res.ok)return null;
    const user=await res.json();
    if(!/^[0-9a-f-]{36}$/i.test(user?.id||''))return null;
    let displayName=user.user_metadata?.username||user.email?.split('@')[0]||'TSO Member';
    let avatarUrl=null;
    try{
      const profile=await fetch(base+'/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id)+'&select=username,avatar_url&limit=1',{headers:headers(token),cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(profile.ok){const row=(await profile.json())?.[0];displayName=row?.username||displayName;avatarUrl=row?.avatar_url||null;}
    }catch(_){ /* display-name fallback only; never a trust claim */ }
    return{access_token:token,__tso:true,user,profile:{display_name:String(displayName).slice(0,80),avatar_url:avatarUrl}};
  }
  let sequence=0;
  window.addEventListener('message',async event=>{
    if(event.source!==window.parent||!allowedParents.has(event.origin))return;
    if(event.data?.type!=='tso2-parlayping-auth')return;
    const generation=++sequence;
    const previous=account?.user?.id||null;
    const token=typeof event.data.accessToken==='string'?event.data.accessToken:'';
    let next=null;
    if(token){try{next=await verify(token);}catch(_){next=null;}}
    if(generation!==sequence)return;
    account=next;
    if(!firstMessage){firstMessage=true;done();}
    else if(previous!==(account?.user?.id||null)){
      notify();
      // Re-render forms on login/logout. Never carry over another user's data.
      if(previous!==null||account?.user?.id)location.reload();
    }
    notify();
  });
  // Browser gets one first-party handshake per page navigation. If a parent
  // never answers, the embedded tools display a TSO sign-in state (fail closed).
  window.addEventListener('DOMContentLoaded',requestIdentity,{once:true});
  if(document.readyState!=='loading')requestIdentity();
  async function whenReady(){
    await Promise.race([ready,new Promise(resolve=>setTimeout(resolve,10000))]);
    return account;
  }
  async function sb(path,{method='GET',body,token,prefer}={}){
    const state=await whenReady();
    if(!state?.access_token)throw new Error('Sign in to The Sports Outpost to save betslips.');
    if(path==='/auth/v1/user')return state.user;
    if(path.startsWith('/rest/v1/profiles?'))return[{...state.profile,x_username:null}];
    let route=String(path);
    if(route.startsWith('/rest/v1/tracked_parlays'))route=route.replace('/rest/v1/tracked_parlays','/rest/v1/tso2_parlayping_tracked');
    else if(route.startsWith('/rest/v1/community_parlays'))route=route.replace('/rest/v1/community_parlays','/rest/v1/tso2_parlayping_submissions');
    else throw new Error('This operation is not enabled for TSO account bridging.');
    const h=headers(state.access_token);
    if(body!==undefined)h['content-type']='application/json';
    if(prefer)h.Prefer=prefer;
    const response=await fetch(base+route,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
    const text=await response.text();
    let result;try{result=text?JSON.parse(text):null;}catch{result={message:text};}
    if(!response.ok)throw new Error(result?.message||result?.error||'TSO account storage unavailable ('+response.status+').');
    return result;
  }
  window.PP_TSO_AUTH={enabled:true,whenReady,sb,requestSignIn,requestIdentity};
})();
