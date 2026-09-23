(()=>{
  const q=(s,r=document)=>r.querySelector(s);
  const mark=(value)=>{document.documentElement.dataset.ppApprovedAssets=value;};
  const loadB64=async(path)=>{
    const res=await fetch(path,{cache:'force-cache'});
    if(!res.ok)throw new Error(`asset ${path} ${res.status}`);
    const raw=(await res.text()).trim();
    if(!raw)throw new Error(`asset ${path} empty`);
    return raw;
  };

  mark('loading');
  (async()=>{
    try{
      const [wordmarkB64,heroB64]=await Promise.all([
        loadB64('/pp-wordmark-approved.b64'),
        loadB64('/pp-hero-approved.b64'),
      ]);

      const brand=q('.brand');
      if(brand){
        brand.innerHTML=`<img class="pp-brand-lockup" src="data:image/webp;base64,${wordmarkB64}" alt="ParlayPing"/><span class="pp-brand-name pp-brand-a11y">ParlayPing</span>`;
      }

      const hero=q('.concept-hero');
      if(hero){
        hero.style.setProperty('--pp-hero-image',`url("data:image/webp;base64,${heroB64}")`);
      }
      mark('ready');
    }catch(error){
      console.error('ParlayPing approved logo assets failed',error);
      mark('error');
    }
  })();
})();
