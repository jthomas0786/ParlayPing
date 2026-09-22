const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeMmaSlip,gradeFight}=require('../lib/mma-adapter');

const start='2099-09-20T20:00:00.000Z';
const odds={meta:{fetchedAt:'2099-09-20T16:00:00.000Z'},rows:[
  {eventId:'m1',sport:'MMA',commenceTime:start,homeTeam:'Alexandre Pantoja',awayTeam:'Joshua Van',player:'Joshua Van',market:'fightWinner',marketKey:'player_moneyline',line:0.5,binary:true,book:'Book A',overPrice:-130,underPrice:null},
  {eventId:'m1',sport:'MMA',commenceTime:start,homeTeam:'Alexandre Pantoja',awayTeam:'Joshua Van',player:'Alexandre Pantoja',market:'fightWinner',marketKey:'player_moneyline',line:0.5,binary:true,book:'Book A',overPrice:110,underPrice:null}
]};
function mmaLive({state='in',final=false,vanWinner=null,pantojaWinner=null}={}){return {schemaVersion:1,source:'espn-public',sport:'MMA',generatedAt:'2099-09-20T21:00:00.000Z',fights:{f1:{id:'f1',eventId:'e1',event:'UFC Test',startTime:start,state,final,statusDetail:final?'Final':'Round 2',round:2,clock:final?'0:00':'2:31',fighters:[{id:'p',name:'Alexandre Pantoja',winner:pantojaWinner},{id:'v',name:'Joshua Van',winner:vanWinner}]}}};}
function response(data,status=200){return {ok:status>=200&&status<300,status,json:async()=>data};}
function withFeeds(live,fn){const original=global.fetch;global.fetch=async url=>String(url).endsWith('/mma-live.json')?(live?response(live):response(null,404)):response(odds);return Promise.resolve().then(fn).finally(()=>{global.fetch=original;});}

const van={sport:'MMA',player:'Joshua Van',market:'fightWinner',side:'yes',line:null,inclusive:true};
const pantoja={sport:'MMA',player:'Alexandre Pantoja',market:'fightWinner',side:'yes',line:null,inclusive:true};

test('pregame MMA fight winner uses sportsbook implied probability',async()=>withFeeds(null,async()=>{
  const result=await analyzeMmaSlip([van],{referenceTime:'2099-09-20T16:00:00.000Z',now:Date.parse('2099-09-20T16:00:00.000Z')});
  const row=result.results[0];
  assert.equal(row.status,'PENDING');
  assert.ok(Number.isFinite(row.probability));
  assert.equal(row.probabilityMethod,'sportsbook-implied-median');
}));

test('started MMA fight winner remains LIVE until official result',async()=>withFeeds(mmaLive(),async()=>{
  const result=await analyzeMmaSlip([van],{referenceTime:start,now:Date.parse('2099-09-20T21:00:00.000Z')});
  const row=result.results[0];
  assert.equal(row.status,'LIVE');
  assert.equal(row.current,null);
  assert.equal(row.period,2);
}));

test('official MMA winner grades HIT',async()=>withFeeds(mmaLive({state:'post',final:true,vanWinner:true,pantojaWinner:false}),async()=>{
  const result=await analyzeMmaSlip([van],{referenceTime:start,now:Date.parse('2099-09-20T23:00:00.000Z')});
  assert.equal(result.results[0].status,'HIT');
  assert.equal(result.results[0].current,1);
}));

test('official MMA loser grades MISS',async()=>withFeeds(mmaLive({state:'post',final:true,vanWinner:true,pantojaWinner:false}),async()=>{
  const result=await analyzeMmaSlip([pantoja],{referenceTime:start,now:Date.parse('2099-09-20T23:00:00.000Z')});
  assert.equal(result.results[0].status,'MISS');
  assert.equal(result.results[0].current,0);
}));

test('draw or no-contest fails closed instead of grading a fighter loss',async()=>withFeeds(mmaLive({state:'post',final:true,vanWinner:false,pantojaWinner:false}),async()=>{
  const result=await analyzeMmaSlip([van],{referenceTime:start,now:Date.parse('2099-09-20T23:00:00.000Z')});
  assert.equal(result.results[0].status,'UNRESOLVED');
  assert.equal(result.results[0].resolutionReason,'mma-final-result-has-no-single-winner');
}));

test('gradeFight does not mark a live fighter as winning before final',()=>{
  const live=mmaLive();const found={fight:live.fights.f1,fighter:live.fights.f1.fighters[1]};
  assert.equal(gradeFight(van,found).status,'LIVE');
});
