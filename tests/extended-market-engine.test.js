const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeExtendedSlip,quoteProbability,rowMatchesLine}=require('../lib/extended-market-engine');
const {samePerson,tiebreaksPlayed}=require('../lib/extended-live-grading');

const future='2099-09-20T20:00:00.000Z';
const snapshot={meta:{fetchedAt:'2099-09-20T15:00:00.000Z'},rows:[
  {eventId:'s1',sport:'SOCCER',commenceTime:future,homeTeam:'Arsenal',awayTeam:'Chelsea',player:'Bukayo Saka',market:'shots',marketKey:'player_shots',line:2.5,binary:false,book:'Book A',overPrice:-110,underPrice:-110},
  {eventId:'s1',sport:'SOCCER',commenceTime:future,homeTeam:'Arsenal',awayTeam:'Chelsea',player:'Bukayo Saka',market:'shots',marketKey:'player_shots',line:2.5,binary:false,book:'Book B',overPrice:-105,underPrice:-115},
  {eventId:'s1',sport:'SOCCER',commenceTime:future,homeTeam:'Arsenal',awayTeam:'Chelsea',player:'Bukayo Saka',market:'anytimeGoal',marketKey:'player_to_score_anytime',line:0.5,binary:true,book:'Book A',overPrice:180,underPrice:null},
  {eventId:'t1',sport:'TENNIS',commenceTime:future,homeTeam:'Player B',awayTeam:'Player A',player:'Player A',market:'matchWinner',marketKey:'player_moneyline',line:0.5,binary:true,book:'Book A',overPrice:-150,underPrice:null},
  {eventId:'t2',sport:'TENNIS',commenceTime:future,homeTeam:'Other Player',awayTeam:'Xiaodi You',player:'Xiaodi You',market:'matchWinner',marketKey:'player_moneyline',line:0.5,binary:true,book:'Book A',overPrice:-125,underPrice:null},
  {eventId:'t1',sport:'TENNIS',commenceTime:future,homeTeam:'Player B',awayTeam:'Player A',player:'Player A',market:'gamesWon',marketKey:'player_games_won',line:6.5,binary:false,book:'Book A',overPrice:-110,underPrice:-110},
  {eventId:'t1',sport:'TENNIS',commenceTime:future,homeTeam:'Player B',awayTeam:'Player A',player:'Player A',market:'tiebreaksPlayed',marketKey:'player_tiebreakers_played',line:0.5,binary:false,book:'Book A',overPrice:120,underPrice:-150},
  {eventId:'t1',sport:'TENNIS',commenceTime:future,homeTeam:'Player B',awayTeam:'Player A',player:'Player A',market:'aces',marketKey:'player_aces',line:4.5,binary:false,book:'Book A',overPrice:-110,underPrice:-110}
]};

const soccerLive={schemaVersion:1,source:'espn-public',sport:'SOCCER',generatedAt:'2099-09-20T20:30:00.000Z',games:{
  espnS1:{id:'espnS1',startTime:future,state:'in',final:false,clock:"63'",period:2,home:{name:'Arsenal FC',abbr:'ARS'},away:{name:'Chelsea',abbr:'CHE'},players:[
    {id:'7',name:'Bukayo Saka',team:'ARS',appeared:true,shots:3,shotsOnTarget:2,assists:0,goals:1,goalsAssists:1,fouls:1,cards:0,saves:null}
  ]}
}};
const soccerFinalDnp={schemaVersion:1,source:'espn-public',sport:'SOCCER',generatedAt:'2099-09-20T22:30:00.000Z',games:{
  espnS1:{id:'espnS1',startTime:future,state:'post',final:true,home:{name:'Arsenal FC',abbr:'ARS'},away:{name:'Chelsea',abbr:'CHE'},players:[
    {id:'7',name:'Bukayo Saka',team:'ARS',appeared:false,shots:0,shotsOnTarget:0,assists:0,goals:0,goalsAssists:0,fouls:0,cards:0,saves:null}
  ]}
}};
const tennisLive={schemaVersion:1,source:'espn-public',sport:'TENNIS',generatedAt:'2099-09-20T20:30:00.000Z',matches:{
  espnT1:{id:'espnT1',startTime:future,state:'in',final:false,period:2,gamesPlayed:15,setsPlayed:2,players:[
    {id:'a',name:'Player A',winner:null,linescores:[7,1],gamesWon:8,setsWon:1,setsPlayed:2,aces:null,doubleFaults:null,breakPointsWon:null,firstSetAces:null},
    {id:'b',name:'Player B',winner:null,linescores:[6,1],gamesWon:7,setsWon:0,setsPlayed:2,aces:null,doubleFaults:null,breakPointsWon:null,firstSetAces:null}
  ]}
}};
const tennisFinal={schemaVersion:1,source:'espn-public',sport:'TENNIS',generatedAt:'2099-09-20T22:30:00.000Z',matches:{
  espnT1:{id:'espnT1',startTime:future,state:'post',final:true,period:2,gamesPlayed:21,setsPlayed:2,players:[
    {id:'a',name:'Player A',winner:true,linescores:[7,6],gamesWon:13,setsWon:2,setsPlayed:2,aces:8,doubleFaults:2,breakPointsWon:3,firstSetAces:5},
    {id:'b',name:'Player B',winner:false,linescores:[6,2],gamesWon:8,setsWon:0,setsPlayed:2,aces:3,doubleFaults:4,breakPointsWon:1,firstSetAces:2}
  ]},
  espnT2:{id:'espnT2',startTime:future,state:'post',final:true,period:2,gamesPlayed:18,setsPlayed:2,players:[
    {id:'x',name:'You Xiaodi',winner:true,linescores:[6,6],gamesWon:12,setsWon:2,setsPlayed:2},
    {id:'o',name:'Other Player',winner:false,linescores:[3,3],gamesWon:6,setsWon:0,setsPlayed:2}
  ]}
}};

