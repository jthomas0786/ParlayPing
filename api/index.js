const loaders={
  analyze:()=>require('../server/api/analyze'),
  parse:()=>require('../server/api/parse'),
  status:()=>require('../server/api/status'),
  account:()=>require('../server/api/account-router'),
  'api-keys':()=>require('../server/api/account-router'),
  plans:()=>require('../server/api/account-router'),
  'billing-checkout':()=>require('../server/api/account-router'),
  'billing-portal':()=>require('../server/api/account-router'),
  'share-card':()=>require('../server/api/share-card'),
  'share-page':()=>require('../server/api/share-page'),
  'builder-page':()=>require('../server/api/builder-page'),
  'sportsbook-link':()=>require('../server/api/sportsbook-link'),
  'v1-analyze':()=>require('../server/api/v1/analyze'),
  'v1-build':()=>require('../server/api/v1/build'),
  'v1-share':()=>require('../server/api/v1/share'),
  'x-dry-run':()=>require('../server/api/x-dry-run'),
  'x-scheduler':()=>require('../server/api/x-scheduler'),
  'x-worker':()=>require('../server/api/x-worker'),
};

const accountRoutes=new Set(['account','api-keys','plans','billing-checkout','billing-portal']);

module.exports=async function handler(req,res){
  const raw=req.query?.__pp_route;
  const route=String(Array.isArray(raw)?raw[0]:raw||'').trim().toLowerCase();
  const load=loaders[route];
  if(!load){
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.status(404).json({ok:false,error:'Unknown ParlayPing API route.'});
  }

  let selected;
  try{
    selected=load();
  }catch(error){
    console.error('ParlayPing API route initialization failed',{route,error});
    if(!res.headersSent){
      res.setHeader('Cache-Control','no-store');
      res.setHeader('Content-Type','application/json; charset=utf-8');
      return res.status(500).json({ok:false,error:'ParlayPing API route failed to initialize.'});
    }
    throw error;
  }

  if(accountRoutes.has(route)){
    req.query=req.query&&typeof req.query==='object'?req.query:{};
    req.query.route=route;
  }

  try{
    return await selected(req,res);
  }catch(error){
    console.error('ParlayPing API route failed',{route,error});
    if(!res.headersSent){
      res.setHeader('Cache-Control','no-store');
      res.setHeader('Content-Type','application/json; charset=utf-8');
      return res.status(500).json({ok:false,error:'ParlayPing API request failed.'});
    }
    throw error;
  }
};
