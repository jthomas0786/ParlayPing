const sharePage=require('./share-page');

const NAV_SCRIPT='<script src="/app-nav.js?v=20260925b" data-pp-app-nav></script>';

module.exports=async function handler(req,res){
  const send=res.send?.bind(res);
  if(typeof send!=='function')return sharePage(req,res);
  res.send=(body)=>{
    let next=body;
    if(typeof next==='string'&&next.includes('</body>')&&!next.includes('data-pp-app-nav')){
      next=next.replace('</body>',`${NAV_SCRIPT}</body>`);
    }
    return send(next);
  };
  return sharePage(req,res);
};

module.exports.NAV_SCRIPT=NAV_SCRIPT;