function response(data,status=200){return {ok:status>=200&&status<300,status,json:async()=>data};}
function withSnapshots({soccer=null,tennis=null}={},fn){
  const original=global.fetch;
  global.fetch=async url=>{
    const value=String(url);
    if(value.endsWith('/soccer-live.json'))return soccer?response(soccer):response(null,404);
    if(value.endsWith('/tennis-live.json'))return tennis?response(tennis):response(null,404);
    return response(snapshot);
  };
  return Promise.resolve().then(fn).finally(()=>{global.fetch=original;});
}

test('inclusive soccer milestone can match a half-point sportsbook line',()=>{
  assert.equal(rowMatchesLine(snapshot.rows[0],{market:'shots',side:'over',line:3,inclusive:true}),true);
});

test('person matching tolerates reversed first/last name order',()=>{
  assert.equal(samePerson('Xiaodi You','You Xiaodi'),true);
});

test('extended engine de-vigs current two-sided soccer props before kickoff',async()=>withSnapshots({},async()=>{
  const result=await analyzeExtendedSlip('SOCCER',[{sport:'SOCCER',player:'Bukayo Saka',market:'shots',side:'over',line:2.5,inclusive:false}],{referenceTime:'2099-09-20T16:00:00.000Z',now:Date.parse('2099-09-20T16:00:00.000Z')});
  const row=result.results[0];
  assert.equal(row.status,'PENDING');
  assert.equal(row.gameId,'s1');
  assert.ok(Number.isFinite(row.probability));
  assert.equal(row.probabilityMethod,'sportsbook-devig-median');
}));

test('extended engine uses sportsbook implied probability for one-sided match winner before start',async()=>withSnapshots({},async()=>{
  const result=await analyzeExtendedSlip('TENNIS',[{sport:'TENNIS',player:'Player A',market:'matchWinner',side:'yes',line:null,inclusive:true}],{referenceTime:'2099-09-20T16:00:00.000Z',now:Date.parse('2099-09-20T16:00:00.000Z')});
  const row=result.results[0];
  assert.equal(row.status,'PENDING');
  assert.equal(row.probabilityMethod,'sportsbook-implied-median');
  assert.ok(Math.abs(row.probability-0.6)<1e-12);
}));

test('started soccer event fails closed when live feed is unavailable',async()=>withSnapshots({},async()=>{
  const result=await analyzeExtendedSlip('SOCCER',[{sport:'SOCCER',player:'Bukayo Saka',market:'shots',side:'over',line:2.5,inclusive:false}],{referenceTime:'2099-09-20T19:30:00.000Z',now:Date.parse('2099-09-20T21:00:00.000Z')});
  assert.equal(result.results[0].status,'UNRESOLVED');
  assert.equal(result.results[0].resolutionReason,'soccer-live-feed-unavailable');
}));

test('live soccer over is immediately HIT once the threshold is reached',async()=>withSnapshots({soccer:soccerLive},async()=>{
  const result=await analyzeExtendedSlip('SOCCER',[{sport:'SOCCER',player:'Bukayo Saka',market:'shots',side:'over',line:2.5,inclusive:false}],{referenceTime:'2099-09-20T19:30:00.000Z',now:Date.parse('2099-09-20T20:30:00.000Z')});
  const row=result.results[0];
  assert.equal(row.status,'HIT');
  assert.equal(row.current,3);
  assert.equal(row.gameState,'in');
  assert.equal(row.probability,null);
}));

test('live soccer under remains LIVE until it loses or the match ends',async()=>withSnapshots({soccer:soccerLive},async()=>{
  const result=await analyzeExtendedSlip('SOCCER',[{sport:'SOCCER',player:'Bukayo Saka',market:'shots',side:'under',line:3.5,inclusive:false}],{referenceTime:'2099-09-20T19:30:00.000Z',now:Date.parse('2099-09-20T20:30:00.000Z')});
  assert.equal(result.results[0].status,'LIVE');
  assert.equal(result.results[0].current,3);
}));

