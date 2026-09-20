const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeTableTennisSlip,findTableTennisMatch,gradeTableTennisMatch}=require('../lib/table-tennis-adapter');

const start='2099-09-20T20:00:00.000Z';
const odds={meta:{fetchedAt:'2099-09-20T18:00:00.000Z'},rows:[
  {eventId:'book-1',sport:'TABLE_TENNIS',commenceTime:start,homeTeam:'Alice Smith',awayTeam:'Bob Jones',player:'Alice Smith',market:'matchWinner',marketKey:'player_moneyline',line:0.5,binary:true,book:'Book A',overPrice:-150,underPrice:null},
  {eventId:'book-1',sport:'TABLE_TENNIS',commenceTime:start,homeTeam:'Alice Smith',awayTeam:'Bob Jones',player:'Bob Jones',market:'matchWinner',marketKey:'player_moneyline',line:0.5,binary:true,book:'Book A',overPrice:130,underPrice:null}
]};
function match(overrides={}){
  return {
    id:'3503:doc-1',eventId:'3503',documentCode:'doc-1',subEventType:'Men Singles',description:'Singles - Match 1',
    startTime:start,state:'in',final:false,voidLike:false,resultStatus:'LIVE',overallScore:'1-1',currentGameNumber:3,bestOf:5,
    players:[
      {id:'a',name:'SMITH Alice',setsWon:1,winner:null},
      {id:'b',name:'JONES Bob',setsWon:1,winner:null}
    ],
    ...overrides
  };
}
const live={schemaVersion:1,source:'world-table-tennis-official',sport:'TABLE_TENNIS',generatedAt:'2099-09-20T20:20:00.000Z',matches:{m1:match()}};
const final={schemaVersion:1,source:'world-table-tennis-official',sport:'TABLE_TENNIS',generatedAt:'2099-09-20T21:00:00.000Z',matches:{m1:match({state:'post',final:true,resultStatus:'OFFICIAL',overallScore:'3-1',players:[
  {id:'a',name:'SMITH Alice',setsWon:3,winner:true},
  {id:'b',name:'JONES Bob',setsWon:1,winner:false}
]})}};
const voidFinal={schemaVersion:1,source:'world-table-tennis-official',sport:'TABLE_TENNIS',generatedAt:'2099-09-20T21:00:00.000Z',matches:{m1:match({state:'post',final:true,voidLike:true,resultStatus:'OFFICIAL',overallScore:'3-0 WO',players:[
  {id:'a',name:'SMITH Alice',setsWon:3,winner:null},
  {id:'b',name:'JONES Bob',setsWon:0,winner:null}
]})}};

function response(data,status=200){return {ok:status>=200&&status<300,status,json:async()=>data};}
function withSnapshots({oddsSnapshot=odds,liveSnapshot=live}={},fn){
  const original=global.fetch;
  global.fetch=async url=>{
    const value=String(url);
    if(value.endsWith('/table-tennis-odds.json'))return response(oddsSnapshot);
    if(value.endsWith('/table-tennis-live.json'))return liveSnapshot?response(liveSnapshot):response(null,404);
    throw new Error(`unexpected URL ${value}`);
  };
  return Promise.resolve().then(fn).finally(()=>{global.fetch=original;});
}
const leg=player=>({sport:'TABLE_TENNIS',player,market:'matchWinner',side:'yes',line:null,inclusive:true});

test('pregame Table Tennis match winner uses real sportsbook implied price',async()=>withSnapshots({liveSnapshot:null},async()=>{
  const result=await analyzeTableTennisSlip([leg('Alice Smith')],{referenceTime:'2099-09-20T18:30:00.000Z',now:Date.parse('2099-09-20T18:30:00.000Z')});
  const row=result.results[0];
  assert.equal(row.status,'PENDING');
  assert.equal(row.probabilityMethod,'sportsbook-implied-median');
  assert.ok(Math.abs(row.probability-0.6)<1e-12);
}));

