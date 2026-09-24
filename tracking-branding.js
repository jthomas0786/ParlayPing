(()=>{
  const BRAND_CLASS='tracking-brand';
  function brandCard(card){
    const footer=card?.querySelector('.card-footer');
    if(!footer||footer.querySelector(`.${BRAND_CLASS}`))return;
    const brand=document.createElement('a');
    brand.className=BRAND_CLASS;
    brand.href='https://parlayping.net';
    brand.target='_blank';
    brand.rel='noopener noreferrer';
    brand.setAttribute('aria-label','Visit ParlayPing.net');
    brand.innerHTML='<img src="/parlayping-approved-lockup.svg" alt="ParlayPing"><span>ParlayPing.net</span>';
    footer.prepend(brand);
  }
  function sync(){document.querySelectorAll('.tracking-card').forEach(brandCard);}
  function start(){
    const grid=document.getElementById('trackingGrid');
    sync();
    if(!grid)return;
    const observer=new MutationObserver(sync);
    observer.observe(grid,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
