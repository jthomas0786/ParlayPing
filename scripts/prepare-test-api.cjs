const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const apiDir=path.join(root,'api');
const serverApi=path.join(root,'server','api');

function ensureLink(name,type='file'){
  const dest=path.join(apiDir,name);
  if(fs.existsSync(dest))return;
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  const target=path.relative(path.dirname(dest),path.join(serverApi,name))||'.';
  fs.symlinkSync(target,dest,type);
}

ensureLink('lib','dir');
ensureLink('v1','dir');
for(const file of ['account-router.js','analyze.js','parse.js','share-card.js','share-page.js','status.js','x-dry-run.js','x-scheduler.js','x-worker.js'])ensureLink(file,'file');