test('official WTT live match keeps match-winner leg LIVE',async()=>withSnapshots({},async()=>{
  const result=await analyzeTableTennisSlip([leg('Alice Smith')],{referenceTime:start,now:Date.parse('2099-09-20T20:20:00.000Z')});
  const row=result.results[0];
  assert.equal(row.status,'LIVE');
  assert.equal(row.current,null);
  assert.match(row.matchup,/SMITH Alice/);
}));

test('official WTT final winner grades HIT despite reversed surname-first source name',async()=>withSnapshots({liveSnapshot:final},async()=>{
  const result=await analyzeTableTennisSlip([leg('Alice Smith')],{referenceTime:start,now:Date.parse('2099-09-20T21:00:00.000Z')});
  assert.equal(result.results[0].status,'HIT');
  assert.equal(result.results[0].current,1);
}));

test('official WTT final loser grades MISS',async()=>withSnapshots({liveSnapshot:final},async()=>{
  const result=await analyzeTableTennisSlip([leg('Bob Jones')],{referenceTime:start,now:Date.parse('2099-09-20T21:00:00.000Z')});
  assert.equal(result.results[0].status,'MISS');
  assert.equal(result.results[0].current,0);
}));

test('WTT walkover/retirement-like final fails closed instead of grading',async()=>withSnapshots({liveSnapshot:voidFinal},async()=>{
  const result=await analyzeTableTennisSlip([leg('Alice Smith')],{referenceTime:start,now:Date.parse('2099-09-20T21:00:00.000Z')});
  assert.equal(result.results[0].status,'UNRESOLVED');
  assert.equal(result.results[0].resolutionReason,'table-tennis-final-void-like');
}));

test('without sportsbook opponents multiple nearby official matches are ambiguous and not guessed',async()=>{
  const ambiguous={schemaVersion:1,source:'world-table-tennis-official',sport:'TABLE_TENNIS',generatedAt:'2099-09-20T20:30:00.000Z',matches:{
    m1:match({id:'m1',startTime:'2099-09-20T20:00:00.000Z'}),
    m2:match({id:'m2',startTime:'2099-09-20T22:00:00.000Z',players:[{id:'a',name:'SMITH Alice',winner:null},{id:'c',name:'LEE Carol',winner:null}]})
  }};
  await withSnapshots({oddsSnapshot:{meta:{},rows:[]},liveSnapshot:ambiguous},async()=>{
    const result=await analyzeTableTennisSlip([leg('Alice Smith')],{referenceTime:'2099-09-20T21:00:00.000Z',now:Date.parse('2099-09-20T21:00:00.000Z')});
    assert.equal(result.results[0].status,'UNRESOLVED');
    assert.equal(result.results[0].resolutionReason,'table-tennis-player-market-not-found-and-no-unambiguous-official-match');
  });
});

test('findTableTennisMatch requires both sportsbook opponents when an event row exists',()=>{
  const found=findTableTennisMatch(live,leg('Alice Smith'),{referenceTime:start,eventRow:odds.rows[0]});
  assert.ok(found);
  const wrong={...odds.rows[0],awayTeam:'Different Player'};
  assert.equal(findTableTennisMatch(live,leg('Alice Smith'),{referenceTime:start,eventRow:wrong}),null);
});

test('gradeTableTennisMatch keeps a final without a unique winner unresolved',()=>{
  const noWinner=match({state:'post',final:true,resultStatus:'OFFICIAL',overallScore:'2-2',players:[{id:'a',name:'SMITH Alice',winner:null},{id:'b',name:'JONES Bob',winner:null}]});
  const row=gradeTableTennisMatch(leg('Alice Smith'),{match:noWinner,player:noWinner.players[0]});
  assert.equal(row.status,'UNRESOLVED');
  assert.equal(row.resolutionReason,'table-tennis-winner-not-available');
});
