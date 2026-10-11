/* Parlay Ping powered by TSO 2.0: shared navigation shell.
 * Embedded TSO login handled by a separately verified account bridge.
 * Existing Render API, builder, tracker, billing, X and developer endpoints stay intact.
 */
(()=>{
  if(window.__TSO2_PARLAYPING_SHELL__)return;
  window.__TSO2_PARLAYPING_SHELL__=true;
  document.documentElement.dataset.tso2pp='true';
  // When shown inside the actual TSO 2.0 Parlay Ping tab, use the PARENT
  // site's sidebar and tabs: never nest a second TSO navigation / link hub.
  const inFrame=window.self!==window.top;
  let inTsoWorkspace=false;
  if(inFrame){
    try{
      const params=new URLSearchParams(location.search);
      if(params.get('tso_embed')==='1')sessionStorage.setItem('pp_tso2_embedded','1');
      inTsoWorkspace=sessionStorage.getItem('pp_tso2_embedded')==='1';
    }catch{inTsoWorkspace=new URLSearchParams(location.search).get('tso_embed')==='1';}
  }
  if(inTsoWorkspace){
    // Contain Parlay Ping's own routes, dynamically created betslip links, and
    // legacy absolute parlayping.net links in the TSO 2.0 workspace iframe.
    // External sportsbooks, payment processors and social shares keep their
    // intentional external destinations.
    const legacyHosts=new Set(['parlayping.net','www.parlayping.net','parlayping.onrender.com',
      'parlayping.thesportsoutpost.com']);
    const localDestination=(raw)=>{
      if(!raw||typeof raw!=='string'||/^(javascript|data|mailto|tel):/i.test(raw))return null;
      try {
        const u=new URL(raw,location.href);
        if(u.protocol!=='http:'&&u.protocol!=='https:')return null;
        if(u.origin!==location.origin&&!legacyHosts.has(u.hostname.toLowerCase()))return null;
        u.protocol=location.protocol;u.host=location.host;
        // An embedded return-to-home should return to the usable betslip
        // uploader, not Parlay Ping's standalone marketing landing page.
        if(u.pathname==='/'&&!u.hash&&[...u.searchParams.keys()].every(k=>k==='tso_embed'))
          u.pathname='/submit';
        // Preserve the app embedding flag when navigating to a fresh page.
        u.searchParams.set('tso_embed','1');
        return u;
      }catch{return null;}
    };
    const handleLink=(event)=>{
      if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey)return;
      const anchor=event.target?.closest?.('a[href]');
      if(!anchor||anchor.hasAttribute('download'))return;
      const href=anchor.getAttribute('href');
      if(href?.startsWith('#')||href?.startsWith('blob:'))return;
      const target=localDestination(href);
      if(!target)return;
      if(target.pathname==='/account.html'||target.pathname==='/account'){
        event.preventDefault();
        const intent=anchor.id==='signInLink'?'tso2-parlayping-signin-request':'tso2-parlayping-open-profile';
        window.parent.postMessage({type:intent},'https://thesportsoutpost.com');
        return;
      }
      event.preventDefault();
      // replace _blank/_top/_parent site jumps with same-frame navigation
      // so tracking, builder, slip, and sharing pages stay inside TSO.
      location.assign(target.href);
    };
    document.addEventListener('click',handleLink,true);
    document.addEventListener('submit',event=>{
      const form=event.target;
      if(!(form instanceof HTMLFormElement))return;
      const url=localDestination(form.getAttribute('action')||location.pathname);
      if(url){form.action=url.href;form.target='_self';}
    },true);
    const openOriginal=window.open.bind(window);
    window.open=function(url,target,features){
      const destination=localDestination(typeof url==='string'?url:'');
      if(destination){location.assign(destination.href);return window;}
      return openOriginal(url,target,features);
    };

    document.documentElement.dataset.tso2ppEmbed='true';
    const embeddedStyles=document.createElement('link');
    embeddedStyles.rel='stylesheet';embeddedStyles.href='/tso2-shell.css?v=20261010-embed';
    document.head.append(embeddedStyles);
    if(location.pathname==='/profile'||location.pathname==='/profile.html'){
      const profileStyles=document.createElement('link');
      profileStyles.rel='stylesheet';
      profileStyles.href='/tso2-profile-broadcast.css?v=20261010-native1';
      document.head.append(profileStyles);
    }
    if(location.pathname==='/submit'||location.pathname==='/submit.html'){
      const uploadStyles=document.createElement('link');
      uploadStyles.rel='stylesheet';
      uploadStyles.href='/tso2-submit-embed.css?v=20261010-theme2';
      document.head.append(uploadStyles);
      const broadcastStyles=document.createElement('link');
      broadcastStyles.rel='stylesheet';
      broadcastStyles.href='/tso2-submit-broadcast.css?v=20261010-broadcast';
      document.head.append(broadcastStyles);
      const draftStyles=document.createElement('link');
      draftStyles.rel='stylesheet';
      draftStyles.href='/tso2-props-builder.css?v=20261010-props1';
      document.head.append(draftStyles);
    }
    if(/^\\/build\\//.test(location.pathname)){
      const builderStyles=document.createElement('link');
      builderStyles.rel='stylesheet';
      builderStyles.href='/tso2-builder-broadcast.css?v=20261010-props1';
      document.head.append(builderStyles);
    }
    try{
      window.parent.postMessage({type:'tso2-parlayping-route',pathname:location.pathname,search:location.search},
        'https://thesportsoutpost.com');
    }catch{}
    // Parent TSO 2.0 owns the page scroll. Report rendered height so there is
    // never a second browser scrollbar trapped inside the Parlay Ping iframe.
    let heightTick=0,lastReported=0;
    const reportHeight=()=>{
      if(heightTick)return;
      heightTick=requestAnimationFrame(()=>{
        heightTick=0;
        const body=document.body;
        if(!body)return;
        const height=Math.max(400,Math.ceil(body.scrollHeight||0));
        if(Math.abs(height-lastReported)<2)return;
        lastReported=height;
        window.parent.postMessage({type:'tso2-parlayping-size',height},'https://thesportsoutpost.com');
      });
    };
    window.addEventListener('load',reportHeight);
    window.addEventListener('resize',reportHeight);
    document.addEventListener('DOMContentLoaded',()=>{
      reportHeight();
      if(typeof ResizeObserver==='function')new ResizeObserver(reportHeight).observe(document.body);
      if(typeof MutationObserver==='function')new MutationObserver(reportHeight)
        .observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class','style']});
    },{once:true});
    if(document.readyState!=='loading')reportHeight();
    return;
  }

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
  const iconLink='/parlayping-approved-hero.webp';
  const logo='/parlayping-approved-wordmark.webp';
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