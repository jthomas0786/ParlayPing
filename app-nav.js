(()=>{
  const VERSION='20260925b';
  const LINKS=[
    {key:'build',label:'Build',icon:'⚡',href:'/'},
    {key:'explore',label:'Explore',icon:'⊕',href:'/#trending'},
    {key:'community',label:'Community',icon:'♧',href:'/profile?tab=community'},
    {key:'insights',label:'Insights',icon:'▥',href:'/#communityInsights',iconClass:'bars'}
  ];

  function injectCss(){
    if(document.querySelector('link[data-pp-app-nav-css]')||[...document.styleSheets].some(sheet=>String(sheet.href||'').includes('/app-nav.css')))return;
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
    if((path==='/profile'||path==='/profile.html')&&params.get('tab')==='community')return 'community';
    if(hash.includes('communityinsights')||hash.includes('insights'))return 'insights';
    if(hash.includes('trending')||hash.includes('similar')||hash.includes('explore'))return 'explore';
    if(hash.includes('community'))return 'community';
    if(path==='/'||path==='/index.html'||path.startsWith('/build/')||path==='/build'||path.startsWith('/tail'))return 'build';
    return null;
  }

  function linkHtml(link){
    const iconClass=link.iconClass?` ${link.iconClass}`:'';
    return `<a class="pp-builder-nav-item" data-pp-route="${link.key}" href="${link.href}"><span class="pp-builder-nav-icon${iconClass}" aria-hidden="true">${link.icon}</span><span>${link.label}</span></a>`;
  }

  function accountGlyph(){
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="3.25" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 19c.7-4 3-6 6.5-6s5.8 2 6.5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  }

  function markup(){
    return `<header class="pp-builder-header" data-pp-app-nav>
      <div class="pp-builder-shell pp-builder-header-inner">
        <a class="pp-builder-brand" href="/" aria-label="ParlayPing home"><img src="/parlayping-approved-wordmark.webp" alt="ParlayPing"></a>
        <nav class="pp-builder-main-nav" aria-label="Primary navigation">${LINKS.map(linkHtml).join('')}</nav>
        <div class="pp-builder-header-actions">
          <button class="pp-builder-round-button pp-builder-search-button" type="button" aria-label="Search" title="Search">⌕</button>
          <a class="pp-builder-round-button pp-builder-notification-button" href="/profile" aria-label="Notifications and Tracking" title="Notifications and Tracking">♧<span class="pp-builder-notification-badge">3</span></a>
          <a class="pp-builder-profile-button" href="/account.html" aria-label="Sign in or open account" title="Account">${accountGlyph()}</a>
        </div>
      </div>
    </header>`;
  }

  function syncActive(){
    const active=activeKey();
    document.querySelectorAll('[data-pp-route]').forEach(node=>{
      const on=Boolean(active)&&node.dataset.ppRoute===active;
      node.classList.toggle('active',on);
      if(on)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');
    });
    const path=String(location.pathname||'/').toLowerCase();
    document.querySelector('.pp-builder-notification-button')?.classList.toggle('active',path==='/profile'||path==='/profile.html');
    document.querySelector('.pp-builder-profile-button')?.classList.toggle('active',path==='/account'||path==='/account.html');
  }

  function wireActions(){
    document.querySelector('.pp-builder-search-button')?.addEventListener('click',()=>{
      const searchTarget=document.querySelector('[data-pp-search],#searchInput,input[type="search"]');
      if(searchTarget&&typeof searchTarget.focus==='function'){searchTarget.focus();return;}
      location.assign('/#trending');
    });
  }

  function init(){
    injectCss();
    const existing=document.querySelector('header[data-pp-app-nav]');
    if(existing&&existing.classList.contains('pp-builder-header')){syncActive();return;}
    const current=document.querySelector('header.app-header, header.site-header, header.pp-home-header, header[data-pp-app-nav]');
    if(current)current.outerHTML=markup();
    else if(document.body)document.body.insertAdjacentHTML('afterbegin',markup());
    else return;
    wireActions();
    window.addEventListener('hashchange',syncActive);
    window.addEventListener('popstate',syncActive);
    syncActive();
    document.documentElement.dataset.ppUnifiedNav='builder';
  }

  if(document.body)init();
  else document.addEventListener('DOMContentLoaded',init,{once:true});
})();
