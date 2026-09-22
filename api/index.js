const accountRouter=require('../server/api/account-router');
const analyze=require('../server/api/analyze');
const parse=require('../server/api/parse');
const shareCard=require('../server/api/share-card');
const sharePage=require('../server/api/share-page');
const status=require('../server/api/status');
const v1Analyze=require('../server/api/v1/analyze');
const v1Build=require('../server/api/v1/build');
const v1Share=require('../server/api/v1/share');
const xDryRun=require('../server/api/x-dry-run');
const xScheduler=require('../server/api/x-scheduler');
const xWorker=require('../server/api/x-worker');

const handlers={
  analyze,
  parse,
  status,
  account:accountRouter,
  'api-keys':accountRouter,
  plans:accountRouter,
  'billing-checkout':accountRouter,
  'billing-portal':accountRouter,
  'share-card':shareCard,
  'share-page':sharePage,
  'v1-analyze':v1Analyze,
  'v1-build':v1Build,
  'v1-share':v1Share,
  'x-dry-run':xDryRun,
  'x-scheduler':xScheduler,
  'x-worker':xWorker,
};

module.exports=async function handler(req,res){
  const raw=req.query?.__pp_route;
  const route=String(Array.isArray(raw)?raw[0]:raw||'').trim().toLowerCase();
  const selected=handlers[route];
  if(!selected){
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.status(404).json({ok:false,error:'Unknown ParlayPing API route.'});
  }
  if(selected===accountRouter){
    req.query=req.query&&typeof req.query==='object'?req.query:{};
    req.query.route=route;
  }
  return selected(req,res);
};
