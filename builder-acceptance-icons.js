(()=>{
  const icons=[
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h8M16 7h4M4 17h4M12 17h8M4 12h3M11 12h9"/><circle cx="14" cy="7" r="2"/><circle cx="10" cy="17" r="2"/><circle cx="9" cy="12" r="2"/></svg>',
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2.2"/><circle cx="17" cy="6" r="2.2"/><circle cx="17" cy="18" r="2.2"/><path d="M8 11l7-4M8 13l7 4"/></svg>',
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 19V11M12 19V5M19 19v-8"/><path d="M3 19h18"/></svg>'
  ];
  document.querySelectorAll('.concept-hero.pp-acceptance-hero .hero-tool-icon').forEach((node,index)=>{
    if(icons[index])node.innerHTML=icons[index];
  });
})();