test('live soccer under becomes MISS as soon as the line is exceeded',async()=>withSnapshots({soccer:soccerLive},async()=>{
  const result=await analyzeExtendedSlip('SOCCER',[{sport:'SOCCER',player:'Bukayo Saka',market:'shots',side:'under',line:2.5,inclusive:false}],{referenceTime:'2099-09-20T19:30:00.000Z',now:Date.parse('2099-09-20T20:30:00.000Z')});
  assert.equal(result.results[0].status,'MISS');
}));

test('live soccer anytime goal grades HIT from an irreversible event',async()=>withSnapshots({soccer:soccerLive},async()=>{
  const result=await analyzeExtendedSlip('SOCCER',[{sport:'SOCCER',player:'Bukayo Saka',market:'anytimeGoal',side:'yes',line:null,inclusive:true}],{referenceTime:'2099-09-20T19:30:00.000Z',now:Date.parse('2099-09-20T20:30:00.000Z')});
  assert.equal(result.results[0].status,'HIT');
  assert.equal(result.results[0].current,1);
}));

test('final soccer DNP is unresolved instead of being graded as a miss',async()=>withSnapshots({soccer:soccerFinalDnp},async()=>{
  const result=await analyzeExtendedSlip('SOCCER',[{sport:'SOCCER',player:'Bukayo Saka',market:'shots',side:'over',line:2.5,inclusive:false}],{referenceTime:'2099-09-20T19:30:00.000Z',now:Date.parse('2099-09-20T23:00:00.000Z')});
  assert.equal(result.results[0].status,'UNRESOLVED');
  assert.equal(result.results[0].resolutionReason,'soccer-player-did-not-appear');
}));

test('live tennis games-won prop grades HIT when the threshold is already reached',async()=>withSnapshots({tennis:tennisLive},async()=>{
  const result=await analyzeExtendedSlip('TENNIS',[{sport:'TENNIS',player:'Player A',market:'gamesWon',side:'over',line:6.5,inclusive:false}],{referenceTime:'2099-09-20T19:30:00.000Z',now:Date.parse('2099-09-20T20:30:00.000Z')});
  assert.equal(result.results[0].status,'HIT');
  assert.equal(result.results[0].current,8);
}));

test('tennis match winner stays LIVE until the match is final',async()=>withSnapshots({tennis:tennisLive},async()=>{
  const result=await analyzeExtendedSlip('TENNIS',[{sport:'TENNIS',player:'Player A',market:'matchWinner',side:'yes',line:null,inclusive:true}],{referenceTime:'2099-09-20T19:30:00.000Z',now:Date.parse('2099-09-20T20:30:00.000Z')});
  assert.equal(result.results[0].status,'LIVE');
  assert.equal(result.results[0].current,null);
}));

test('final tennis match winner grades HIT',async()=>withSnapshots({tennis:tennisFinal},async()=>{
  const result=await analyzeExtendedSlip('TENNIS',[{sport:'TENNIS',player:'Player A',market:'matchWinner',side:'yes',line:null,inclusive:true}],{referenceTime:'2099-09-20T19:30:00.000Z',now:Date.parse('2099-09-20T23:00:00.000Z')});
  assert.equal(result.results[0].status,'HIT');
  assert.equal(result.results[0].current,1);
}));

test('final tennis matching handles reversed player-name order',async()=>withSnapshots({tennis:tennisFinal},async()=>{
  const result=await analyzeExtendedSlip('TENNIS',[{sport:'TENNIS',player:'Xiaodi You',market:'matchWinner',side:'yes',line:null,inclusive:true}],{referenceTime:'2099-09-20T19:30:00.000Z',now:Date.parse('2099-09-20T23:00:00.000Z')});
  assert.equal(result.results[0].status,'HIT');
  assert.match(result.results[0].matchup,/You Xiaodi/);
}));

test('tennis tiebreaks are derived from 7-6 set scores',()=>{
  assert.equal(tiebreaksPlayed(tennisLive.matches.espnT1),1);
});

test('missing advanced tennis stats remain unresolved instead of being guessed',async()=>withSnapshots({tennis:tennisLive},async()=>{
  const result=await analyzeExtendedSlip('TENNIS',[{sport:'TENNIS',player:'Player A',market:'aces',side:'over',line:4.5,inclusive:false}],{referenceTime:'2099-09-20T19:30:00.000Z',now:Date.parse('2099-09-20T20:30:00.000Z')});
  assert.equal(result.results[0].status,'UNRESOLVED');
  assert.equal(result.results[0].resolutionReason,'tennis-live-stat-not-available');
}));

test('quoteProbability does not convert null implied fields to zero',()=>{
  const q=quoteProbability(snapshot,{sport:'SOCCER',player:'Bukayo Saka',market:'shots',side:'over',line:2.5,inclusive:false},snapshot.rows[0]);
  assert.ok(Number.isFinite(q.probability));
});
