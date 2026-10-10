/* Parlay Ping app-wide navigation now uses the approved TSO 2.0 shell.
 * This loader also runs in generated builder/share HTML endpoints.
 */
(()=>{
  if(document.querySelector('script[data-tso2pp-shell]')||window.__TSO2_PARLAYPING_SHELL__)return;
  const script=document.createElement('script');
  script.src='/tso2-shell.js?v=20261010a';script.defer=true;
  script.dataset.tso2ppShell='1';document.head.append(script);
})();
