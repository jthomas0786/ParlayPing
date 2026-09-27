const sharePage=require('./share-page');

const NAV_SCRIPT='<script src="/app-nav.js?v=20260926b" data-pp-app-nav></script>';

function safeReferral(req){
  const raw=Array.isArray(req?.query?.ref)?req.query.ref[0]:req?.query?.ref;
  const code=String(raw||'').trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{1,23}$/.test(code)?code:null;
}
function growthCta(req){
  const ref=safeReferral(req),href=ref?`/join/${encodeURIComponent(ref)}?next=%2Fsubmit`:'/submit';
  return `<style data-pp-share-growth>.pp-share-growth{max-width:980px;margin:22px auto 42px;padding:20px 22px;border:1px solid rgba(73,220,206,.24);border-radius:18px;background:linear-gradient(135deg,rgba(22,83,87,.24),rgba(7,28,41,.94));display:flex;align-items:center;justify-content:space-between;gap:18px;font-family:Inter,system-ui,sans-serif}.pp-share-growth-copy{display:grid;gap:5px}.pp-share-growth-copy strong{color:#f1fffc;font-size:17px}.pp-share-growth-copy span{color:#92b6b8;font-size:13px;line-height:1.45}.pp-share-growth a{flex:none;padding:11px 15px;border-radius:11px;background:#47d8ca;color:#03211f;text-decoration:none;font-size:13px;font-weight:900}@media(max-width:640px){.pp-share-growth{margin:18px 14px 30px;align-items:stretch;flex-direction:column}.pp-share-growth a{text-align:center}}</style><aside class="pp-share-growth" data-pp-share-growth><div class="pp-share-growth-copy"><strong>Got a slip of your own?</strong><span>Upload it, verify every leg before kickoff, and turn it into an editable ParlayPing page.${ref?' This invite credits the member who shared this page.':''}</span></div><a href="${href}">${ref?'Join & submit yours':'Submit yours free'} →</a></aside>`;
}

module.exports=async function handler(req,res){
  const send=res.send?.bind(res);
  if(typeof send!=='function')return sharePage(req,res);
  res.send=(body)=>{
    let next=body;
    if(typeof next==='string'&&next.includes('</body>')){
      if(!next.includes('data-pp-share-growth'))next=next.replace('</body>',`${growthCta(req)}</body>`);
      if(!next.includes('data-pp-app-nav'))next=next.replace('</body>',`${NAV_SCRIPT}</body>`);
    }
    return send(next);
  };
  return sharePage(req,res);
};

module.exports.NAV_SCRIPT=NAV_SCRIPT;
module.exports.safeReferral=safeReferral;
module.exports.growthCta=growthCta;
