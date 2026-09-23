(()=>{
  const mark=value=>{ document.documentElement.dataset.ppApprovedAssets=value; };
  const brand=document.querySelector('.brand');
  const hero=document.querySelector('.concept-hero');
  let ready=0;
  const done=()=>{ if(++ready===2) mark('ready'); };
  mark('loading');

  const headerImg=new Image();
  headerImg.onload=()=>{
    if(brand) brand.innerHTML='<img class="pp-brand-lockup" src="/parlayping-approved-wordmark.webp" alt="ParlayPing"><span class="pp-brand-name pp-brand-a11y">ParlayPing</span>';
    done();
  };
  headerImg.onerror=()=>mark('error');
  headerImg.src='/parlayping-approved-wordmark.webp';

  const heroImg=new Image();
  heroImg.onload=()=>{
    if(hero) hero.style.setProperty('--pp-hero-image',"url('/parlayping-approved-hero.webp')");
    done();
  };
  heroImg.onerror=()=>mark('error');
  heroImg.src='/parlayping-approved-hero.webp';
})();
