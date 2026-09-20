const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeMultiSport}=require('../api/lib/sport-router');
const {applyCorrelationSafety,buildPublicReply,replyReadiness}=require('../api/lib/analysis-safety');

const start='2099-09-20T20:00:00.000Z';
const soccerOdds={meta:{fetchedAt:'2099-09-20T19:00:00.000Z'},rows:[
  {eventId:'book-s',sport:'SOCCER',commenceTime:start,homeTeam:'Arsenal',awayTeam:'Chelsea',player:'Bukayo Saka',market:'shots',line:2.5,binary:false,book:'Book',overPrice:-110,underPrice:-110}
]};
const tennisOdds={meta:{fetchedAt:'2099-09-20T19:00:00.000Z'},rows:[
  {eventId:'book-t',sport:'TENNIS',commenceTime:start,homeTeam:'Opponent',awayTeam:'Clara Burel',player:'Clara Burel',market:'matchWinner',line:0.5,binary:true,book:'Book',overPrice:-120,underPrice:null}
]};
const soccerLive={schemaVersion:1,source:'espn-public',sport:'SOCCER',generatedAt:'2099-09-20T20:30:00.000Z',games:{
  s:{id:'espn-s',startTime:start,state:'in',final:false,clock:"60'",period:2,home:{name:'Arsenal FC',abbr:'ARS'},away:{name:'Chelsea',abbr:'CHE'},players:[
    {name:'Bukayo Saka',team:'ARS',appeared:true,shots:3,shotsOnTarget:1,assists:0,goals:0,goalsAssists:0,fouls:1,cards:0,saves:null}
  ]}
}};
const tennisLive={schemaVersion:1,source:'espn-public',sport:'TENNIS',generatedAt:'2099-09-20T20:30:00.000Z',matches:{
  t:{id:'espn-t',startTime:start,state:'in',final:false,period:2,gamesPlayed:14,setsPlayed:2,players:[
    {name:'Clara Burel',winner:null,linescores:[6,1],gamesWon:7,setsWon:1,setsPlayed:2},
    {name:'Opponent',winner:null,linescores:[4,3],gamesWon:7,setsWon:0,setsPlayed:2}
  ]}
}};

function response(data,status=200){return {ok:status>=200&&status<300,status,json:async()=>data};}

test('mixed Soccer and Tennis live analysis flows through to a clean public reply',async()=>{
  const original=global.fetch;
  global.fetch=async url=>{
    const value=String(url);
    if(value.endsWith('/soccer-odds.json'))return response(soccerOdds);
    if(value.endsWith('/soccer-live.json'))return response(soccerLive);
    if(value.endsWith('/tennis-odds.json'))return response(tennisOdds);
    if(value.endsWith('/tennis-live.json'))return response(tennisLive);
    return response(null,404);
  };
  try{
    const analysis=await analyzeMultiSport([
      {id:'soccer-1',sport:'SOCCER',player:'Bukayo Saka',market:'shots',side:'over',line:2.5,inclusive:false},
      {id:'tennis-1',sport:'TENNIS',player:'Clara Burel',market:'matchWinner',side:'yes',line:null,inclusive:true}
    ],{referenceTime:'2099-09-20T19:30:00.000Z',baseUrl:'https://parlayping.net'});
    assert.deepEqual(analysis.sports,['SOCCER','TENNIS']);
    assert.equal(analysis.counts.hit,1);
    assert.equal(analysis.counts.live,1);
    assert.equal(analysis.counts.unresolved,0);
    assert.equal(analysis.results.find(r=>r.id==='soccer-1').status,'HIT');
    assert.equal(analysis.results.find(r=>r.id==='tennis-1').status,'LIVE');

    const safe=applyCorrelationSafety(analysis);
    assert.equal(replyReadiness(safe).ready,true);
    const reply=buildPublicReply(safe,{maxLegs:3});
    assert.match(reply,/^🔔 ParlayPing Live/);
    assert.match(reply,/✅ 1 hit · 🔴 1 live · ⏳ 0 left/);
    assert.match(reply,/Burel MATCH WINNER/);
    assert.doesNotMatch(reply,/null\/1/);
    assert.doesNotMatch(reply,/Reply STOP to opt out/);
  } finally {
    global.fetch=original;
  }
});
