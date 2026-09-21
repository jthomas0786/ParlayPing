const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {normalizeBuildCandidate,buildFromAnalysis}=require('../api/lib/bet-builder');

const route=fs.readFileSync(path.join(__dirname,'..','api','v1','build.js'),'utf8');

test('Sports Outpost style candidate fields normalize without losing game identity',()=>{
  const row=normalizeBuildCandidate({id:'x',sport:'nfl',player_name:'A Player',market:'Receiving Yards',side:'over',line:49.5,event_id:'401'},0);
  assert.equal(row.sport,'NFL');
  assert.equal(row.player,'A Player');
  assert.equal(row.gameId,'401');
});

test('builder ranks model probability and defaults to distinct games',()=>{
  const analysis={results:[
    {id:'a',sport:'NFL',player:'A',market:'Yards',gameId:'g1',status:'PENDING',probability:.74},
    {id:'b',sport:'NFL',player:'B',market:'Yards',gameId:'g1',status:'PENDING',probability:.73},
    {id:'c',sport:'NFL',player:'C',market:'Yards',gameId:'g2',status:'PENDING',probability:.68},
    {id:'d',sport:'NFL',player:'D',market:'Yards',gameId:'g3',status:'PENDING',probability:.64},
  ]};
  const out=buildFromAnalysis(analysis,{desiredLegs:3});
  assert.equal(out.buildable,true);
  assert.deepEqual(out.selectedLegs.map(x=>x.id),['a','c','d']);
  assert.equal(out.strategy,'highest-model-probability-distinct-games');
  assert.equal(out.correlationDetected,false);
  assert.ok(out.combinedProbability>0);
});

test('builder excludes unresolved live and probability-less candidates',()=>{
  const analysis={results:[
    {id:'bad1',status:'UNRESOLVED',probability:.99,gameId:'g1'},
    {id:'bad2',status:'LIVE',probability:.90,gameId:'g2'},
    {id:'bad3',status:'PENDING',probability:null,gameId:'g3'},
    {id:'good',status:'PENDING',probability:.62,gameId:'g4'},
  ]};
  const out=buildFromAnalysis(analysis,{desiredLegs:1});
  assert.equal(out.buildable,true);
  assert.deepEqual(out.selectedLegs.map(x=>x.id),['good']);
});

test('builder fails closed rather than inventing legs when requested build cannot be filled',()=>{
  const analysis={results:[
    {id:'a',status:'PENDING',probability:.70,gameId:'same'},
    {id:'b',status:'PENDING',probability:.69,gameId:'same'},
  ]};
  const out=buildFromAnalysis(analysis,{desiredLegs:2});
  assert.equal(out.buildable,false);
  assert.equal(out.selectedCount,1);
  assert.equal(out.combinedProbability,null);
  assert.match(out.note,/did not invent replacement legs/i);
});

test('same-game opt-in never multiplies correlated probabilities as independent',()=>{
  const analysis={results:[
    {id:'a',sport:'NFL',status:'PENDING',probability:.70,gameId:'same'},
    {id:'b',sport:'NFL',status:'PENDING',probability:.65,gameId:'same'},
  ]};
  const out=buildFromAnalysis(analysis,{desiredLegs:2,allowSameGame:true});
  assert.equal(out.buildable,true);
  assert.equal(out.selectedCount,2);
  assert.equal(out.correlationDetected,true);
  assert.equal(out.combinedProbability,null);
  assert.equal(out.combinedProbabilityPct,null);
  assert.match(out.note,/correlated legs are not multiplied/i);
});

test('minimum probability and sport filters are enforced',()=>{
  const analysis={results:[
    {id:'nfl',sport:'NFL',status:'PENDING',probability:.66,gameId:'1'},
    {id:'nba',sport:'NBA',status:'PENDING',probability:.75,gameId:'2'},
    {id:'low',sport:'NFL',status:'PENDING',probability:.52,gameId:'3'},
  ]};
  const out=buildFromAnalysis(analysis,{desiredLegs:1,minProbability:.60,sports:['NFL']});
  assert.equal(out.buildable,true);
  assert.deepEqual(out.selectedLegs.map(x=>x.id),['nfl']);
});

test('builder supports a full 25-leg distinct-game build',()=>{
  const results=Array.from({length:25},(_,i)=>({id:`leg-${i+1}`,sport:'NFL',status:'PENDING',probability:.70-i/1000,gameId:`game-${i+1}`}));
  const out=buildFromAnalysis({results},{desiredLegs:25});
  assert.equal(out.buildable,true);
  assert.equal(out.requestedLegs,25);
  assert.equal(out.selectedCount,25);
  assert.equal(out.correlationDetected,false);
  assert.ok(out.combinedProbability>0);
});

test('v1 build route is API-key authenticated quota-accounted and capped',()=>{
  assert.match(route,/extractApiKey\(req\)/);
  assert.match(route,/endpoint:'\/api\/v1\/build'/);
  assert.match(route,/apiAuth\(\{apiKey,endpoint:'\/api\/v1\/build',requestId\}\)/);
  assert.match(route,/Maximum 25 candidate legs per build request/);
  assert.match(route,/candidates\.length>25/);
  assert.match(route,/action:'finalize'/);
  assert.doesNotMatch(route,/pp_live_[0-9a-f]{48}/i);
});
