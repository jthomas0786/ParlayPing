/* Parlay Ping powered by TSO 2.0: shared navigation shell.
 * Visual integration only: no account/session migration, no speculative live data.
 * Existing Render API, builder, tracker, billing, X and developer endpoints stay intact.
 */
(()=>{
  if(window.__TSO2_PARLAYPING_SHELL__)return;
  window.__TSO2_PARLAYPING_SHELL__=true;
  document.documentElement.dataset.tso2pp='true';
  const tso='https://thesportsoutpost.com';
  const dest=[
    ['live','LIVE','Games & scores','📈',tso+'/#live'],
    ['research','RESEARCH','Deep analysis','▥',tso+'/#research'],
    ['models','MODELS','Model boards','◈',tso+'/#models'],
    ['gameedge','GAME EDGE','Spread · ML · Total','◎',tso+'/#gameedge'],
    ['props','PROPS','Player prop tool','◉',tso+'/#props'],
    ['parlays','PARLAY PING','Tag · Track · Tail','', '/'],
    ['community','COMMUNITY','Outpost activity','▣',tso+'/#community'],
    ['leaderboard','RANKINGS','Leaderboards','♜',tso+'/#leaderboard']
  ];
  const tools=[
    ['BUILD','/', 'build'],
    ['UPLOAD SLIP','/submit','submit'],
    ['TRENDING','/trending','trending'],
    ['MY PARLAYS','/profile','profile'],
    ['COMMUNITY','/profile?tab=community','community'],
    ['API & ACCOUNT','/account.html','account']
  ];
  const sourcePath=String(location.pathname||'/').toLowerCase();
  const selected=sourcePath.includes('profile')?'profile':sourcePath.includes('submit')?'submit':sourcePath.includes('trend')?'trending':sourcePath.includes('account')?'account':'build';
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const iconLink='https://www.parlayping.net/parlayping-approved-hero.webp';
  const logo='https://www.parlayping.net/parlayping-approved-wordmark.webp';
  function shell(){
    const nav=dest.map(([key,title,copy,glyph,url])=>`
      <a class="tso2pp-side-item ${key==='parlays'?'is-current':''}" href="${url}" ${url.startsWith('https:')?'':'aria-current="page"'}>
        ${key==='parlays'?'<img src="'+esc(iconLink)+'" alt="" />':'<span class="tso2pp-side-glyph" aria-hidden="true">'+esc(glyph)+'</span>'}
        <span class="tso2pp-side-copy"><strong>${title}</strong><small>${copy}</small></span>
      </a>`).join('');
    const tabs=tools.map(([title,url,key])=>`<a href="${url}" class="${key===selected?'is-active':''}" ${key===selected?'aria-current="page"':''}>${title}</a>`).join('');
    return `<div class="tso2pp-mobile-shade" data-tso2pp-close hidden></div>
      <aside class="tso2pp-sidebar" aria-label="The Sports Outpost navigation">
        <div class="tso2pp-brand"><a href="${tso}/" title="The Sports Outpost"><img src="${tso}/brand/approved/tso2-wordmark-horizontal-approved.webp" alt="The Sports Outpost" /></a><button data-tso2pp-close class="tso2pp-close" aria-label="Close menu">×</button></div>
        <nav class="tso2pp-side-nav">${nav}</nav>
        <div class="tso2pp-sports-label">SPORTS</div>
        <nav class="tso2pp-sports" aria-label="Sports on The Sports Outpost">
          ${[['ALL','All Sports'],['NHL','Hockey'],['NFL','Football'],['MLB','Baseball'],['NBA','Basketball']].map(([s,t])=>`<a href="${tso}/#${s==='ALL'?'live':'models'}" title="${s} on TSO"><b>${s}</b><span>${t}</span></a>`).join('')}
        </nav>
        <div class="tso2pp-side-footer"><span class="tso2pp-live-led"></span> TSO 2.0 · PARLAY PING</div>
      </aside>
      <header class="tso2pp-topbar">
        <button class="tso2pp-menu-btn" data-tso2pp-open aria-label="Open navigation" aria-expanded="false">☰</button>
        <a href="/" class="tso2pp-context"><span>THE SPORTS OUTPOST</span><strong>PARLAY PING</strong></a>
        <nav class="tso2pp-tool-nav" aria-label="Parlay Ping tools">${tabs}</nav>
        <div class="tso2pp-actions">
          <a href="/trending" class="tso2pp-action" title="Explore trending" aria-label="Explore trending">⌕</a>
          <a href="/profile" class="tso2pp-action" title="My tracking" aria-label="My tracking">♧</a>
          <a href="/account.html" class="tso2pp-profile" title="Account and API">ACCOUNT <span>▾</span></a>
        </div>
      </header>
      <div class="tso2pp-product-bar">
        <img src="${logo}" alt="Parlay Ping approved logo" />
        <div><span>POWERED BY THE SPORTS OUTPOST</span><strong>Tag it. Track it. Tail what's left.</strong></div>
        <a href="/submit">TRACK A PARLAY ↗</a>
      </div>`;
  }
  function init(){
    if(document.querySelector('.tso2pp-sidebar'))return;
    if(!document.body)return;
    document.body.insertAdjacentHTML('afterbegin',shell());
    const sidebar=document.querySelector('.tso2pp-sidebar');
    const shade=document.querySelector('.tso2pp-mobile-shade');
    const menu=document.querySelector('[data-tso2pp-open]');
    const toggle=open=>{
      sidebar?.classList.toggle('is-open',open);
      if(shade)shade.hidden=!open;
      if(menu)menu.setAttribute('aria-expanded',open?'true':'false');
      document.body.classList.toggle('tso2pp-nav-open',open);
    };
    menu?.addEventListener('click',()=>toggle(!sidebar?.classList.contains('is-open')));
    document.querySelectorAll('[data-tso2pp-close]').forEach(x=>x.addEventListener('click',()=>toggle(false)));
    document.addEventListener('keydown',event=>{if(event.key==='Escape')toggle(false)});
  }
  const css=document.createElement('link');css.rel='stylesheet';css.href='/tso2-shell.css?v=20261010a';css.dataset.tso2ppCss='1';document.head.append(css);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();