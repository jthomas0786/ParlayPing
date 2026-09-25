(()=>{
  const brand=document.querySelector('.brand .pp-acceptance-lockup');
  if(brand){
    brand.classList.add('pp-approved-header-wordmark');
    brand.src='/parlayping-approved-wordmark.webp';
    brand.alt='ParlayPing';
    brand.dataset.approvedAsset='parlayping-approved-wordmark.webp';
  }

  const profileButton=document.querySelector('.profile-button');
  if(profileButton&&String(profileButton.textContent||'').trim().toUpperCase()==='JT'){
    profileButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="3.25" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 19c.7-4 3-6 6.5-6s5.8 2 6.5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    profileButton.setAttribute('aria-label','Sign in or open account');
    profileButton.dataset.signedOutProfile='true';
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
