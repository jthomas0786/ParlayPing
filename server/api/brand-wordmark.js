const APPROVED_WORDMARK_DATA=require('./lib/approved-wordmark-data');

module.exports=async function brandWordmark(req,res){
  const match=String(APPROVED_WORDMARK_DATA||'').match(/^data:image\/png;base64,(.+)$/);
  if(!match){
    res.setHeader('Cache-Control','no-store');
    return res.status(500).end('Approved wordmark unavailable');
  }
  const bytes=Buffer.from(match[1],'base64');
  res.setHeader('Content-Type','image/png');
  res.setHeader('Content-Length',String(bytes.length));
  res.setHeader('Cache-Control','public, max-age=31536000, immutable');
  return res.status(200).end(bytes);
};
