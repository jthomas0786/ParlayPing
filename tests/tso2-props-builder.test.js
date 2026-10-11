const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const handler=require('../server/api/tso-build');
const {decodeShareSlip}=require('../server/api/lib/share-slip');
const from=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const row={
  key:'nhl|event-204|player-1|player_shots|over|2.5',
  sport:'nhl',eventId:'event-204',player:'Test Hockey Player',playerId:'player-1',
  team:'NSH',homeTeam:'NSH',awayTeam:'DAL',
  market:'player_shots',marketLabel:'Shots on goal',side:'over',line:2.5,
  price:-110,book:'DraftKings',impliedPct:52.38,
  model:{phase:'pregame',source:'test',probabilityPct:61.4},
  books:[{book:'DraftKings',price:-110},{book:'FanDuel',price:-105}]
};
function fakeRes(){
  return{statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},
    status(v){this.statusCode=v;return this},json(payload){this.body=payload;return this}};
}
test('draft API accepts 1–25 unique TSO keys and rejects 26 or duplicates',()=>{
  assert.deepEqual(handler.selectionKeys({selectionKeys:['k1','k2']}),['k1','k2']);
  const twentyFive=Array.from({length:25},(_,i)=>'leg-'+(i+1));
  assert.deepEqual(handler.selectionKeys({selectionKeys:twentyFive}),twentyFive);
  assert.throws(()=>handler.selectionKeys({selectionKeys:[]}),e=>e.status===400);
  assert.throws(()=>handler.selectionKeys({selectionKeys:['x','x']}),e=>e.status===400);
  assert.throws(()=>handler.selectionKeys({selectionKeys:Array.from({length:26},(_,i)=>'leg-'+i)}),e=>e.status===400);
});
test('each slip leg uses server-fetched exact price and model; rejects stale or duplicated feed IDs',()=>{
  const slip=handler.assemble([row.key],[row]);
  assert.equal(slip.legs[0].player,'Test Hockey Player');
  assert.equal(slip.legs[0].pregameProbability,0.614);
  assert.equal(slip.legs[0].oddsAmerican,-110);
  assert.equal(slip.legs[0].bookOffers.FanDuel.oddsAmerican,-105);
  assert.equal(slip.combinedOddsVerified,false);
  assert.throws(()=>handler.assemble(['unknown'],[row]),e=>e.status===409);
  assert.throws(()=>handler.assemble([row.key],[row,{...row}]),e=>e.status===409);
});
test('a 25-leg TSO prop slip survives canonicalization and signed encode/decode',()=>{
  const {encodeShareSlip,decodeShareSlip,MAX_SHARE_LEGS}=require('../server/api/lib/share-slip');
  assert.equal(MAX_SHARE_LEGS,25);
  const keys=Array.from({length:25},(_,i)=>'nhl|event-'+i+'|player-'+i+'|shots|over|2.5');
  const live=keys.map((key,i)=>({...row,key,player:'Test Player '+i,eventId:'event-'+i,playerId:'player-'+i}));
  const slip=handler.assemble(keys,live);
  assert.equal(slip.legs.length,25);
  const token=encodeShareSlip(slip,'test-secret-with-adequate-length-123456789');
  const restored=decodeShareSlip(token,'test-secret-with-adequate-length-123456789');
  assert.equal(restored.legs.length,25);
  assert.deepEqual(restored.legs.map(x=>x.player),live.map(x=>x.player));
  assert.equal(restored.combinedOddsVerified,false);
  assert.ok(token.length<20000,'Oversized token may exceed URL limits');
  assert.throws(()=>handler.selectionKeys({selectionKeys:[...keys,'extra-leg']}),e=>e.status===400);
});
test('NFL extreme and disproportionate model probabilities are dropped',()=>{
  assert.equal(handler.modelChance({...row,sport:'nfl',model:{probabilityPct:100}}),null);
  assert.equal(handler.modelChance({...row,sport:'nfl',model:{probabilityPct:94},impliedPct:40}),null);
});
test('signed-in TSO owner builds a signed slip; forged browser odds ignored',async()=>{
  const original=global.fetch,oldSecret=process.env.PARLAYPING_SHARE_SECRET;
  process.env.PARLAYPING_SHARE_SECRET='test-only-secret-from-ci-12345678901234567890';
  const hits=[];
  global.fetch=async(url,opts)=>{
    hits.push({url,opts});
    if(String(url).endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'12345678-1234-1234-1234-123456789abc'}),{status:200});
    return new Response(JSON.stringify({rows:[row]}),{status:200});
  };
  try{
    const res=fakeRes();
    await handler({method:'POST',headers:{'x-parlayping-identity':'tso2',authorization:'Bearer '+'x'.repeat(75)},
      body:{selectionKeys:[row.key],price:999999,probability:1,sportsbookLink:'https://example.invalid/spoof'}},res);
    assert.equal(res.statusCode,200,JSON.stringify(res.body));
    assert.match(res.body.path,/^\/build\/s1\./);
    const token=decodeURIComponent(res.body.path.split('/build/')[1].split('?')[0]);
    const slip=decodeShareSlip(token);
    assert.equal(slip.legs[0].oddsAmerican,-110);
    assert.equal(slip.legs[0].pregameProbability,.614);
    assert.equal(slip.combinedOddsVerified,false);
    assert.equal(slip.legs[0].sportsbookLink,null);
    assert.ok(hits.some(x=>x.url==='https://thesportsoutpost.com/api/props?league=all'));
    const denied=fakeRes();
    await handler({method:'POST',headers:{},body:{selectionKeys:[row.key]}},denied);
    assert.ok(denied.statusCode>=400);
  }finally{global.fetch=original;if(oldSecret==null)delete process.env.PARLAYPING_SHARE_SECRET;else process.env.PARLAYPING_SHARE_SECRET=oldSecret;}
});
test('frontend only submits exact keys, renders no fabricated combined price',()=>{
  const ui=from('tso2-props-builder.js');
  const shell=from('tso2-shell.js');
  assert.match(ui,/selectionKeys:rows\.map\(r=>r\.key\)/);
  assert.match(ui,/const TSO_PP_MAX_LEGS=25;/);
  assert.match(ui,/\.slice\(0,TSO_PP_MAX_LEGS\)/);
  assert.match(from('server/api/tso-build.js'),/const MAX_LEGS=MAX_SHARE_LEGS/);
  assert.match(ui,/PP_TSO_AUTH\.whenReady\(\)/);
  assert.match(ui,/x-parlayping-identity/);
  assert.match(shell,/tso2-builder-broadcast\.css/);
  assert.match(shell,/tso2-props-builder\.css/);
  assert.match(from('render-server.js'),/\['\/api\/tso-build', 'tso-build'\]/);
  assert.match(from('api/index.js'),/'tso-build':/);
});
