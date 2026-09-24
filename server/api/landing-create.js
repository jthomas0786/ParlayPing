const { parseSlip } = require('../../lib/slip-parser-wrapper');
const { encodeShareSlip } = require('./lib/share-slip');

function parseBody(req){
  if(req.body&&typeof req.body==='object')return req.body;
  if(typeof req.body==='string'&&req.body.trim()){try{return JSON.parse(req.body);}catch{return{};}}
  return{};
}
function publicBase(){return String(process.env.PUBLIC_BASE_URL||'https://parlayping.net').replace(/\/$/,'');}
function cleanImage(value){
  const image=String(value||'').trim();
  if(!image)return null;
  if(image.length>10*1024*1024)throw Object.assign(new Error('Screenshot payload is too large.'),{statusCode:413});
  if(!/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(image))throw Object.assign(new Error('Use a PNG, JPG or WebP screenshot.'),{statusCode:400});
  return image;
}
function majorityBook(legs){const names=legs.map(row=>String(row?.sportsbook||'').trim()).filter(Boolean);if(!names.length)return null;const counts=new Map();for(const name of names)counts.set(name,(counts.get(name)||0)+1);return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||null;}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method==='OPTIONS'){res.setHeader('Allow','POST, OPTIONS');return res.status(204).end();}
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Use POST.'});
  try{
    const body=parseBody(req);
    const text=String(body.text||'').trim().slice(0,6000);
    const imageData=cleanImage(body.imageData);
    if(!text&&!imageData)return res.status(400).json({ok:false,error:'Type a bet or attach a sportsbook screenshot first.'});
    const parsed=await parseSlip({text,mediaUrls:imageData?[imageData]:[]});
    const legs=Array.isArray(parsed?.legs)?parsed.legs:[];
    if(!legs.length){
      if(imageData&&!parsed?.visionConfigured)return res.status(503).json({ok:false,code:'VISION_NOT_CONFIGURED',error:'Screenshot-to-betslip parsing is not configured yet. Type the bet instead, or enable OPENAI_API_KEY on the server.'});
      return res.status(422).json({ok:false,error:'I could not identify a complete player + market + line from that bet. Try adding the player, prop and line explicitly.'});
    }
    const sportsbook=majorityBook(legs);
    const token=encodeShareSlip({source:'ParlayPing Landing',sourceReference:'landing-create',sportsbook,legs});
    const builderUrl=`${publicBase()}/build/${encodeURIComponent(token)}`;
    return res.status(200).json({ok:true,builderUrl,legCount:legs.length,sport:parsed.sport||null,sports:parsed.sports||[],sportsbook,method:parsed.method||null});
  }catch(error){
    const status=Number(error?.statusCode)||500;
    console.error('ParlayPing landing-create error',error);
    return res.status(status).json({ok:false,error:error?.message||'Could not create this betslip.'});
  }
};
