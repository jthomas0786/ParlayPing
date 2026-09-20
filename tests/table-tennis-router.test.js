const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeMultiSport}=require('../api/lib/sport-router');
const {applyCorrelationSafety,replyReadiness,buildPublicReply}=require('../api/lib/analysis-safety');

const start='2099-09-20T20:00:00.000Z';
const odds={meta:{fetchedAt:'2099-09-20T18:00:00.000Z'},rows:[
  {eventId:'book-1',sport:'TABLE_TENNIS',commenceTime:start,homeTeam:'Alice Smith',awayTeam:'Bob Jones',player:'Alice Smith',market:'matchWinner',marketKey:'player_moneyline',line:0.5,binary:true,book:'Book A',overPrice:-150,underPrice:null},
  {eventId:'book-1',sport:'TABLE_TENNIS',commenceTime:start,homeTeam:'Alice Smith',awayTeam:'Bob Jones',player:'Bob Jones',market:'matchWinner',marketKey:'player_moneyline',line:0.5,binary:true,book:'Book A',overPrice:130,underPrice:null}
]};
const final={schemaVersion:1,source:'world-table-tennis-official',sport:'TABLE_TENNIS',generatedAt:'2099-09-20T21:00:00.000Z',matches:{m1:{
  id:'3503:doc-1',eventId:'3503',documentCode:'doc-1',startTime:start,state:'post',final:true,voidLike:false,resultStatus:'OFFICIAL',overallScore:'3-1',currentGameNumber:4,
  players:[{id:'a',name:'SMITH Alice',setsWon:3,winner:true},{id:'b',name:'JONES Bob',setsWon:1,winner:false}]
}}};
function response(data,status=200){return {ok:status>=200&&status<300,status,json:async()=>data};}
function withSnapshots({oddsSnapshot=odds,liveSnapshot=final}={},fn){
  const original=global.fetch;
  global.fetch=async url=>{
    const value=String(url);
    if(value.endsWith('/table-tennis-odds.json'))return response(oddsSnapshot);
    if(value.endsWith('/table-tennis-live.json'))return response(liveSnapshot);
    throw new Error(`unexpected URL ${value}`);
  };
  return Promise.resolve().then(fn).finally(()=>{global.fetch=original;});
}

test('Table Tennis flows through multi-sport router and public reply formatter',async()=>withSnapshots({},async()=>{
  const analysis=await analyzeMultiSport([
    {sport:'TABLE_TENNIS',player:'Alice Smith',market:'matchWinner',side:'yes',line:null,inclusive:true},
    {sport:'TABLE_TENNIS',player:'Bob Jones',market:'matchWinner',side:'yes',line:null,inclusive:true}
  ],{referenceTime:start,now:Date.parse('2099-09-20T21:00:00.000Z'),baseUrl:'https://parlayping.net'});
  assert.deepEqual(analysis.sports,['TABLE_TENNIS']);
  assert.equal(analysis.counts.hit,1);
  assert.equal(analysis.counts.miss,1);
  assert.equal(analysis.counts.unresolved,0);
  const safe=applyCorrelationSafety(analysis);
  const reply=buildPublicReply(safe,{maxLegs:3});
  assert.ok(reply.startsWith('🔔 ParlayPing Live'));
  assert.match(reply,/✅ Smith MATCH WINNER/);
  assert.match(reply,/❌ Jones MATCH WINNER/);
  assert.ok(!reply.includes('Reply STOP to opt out'));
  assert.ok(!reply.includes('null/1'));
}));

test('empty official Table Tennis board remains unresolved and blocks public reply',async()=>withSnapshots({oddsSnapshot:{meta:{},rows:[]},liveSnapshot:{schemaVersion:1,source:'world-table-tennis-official',sport:'TABLE_TENNIS',generatedAt:'2099-09-20T21:00:00.000Z',matches:{}}},async()=>{
  const analysis=await analyzeMultiSport([
    {sport:'TABLE_TENNIS',player:'Nobody Current',market:'matchWinner',side:'yes',line:null,inclusive:true}
  ],{referenceTime:'2099-09-20T21:00:00.000Z',now:Date.parse('2099-09-20T21:00:00.000Z')});
  assert.equal(analysis.counts.unresolved,1);
  const safe=applyCorrelationSafety(analysis);
  assert.equal(replyReadiness(safe).ready,false);
  assert.equal(buildPublicReply(safe),null);
}));
