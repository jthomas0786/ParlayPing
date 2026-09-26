(()=>{
  const SUPABASE_URL='https://avwqjgiitxqphvmitolw.supabase.co';
  const SUPABASE_KEY='sb_publishable_7mYXjjkRrQq3iRig7UYHNQ_b6EZZiJA';
  const SESSION_KEY='parlayping_supabase_session_v1';
  const $=id=>document.getElementById(id);
  let session=null,user=null,profile=null,imageDataUrl=null,lastResult=null;

  function getSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{return null;}}
  function setSession(value){try{if(value)localStorage.setItem(SESSION_KEY,JSON.stringify(value));else localStorage.removeItem(SESSION_KEY);}catch{}}
  async function sb(path,{method='GET',body,token,prefer}={}){const headers={apikey:SUPABASE_KEY};if(token)headers.authorization=`Bearer ${token}`;if(body!==undefined)headers['content-type']='application/json';if(prefer)headers.Prefer=prefer;const r=await fetch(`${SUPABASE_URL}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),text=await r.text();let p=null;try{p=text?JSON.parse(text):null;}catch{p={message:text};}if(!r.ok)throw new Error(p?.message||p?.error_description||p?.error||`Request failed (${r.status})`);return p;}
  async function validSession(){let value=getSession();if(!value)return null;const expires=Number(value.expires_at||0)*1000;if(expires&&expires-Date.now()>60000)return value;if(!value.refresh_token)return value;try{value=await sb('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:value.refresh_token}});setSession(value);return value;}catch{setSession(null);return null;}}
  function status(message,type=''){const node=$('submitStatus');node.textContent=message||'';node.className=`submit-status${type?` ${type}`:''}`;}
  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function ready(){const button=$('verifyButton');button.disabled=!(session?.access_token&&imageDataUrl);}
  function renderAccount(){const box=$('accountState');if(!session?.access_token||!user){box.className='account-state';box.innerHTML=`Sign in to verify and publish community betslips. <a href="/account.html?next=/submit">Sign in / create account →</a>`;ready();return;}const name=profile?.display_name||user?.user_metadata?.name||user?.email?.split('@')[0]||'ParlayPing member',handle=String(profile?.x_username||'').replace(/^@/,'');box.className='account-state ready';box.innerHTML=`Submitting as <strong>${esc(name)}</strong>${handle?` · @${esc(handle)}`:''} <a href="/profile">Profile →</a>`;ready();}
  async function loadAccount(){session=await validSession();if(!session){renderAccount();return;}try{user=await sb('/auth/v1/user',{token:session.access_token});const rows=await sb(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=display_name,x_username&limit=1`,{token:session.access_token});profile=Array.isArray(rows)?rows[0]||{}:{};}catch{session=null;user=null;profile=null;}renderAccount();}

  async function compress(file){
    if(!/^image\/(jpeg|png|webp)$/i.test(file.type))throw new Error('Choose a JPG, PNG, or WebP screenshot.');
    if(file.size>12*1024*1024)throw new Error('That screenshot is too large. Choose an image under 12 MB.');
    const objectUrl=URL.createObjectURL(file);
    try{
      const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Could not read that image.'));img.src=objectUrl;});
      const max=1600,scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight)),width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale));
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);
      let quality=.84,data=canvas.toDataURL('image/jpeg',quality);while(data.length>2_900_000&&quality>.55){quality-=.08;data=canvas.toDataURL('image/jpeg',quality);}if(data.length>3_200_000)throw new Error('Please crop the screenshot tighter and try again.');return data;
    }finally{URL.revokeObjectURL(objectUrl);}
  }
  async function choose(file){if(!file)return;status('Preparing screenshot…');try{imageDataUrl=await compress(file);$('imagePreview').src=imageDataUrl;$('imagePreview').hidden=false;$('dropEmpty').hidden=true;$('replaceImage').hidden=false;status('Screenshot ready.');ready();}catch(error){imageDataUrl=null;$('imagePreview').hidden=true;$('dropEmpty').hidden=false;$('replaceImage').hidden=true;status(error.message,'error');ready();}}

  function authorName(){return String(profile?.display_name||user?.user_metadata?.name||user?.email?.split('@')[0]||'ParlayPing User').slice(0,80);}
  function xUsername(){const value=String(profile?.x_username||'').replace(/^@/,'').trim();return value?value.slice(0,50):null;}
  async function saveCommunity(result){
    const custom=String($('submissionTitle').value||'').trim(),body={user_id:user.id,share_token:result.shareToken,builder_url:result.builderUrl,title:(custom||result.title||'Community Parlay').slice(0,120),author_name:authorName(),x_username:xUsername(),sport:result.sport||null,leg_count:result.legCount,legs:result.legs,sportsbook:null,is_active:true,verified_pregame:true,source_url:result.sourceUrl||null,bet_probability_pct:result.betProbabilityPct,analysis_summary:result.analysisSummary};
    const saved=await sb('/rest/v1/community_parlays',{method:'POST',body,token:session.access_token,prefer:'return=representation'});return Array.isArray(saved)?saved[0]||body:body;
  }
  function shareCopy(result){const custom=String($('submissionTitle').value||'').trim();const title=custom||result.title||'My betslip';return `✓ ${title} verified pregame with ParlayPing. View it, tail it, or make your own changes: ${result.shareUrl}\n\nSubmit yours free: https://parlayping.net/submit`;}
  function showSuccess(result){lastResult=result;$('submitSuccess').hidden=false;$('successTitle').textContent=String($('submissionTitle').value||'').trim()||result.title||'Your betslip is ready.';$('successSummary').textContent=result.analysisSummary||`${result.legCount} legs verified pregame.`;$('openBuilder').href=result.builderUrl;$('openShare').href=result.shareUrl;$('submitSuccess').scrollIntoView({behavior:'smooth',block:'center'});}
  async function submit(){
    if(!session?.access_token){location.assign('/account.html?next=/submit');return;}if(!imageDataUrl){status('Add a betslip screenshot first.','error');return;}
    const button=$('verifyButton');button.disabled=true;button.textContent='Reading & verifying…';status('Parsing the screenshot and checking every event…');
    try{
      const response=await fetch('/api/community-submit',{method:'POST',headers:{authorization:`Bearer ${session.access_token}`,'content-type':'application/json'},body:JSON.stringify({imageDataUrl,sourceUrl:String($('sourceUrl').value||'').trim()||null})}),result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result?.error||`Verification failed (${response.status})`);
      status('Pregame verified. Adding it to Community…');await saveCommunity(result);showSuccess(result);status('Verified and added to Community.','success');button.textContent='Verified ✓';imageDataUrl=null;
    }catch(error){status(error.message||'Could not verify this betslip.','error');button.disabled=false;button.textContent='Verify & add to Community';}
  }
  async function copyResult(){if(!lastResult)return;try{await navigator.clipboard.writeText(shareCopy(lastResult));status('Share post copied.','success');}catch{status('Could not copy automatically.','error');}}
  async function shareResult(){if(!lastResult)return;const text=shareCopy(lastResult),title=String($('submissionTitle').value||'').trim()||lastResult.title||'ParlayPing verified betslip';try{if(navigator.share){await navigator.share({title,text,url:lastResult.shareUrl});return;}await navigator.clipboard.writeText(text);status('Share post copied.','success');}catch(error){if(error?.name!=='AbortError')status('Could not open sharing.','error');}}
  function wire(){
    const input=$('betImage'),drop=$('dropzone');input.addEventListener('change',()=>choose(input.files?.[0]));$('replaceImage').addEventListener('click',event=>{event.preventDefault();event.stopPropagation();input.click();});
    ['dragenter','dragover'].forEach(name=>drop.addEventListener(name,event=>{event.preventDefault();drop.classList.add('dragging');}));['dragleave','drop'].forEach(name=>drop.addEventListener(name,event=>{event.preventDefault();drop.classList.remove('dragging');}));drop.addEventListener('drop',event=>choose(event.dataTransfer?.files?.[0]));
    $('verifyButton').addEventListener('click',submit);$('copyResult').addEventListener('click',copyResult);$('shareResult').addEventListener('click',shareResult);
  }
  async function init(){wire();await loadAccount();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
