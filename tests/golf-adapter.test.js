const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeGolfSlip,findGolfOutright,sameGolfer}=require('../lib/golf-adapter');

function snapshot(rows){return {meta:{fetchedAt:'2026-09-20T19:00:00.000Z',source:'parlayapi-pinnacle',settlementConnected:false},rows};}
function row(overrides={}){return {sport:'GOLF',sportKey:'golf_test_tournament',eventId:'evt-1',marketId:'market-1',tournament:'Test Open',market:'tournamentWinner',selection:'Rory McIlroy',bookKey:'pinnacle',price:650,impliedProbability:0.1333333333,fairProbability:0.12,settlementConnected:false,...overrides};}

test('Golf outright uses de-vigged full-field Pinnacle probability',async()=>{
  const result=await analyzeGolfSlip([{sport:'GOLF',player:'Rory McIlroy',market:'tournamentWinner',side:'yes',line:null}],{snapshot:snapshot([row()])});
  assert.equal(result.results.length,1);
  assert.equal(result.results[0].status,'PENDING');
  assert.equal(result.results[0].probability,0.12);
  assert.equal(result.results[0].probabilityMethod,'pinnacle-devig-outright-field');
  assert.equal(result.results[0].gameId,'golf_test_tournament|evt-1|market-1');
});

test('Golf golfer matching tolerates reversed source name order',()=>{
  assert.equal(sameGolfer('McIlroy Rory','Rory McIlroy'),true);
});

test('Golf duplicate golfer across active tournament fields is ambiguous without anchor',async()=>{
  const board=snapshot([row(),row({sportKey:'golf_other_tournament',eventId:'evt-2',marketId:'market-2',tournament:'Other Open',fairProbability:0.08})]);
  assert.equal(findGolfOutright(board,{player:'Rory McIlroy'}),null);
  const result=await analyzeGolfSlip([{sport:'GOLF',player:'Rory McIlroy',market:'tournamentWinner',side:'yes'}],{snapshot:board});
  assert.equal(result.results[0].status,'UNRESOLVED');
  assert.match(result.results[0].resolutionReason,/ambiguous/);
});

test('Golf explicit gameId safely resolves an otherwise ambiguous field',async()=>{
  const board=snapshot([row(),row({sportKey:'golf_other_tournament',eventId:'evt-2',marketId:'market-2',tournament:'Other Open',fairProbability:0.08})]);
  const result=await analyzeGolfSlip([{sport:'GOLF',player:'Rory McIlroy',market:'tournamentWinner',side:'yes',gameId:'evt-2'}],{snapshot:board});
  assert.equal(result.results[0].status,'PENDING');
  assert.equal(result.results[0].probability,0.08);
  assert.equal(result.results[0].tournament,'Other Open');
});

test('Golf unsupported prop fails closed',async()=>{
  const result=await analyzeGolfSlip([{sport:'GOLF',player:'Rory McIlroy',market:'top10',side:'yes'}],{snapshot:snapshot([row()])});
  assert.equal(result.results[0].status,'UNRESOLVED');
  assert.match(result.results[0].resolutionReason,/market-not-supported/);
});
