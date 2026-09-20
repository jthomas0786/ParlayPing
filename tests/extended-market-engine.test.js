const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeExtendedSlip,quoteProbability,rowMatchesLine}=require('../lib/extended-market-engine');

const future='2099-09-20T20:00:00.000Z';
const snapshot={meta:{fetchedAt:'2099-09-20T15:00:00.000Z'},rows:[
  {eventId:'s1',sport:'SOCCER',commenceTime:future,homeTeam:'Arsenal',awayTeam:'Chelsea',player:'Bukayo Saka',market:'shots',marketKey:'player_shots',line:2.5,binary:false,book:'Book A',overPrice:-110,underPrice:-110},
  {eventId:'s1',sport:'SOCCER',commenceTime:future,homeTeam:'Arsenal',awayTeam:'Chelsea',player:'Bukayo Saka',market:'shots',marketKey:'player_shots',line:2.5,binary:false,book:'Book B',overPrice:-105,underPrice:-115},
  {eventId:'t1',sport:'TENNIS',commenceTime:future,homeTeam:'Player B',awayTeam:'Player A',player:'Player A',market:'matchWinner',marketKey:'player_moneyline',line:0.5,binary:true,book:'Book A',overPrice:-150,underPrice:null}
]};

function withSnapshot(fn){
  const original=global.fetch;
  global.fetch=async()=>({ok:true,status:200,json:async()=>snapshot});
  return Promise.resolve().then(fn).finally(()=>{global.fetch=original;});
}

test('inclusive soccer milestone can match a half-point sportsbook line',()=>{
  assert.equal(rowMatchesLine(snapshot.rows[0],{market:'shots',side:'over',line:3,inclusive:true}),true);
});

test('extended engine de-vigs current two-sided soccer props',async()=>withSnapshot(async()=>{
  const result=await analyzeExtendedSlip('SOCCER',[{sport:'SOCCER',player:'Bukayo Saka',market:'shots',side:'over',line:2.5,inclusive:false}],{referenceTime:'2099-09-20T16:00:00.000Z',now:Date.parse('2099-09-20T16:00:00.000Z')});
  const row=result.results[0];
  assert.equal(row.status,'PENDING');
  assert.equal(row.gameId,'s1');
  assert.ok(Number.isFinite(row.probability));
  assert.equal(row.probabilityMethod,'sportsbook-devig-median');
}));

test('extended engine uses sportsbook implied probability for one-sided match winner',async()=>withSnapshot(async()=>{
  const result=await analyzeExtendedSlip('TENNIS',[{sport:'TENNIS',player:'Player A',market:'matchWinner',side:'yes',line:null,inclusive:true}],{referenceTime:'2099-09-20T16:00:00.000Z',now:Date.parse('2099-09-20T16:00:00.000Z')});
  const row=result.results[0];
  assert.equal(row.status,'PENDING');
  assert.equal(row.probabilityMethod,'sportsbook-implied-median');
  assert.ok(Math.abs(row.probability-0.6)<1e-12);
}));

test('extended engine never grades started events without a live feed',async()=>withSnapshot(async()=>{
  const result=await analyzeExtendedSlip('SOCCER',[{sport:'SOCCER',player:'Bukayo Saka',market:'shots',side:'over',line:2.5,inclusive:false}],{referenceTime:'2099-09-20T16:00:00.000Z',now:Date.parse('2099-09-20T21:00:00.000Z')});
  const row=result.results[0];
  assert.equal(row.status,'UNRESOLVED');
  assert.equal(row.resolutionReason,'soccer-live-grading-not-connected');
}));

test('quoteProbability does not convert null implied fields to zero',()=>{
  const q=quoteProbability(snapshot,{sport:'SOCCER',player:'Bukayo Saka',market:'shots',side:'over',line:2.5,inclusive:false},snapshot.rows[0]);
  assert.ok(Number.isFinite(q.probability));
});
