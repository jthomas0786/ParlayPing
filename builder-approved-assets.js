(()=>{
  const q=(s,r=document)=>r.querySelector(s);
  const loadB64=async(path)=>{
    try{
      const res=await fetch(path,{cache:'force-cache'});
      if(!res.ok)return null;
      const raw=(await res.text()).trim();
      return raw||null;
    }catch{return null;}
  };

  (async()=>{
    const [wordmarkB64,heroB64]=await Promise.all([
      loadB64('/pp-wordmark-approved.b64'),
      loadB64('/pp-hero-approved.b64'),
    ]);

    const brand=q('.brand');
    if(brand&&wordmarkB64){
      brand.innerHTML=`<img class="pp-brand-lockup" src="data:image/webp;base64,${wordmarkB64}" alt="ParlayPing"/><span class="pp-brand-name pp-brand-a11y">ParlayPing</span>`;
    }

    const hero=q('.concept-hero');
    if(hero&&heroB64){
      hero.style.setProperty('--pp-hero-image',`url("data:image/webp;base64,${heroB64}")`);
    }
  })();
})();
