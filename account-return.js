(()=>{
  const params=new URLSearchParams(location.search);
  const raw=params.get('next');
  if(!raw||!raw.startsWith('/')||raw.startsWith('//'))return;
  const destination=raw;
  const sessionKey='parlayping_supabase_session_v1';
  const hasSession=()=>{try{return Boolean(JSON.parse(localStorage.getItem(sessionKey)||'null')?.access_token);}catch{return false;}};
  const go=()=>{if(hasSession())location.assign(destination);};
  if(hasSession()){go();return;}
  const consoleNode=document.getElementById('console');
  if(consoleNode)new MutationObserver(()=>{if(!consoleNode.classList.contains('hidden'))go();}).observe(consoleNode,{attributes:true,attributeFilter:['class']});
})();
