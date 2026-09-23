(()=>{
  const brand=document.querySelector('.brand .pp-acceptance-lockup');
  if(brand){
    brand.classList.add('pp-approved-header-wordmark');
    brand.alt='ParlayPing';
    brand.dataset.approvedAsset='parlayping-approved-wordmark.webp';
  }

  const hero=document.querySelector('.concept-hero.pp-acceptance-hero')||document.querySelector('.concept-hero');
  if(hero&&!hero.querySelector('.pp-approved-hero-watermark')){
    const image=document.createElement('img');
    image.className='pp-approved-hero-watermark';
    image.src='/parlayping-approved-hero.webp';
    image.alt='';
    image.setAttribute('aria-hidden','true');
    image.dataset.approvedAsset='parlayping-approved-hero.webp';
    hero.prepend(image);
  }
  document.documentElement.dataset.ppApprovedBranding='ready';
})();
