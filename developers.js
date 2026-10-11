(()=>{'use strict';
  const PLAN_IDS=new Set(['starter','pro','business']);
  document.querySelectorAll('[data-api-plan]').forEach(link=>{
    link.addEventListener('click',event=>{
      const plan=String(link.dataset.apiPlan||'').trim().toLowerCase();
      if(!PLAN_IDS.has(plan)){event.preventDefault();return;}
      // Plans are selected in the account dashboard. Never auto-start a charge or a test Checkout session.
      const account=new URL('/account',location.origin);
      account.searchParams.set('next',`/profile?tab=dev&plan=${plan}`);
      link.href=account.pathname+account.search;
    });
  });
})();