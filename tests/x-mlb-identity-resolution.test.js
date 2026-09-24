const test=require('node:test');
const assert=require('node:assert/strict');

const parser=require('../lib/slip-parser-wrapper-mlb');
const mlb=require('../server/api/lib/mlb-engine-v3');

function response(body,status=200){return {ok:status>=200&&status<300,status,async json(){return body;}};}

test('MLB parser strips invisible Unicode and collapses tiny same-selection name variants',()=>{
  const common={sport:'MLB',team:'KANSAS CITY ROYALS',market:'hrr',side:'over',line:1,inclusive:true,originalText:'PLAYER TO RECORD 1+ HITS + RUNS + RBIS'};
  const rows=parser.mergeMlbLegs([
    {...common,player:'Michaela Massey'},
    {...common,player:'Micha\u200bel Massey'},
    {...common,player:'Michaels Massey'},
  ],[
    {...common,player:'Michael Massey',originalText:'Michael Massey — PLAYER TO RECORD 1+ HITS + RUNS + RBIS'},
  ]);
  assert.equal(rows.length,1);
  assert.equal(parser.stripInvisibleMlbText('Micha\u200bel Massey'),'Michael Massey');
  assert.ok(parser.nearMlbPlayerIdentity('Michaela Massey','Michael Massey'));
});

test('official MLB people search resolves Heriberto Hernandez on the requested team',async()=>{
  const original=global.fetch;
  global.fetch=async url=>{
    const value=String(url);
    if(value.includes('/people/search?'))return response({people:[{id:681715,fullName:'Heriberto Hernandez',currentTeam:{id:146,name:'Miami Marlins'},primaryPosition:{abbreviation:'OF'}}]});
    if(value.includes('/schedule?'))return response({dates:[]});
    return response({},404);
  };
  try{
    const found=await mlb.findOfficialPlayer({player:'Heriberto Hernandez',team:'MIAMI MARLINS'},'2026-09-24T17:00:00Z');
    assert.equal(found?.id,'681715');
    assert.equal(found?.name,'Heriberto Hernandez');
    assert.equal(found?.teamName,'Miami Marlins');
  }finally{global.fetch=original;}
});

test('official MLB identity fallback does not bind an exact name to the wrong team',async()=>{
  const original=global.fetch;
  global.fetch=async url=>{
    const value=String(url);
    if(value.includes('/people/search?'))return response({people:[{id:681715,fullName:'Heriberto Hernandez',currentTeam:{id:146,name:'Miami Marlins'}}]});
    if(value.includes('/schedule?'))return response({dates:[]});
    return response({},404);
  };
  try{
    const found=await mlb.findOfficialPlayer({player:'Heriberto Hernandez',team:'KANSAS CITY ROYALS'},'2026-09-24T17:00:00Z');
    assert.equal(found,null);
  }finally{global.fetch=original;}
});

test('sport router is wired to MLB v3 fallback',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../server/api/lib/sport-router.js'),'utf8');
  assert.match(source,/require\('\.\/mlb-engine-v3'\)/);
});
