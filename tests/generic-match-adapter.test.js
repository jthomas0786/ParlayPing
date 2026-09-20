const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeGenericMatchSlip,findGenericOddsEvent}=require('../lib/generic-match-adapter');
const {normalizeSport}=require('../api/lib/sport-router');

const start='2099-09-20T20:00:00.000Z';
const snapshot={schemaVersion:1,meta:{source:'parlayapi-pinnacle',fetchedAt:'2099-09-20T18:00:00.000Z',settlementConnected:false},rows:[
  {eventId:'volley-1',sport:'VOLLEYBALL',sportKey:'volleyball',commenceTime:start,homeTeam:'Team A',awayTeam:'Team B',selection:'Team A',market:'matchWinner',book:'Pinnacle',bookKey:'pinnacle',price:-120,fairProbability:0.53},
  {eventId:'volley-1',sport:'VOLLEYBALL',sportKey:'volleyball',commenceTime:start,homeTeam:'Team A',awayTeam:'Team B',selection:'Team B',market:'matchWinner',book:'Pinnacle',bookKey:'pinnacle',price:100,fairProbability:0.47},
  {eventId:'cricket-1',sport:'CRICKET',sportKey:'cricket_caribbean_premier_league',commenceTime:start,homeTeam:'Trinbago Knight Riders',awayTeam:'Guyana Amazon Warriors',selection:'Trinbago Knight Riders',market:'matchWinner',book:'Pinnacle',bookKey:'pinnacle',price:-105,fairProbability:0.51},
  {eventId:'cricket-1',sport:'CRICKET',sportKey:'cricket_caribbean_premier_league',commenceTime:start,homeTeam:'Trinbago Knight Riders',awayTeam:'Guyana Amazon Warriors',selection:'Guyana Amazon Warriors',market:'matchWinner',book:'Pinnacle',bookKey:'pinnacle',price:-101,fairProbability:0.49},
  {eventId:'boxing-1',sport:'BOXING',sportKey:'boxing_boxing',commenceTime:start,homeTeam:'Fighter One',awayTeam:'Fighter Two',selection:'Fighter One',market:'matchWinner',book:'Pinnacle',bookKey:'pinnacle',price:-150,fairProbability:0.58},
  {eventId:'boxing-1',sport:'BOXING',sportKey:'boxing_boxing',commenceTime:start,homeTeam:'Fighter One',awayTeam:'Fighter Two',selection:'Fighter Two',market:'matchWinner',book:'Pinnacle',bookKey:'pinnacle',price:120,fairProbability:0.42}
]};
function response(data,status=200){return {ok:status>=200&&status<300,status,json:async()=>data};}
function withSnapshot(data,fn){const original=global.fetch;global.fetch=async()=>response(data);return Promise.resolve().then(fn).finally(()=>{global.fetch=original;});}
const leg=(sport,selection,market='matchWinner')=>({sport,player:selection,market,side:'yes',line:null,inclusive:true});

test('generic Volleyball match winner uses de-vigged Pinnacle probability',async()=>withSnapshot(snapshot,async()=>{
  const result=await analyzeGenericMatchSlip('VOLLEYBALL',[leg('VOLLEYBALL','Team A')],{referenceTime:'2099-09-20T18:00:00.000Z',now:Date.parse('2099-09-20T18:00:00.000Z')});
  assert.equal(result.results[0].status,'PENDING');
  assert.equal(result.results[0].probability,0.53);
  assert.equal(result.results[0].probabilityMethod,'pinnacle-devig-h2h');
}));

test('generic Cricket match winner uses current two-way sportsbook event',async()=>withSnapshot(snapshot,async()=>{
  const result=await analyzeGenericMatchSlip('CRICKET',[leg('CRICKET','Guyana Amazon Warriors')],{referenceTime:'2099-09-20T18:00:00.000Z',now:Date.parse('2099-09-20T18:00:00.000Z')});
  assert.equal(result.results[0].status,'PENDING');
  assert.equal(result.results[0].gameId,'cricket-1');
  assert.equal(result.results[0].probability,0.49);
}));

test('generic Boxing match winner stays unresolved after start',async()=>withSnapshot(snapshot,async()=>{
  const result=await analyzeGenericMatchSlip('BOXING',[leg('BOXING','Fighter One')],{referenceTime:start,now:Date.parse('2099-09-20T20:05:00.000Z')});
  assert.equal(result.results[0].status,'UNRESOLVED');
  assert.equal(result.results[0].resolutionReason,'boxing-trustworthy-live-final-source-not-connected');
}));

test('unsupported generic market fails closed',async()=>withSnapshot(snapshot,async()=>{
  const result=await analyzeGenericMatchSlip('VOLLEYBALL',[leg('VOLLEYBALL','Team A','playerPoints')],{now:Date.parse('2099-09-20T18:00:00.000Z')});
  assert.equal(result.results[0].status,'UNRESOLVED');
  assert.equal(result.results[0].resolutionReason,'volleyball-market-not-supported-by-two-way-match-feed');
}));

test('same selection in multiple nearby events is not guessed',()=>{
  const ambiguous={...snapshot,rows:[...snapshot.rows,
    {eventId:'volley-2',sport:'VOLLEYBALL',sportKey:'volleyball',commenceTime:'2099-09-20T21:00:00.000Z',homeTeam:'Team A',awayTeam:'Team C',selection:'Team A',market:'matchWinner',book:'Pinnacle',bookKey:'pinnacle',price:-110,fairProbability:0.52},
    {eventId:'volley-2',sport:'VOLLEYBALL',sportKey:'volleyball',commenceTime:'2099-09-20T21:00:00.000Z',homeTeam:'Team A',awayTeam:'Team C',selection:'Team C',market:'matchWinner',book:'Pinnacle',bookKey:'pinnacle',price:-105,fairProbability:0.48}
  ]};
  assert.equal(findGenericOddsEvent(ambiguous,leg('VOLLEYBALL','Team A'),{referenceTime:'2099-09-20T20:30:00.000Z'}),null);
});

test('explicit gameId safely resolves a repeated generic selection',()=>{
  const ambiguous={...snapshot,rows:[...snapshot.rows,
    {eventId:'volley-2',sport:'VOLLEYBALL',sportKey:'volleyball',commenceTime:'2099-09-20T23:00:00.000Z',homeTeam:'Team A',awayTeam:'Team C',selection:'Team A',market:'matchWinner',book:'Pinnacle',bookKey:'pinnacle',price:-110,fairProbability:0.52}
  ]};
  const row=findGenericOddsEvent(ambiguous,{...leg('VOLLEYBALL','Team A'),gameId:'volley-2'},{referenceTime:start});
  assert.equal(row.eventId,'volley-2');
});

test('generic sport aliases normalize through router',()=>{
  const cases={Volleyball:'VOLLEYBALL',Cricket:'CRICKET',NRL:'RUGBY_LEAGUE','Rugby League':'RUGBY_LEAGUE',AFL:'AFL','Aussie Rules':'AFL',Boxing:'BOXING'};
  for(const [input,expected] of Object.entries(cases))assert.equal(normalizeSport(input),expected);
});
