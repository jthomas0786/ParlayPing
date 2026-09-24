(()=>{
  const state=window.__PARLAYPING_BUILDER__||{};
  const token=String(state.token||'').trim();
  const storageKey=token?`parlayping_custom_title_${token}`:'parlayping_custom_title_draft';
  const q=(s,r=document)=>r.querySelector(s);
  let editing=false;

  function toast(message){const node=q('#toast');if(!node)return;node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),2600);}
  function titleParts(){const heading=q('#myParlayTitle');if(!heading)return{};const button=q('.edit-title',heading);const text=[...heading.childNodes].find(node=>node.nodeType===Node.TEXT_NODE);return{heading,button,text};}
  function savedTitle(){try{return String(localStorage.getItem(storageKey)||'').trim().slice(0,120);}catch{return'';}}
  function applyTitle(value){const{heading,text}=titleParts();if(!heading)return;const clean=String(value||'').replace(/\s+/g,' ').trim().slice(0,120)||'My Parlay';if(text)text.textContent=`${clean} `;else heading.insertBefore(document.createTextNode(`${clean} `),heading.firstChild);try{if(clean==='My Parlay')localStorage.removeItem(storageKey);else localStorage.setItem(storageKey,clean);}catch{}const summary=q('#ppTrackSummary strong');if(summary)summary.textContent=clean==='My Parlay'?`${(state.slip?.legs||[]).length}-Leg Parlay`:clean;return clean;}
  function startEdit(event){event?.preventDefault();event?.stopPropagation();if(editing)return;const{heading,button,text}=titleParts();if(!heading||!button)return;editing=true;const original=String(text?.textContent||'My Parlay').trim()||'My Parlay';if(text)text.textContent='';const input=document.createElement('input');input.className='pp-parlay-title-input';input.maxLength=120;input.value=original==='My Parlay'?'':original;input.placeholder='Name this parlay';input.setAttribute('aria-label','Custom parlay name');heading.insertBefore(input,button);button.textContent='✓';button.setAttribute('aria-label','Save parlay name');
    const finish=(save=true)=>{if(!editing)return;editing=false;const value=save?(input.value||'My Parlay'):original;input.remove();applyTitle(value);button.textContent='✎';button.setAttribute('aria-label','Rename parlay');};
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();finish(true);}else if(e.key==='Escape'){e.preventDefault();finish(false);}});
    input.addEventListener('blur',()=>finish(true),{once:true});
    input.focus();input.select();
  }
  function installTitle(){const{button}=titleParts();if(!button)return;const saved=savedTitle();if(saved)applyTitle(saved);button.addEventListener('click',startEdit);}
  async function enableAlertsFromTrack(event){const button=event.target.closest('#ppTrackConfirm');if(!button||!window.ParlayPingPush)return;try{await window.ParlayPingPush.enable();toast('Movement alerts are on for your tracked parlays.');}catch(error){const message=String(error?.message||'');if(/turned off|not available|Home Screen/i.test(message))toast(message);}}
  function installPush(){window.ParlayPingPush?.register?.().catch(()=>{});document.addEventListener('click',enableAlertsFromTrack,true);}
  installTitle();installPush();
})();
