(()=>{
  const VERSION='20260924c';
  const LINKS=[
    {key:'build',label:'Build',icon:'⚡',href:'/'},
    {key:'explore',label:'Explore',icon:'⊕',href:'/#trending'},
    {key:'community',label:'Community',icon:'◇',href:'/profile?tab=community'},
    {key:'insights',label:'Insights',icon:'▥',href:'/#communityInsights'},
    {key:'tracking',label:'Tracking',icon:'◎',href:'/profile'},
    {key:'account',label:'Account',icon:'◉',href:'/account.html'}
  ];

  function injectCss(){
    if(document.querySelector('link[data-pp-app-nav-css]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=`/app-nav.css?v=${VERSION}`;
    link.dataset.ppAppNavCss='1';
    document.head.appendChild(link);
  }

  function activeKey(){
    const path=String(location.pathname||'/').toLowerCase();
    const hash=String(location.hash||'').toLowerCase();
    const params=new URLSearchParams(location.search);
    if(path==='/profile'||path==='/profile.html')return params.get('tab')==='community'?'community':'tracking';
    if(path==='/account'||path==='/account.html')return 'account';
    if(path.startsWith('/build/')||path==='/build'||path.startsWith('/tail'))return 'build';
    if(hash.includes('communityinsights')||hash.includes('insights'))return 'insights';
    if(hash.includes('trending')||hash.includes('similar')||hash.includes('explore'))return 'explore';
    if(hash.includes('community'))return 'community';
    return 'build';
  }

  function linkHtml(link,mobile=false){
    return `<a class="${mobile?'pp-app-mobile-link':'pp-app-nav-link'}" data-pp-route="${link.key}" href="${link.href}"><span class="pp-app-nav-icon" aria-hidden="true">${link.icon}</span><span>${link.label}</span></a>`;
  }

  function markup(){
    return `<header class="pp-app-header" data-pp-app-nav>
      <div class="pp-app-nav-shell">
        <a class="pp-app-brand" href="/" aria-label="ParlayPing home"><img src="/parlayping-approved-lockup.svg" alt="ParlayPing"></a>
        <nav class="pp-app-nav-links" aria-label="Primary navigation">${LINKS.map(link=>linkHtml(link)).join('')}</nav>
        <button class="pp-app-menu-button" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="ppAppMobileMenu"><span></span><span></span><span></span></button>
      </div>
      <nav class="pp-app-mobile-menu" id="ppAppMobileMenu" aria-label="Mobile navigation" hidden>${LINKS.map(link=>linkHtml(link,true)).join('')}</nav>
    </header>`;
  }

  function syncActive(){
    const active=activeKey();
    document.querySelectorAll('[data-pp-route]').forEach(node=>{
      const on=node.dataset.ppRoute===active;
      node.classList.toggle('active',on);
      if(on)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');
    });
  }

  function init(){
    if(document.querySelector('[data-pp-app-nav]')){syncActive();return;}
    injectCss();
    const current=document.querySelector('header.app-header, header.site-header, header.pp-home-header');
    if(current)current.outerHTML=markup();
    else document.body.insertAdjacentHTML('afterbegin',markup());
    const button=document.querySelector('.pp-app-menu-button');
    const menu=document.getElementById('ppAppMobileMenu');
    button?.addEventListener('click',()=>{
      const open=menu?.hasAttribute('hidden');
      if(!menu)return;
      if(open)menu.removeAttribute('hidden');else menu.setAttribute('hidden','');
      button.setAttribute('aria-expanded',String(open));
      document.body.classList.toggle('pp-app-menu-open',open);
    });
    menu?.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{menu.setAttribute('hidden','');button?.setAttribute('aria-expanded','false');document.body.classList.remove('pp-app-menu-open');}));
    window.addEventListener('hashchange',syncActive);
    window.addEventListener('popstate',syncActive);
    syncActive();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
