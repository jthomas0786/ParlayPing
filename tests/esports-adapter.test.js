const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeEsportsSlip,findEsportsOddsEvent,findEsportsFinal,gradeFinal}=require('../lib/esports-adapter');

const start='2099-09-20T20:00:00.000Z';
const odds={schemaVersion:1,meta:{source:'parlayapi-pinnacle',fetchedAt:'2099-09-20T18:00:00.000Z'},rows:[
  {eventId:'cs2-1',sportKey:'esports_cs2',game:'CS2',commenceTime:start,homeTeam:'Team Alpha',awayTeam:'Team Bravo',selection:'Team Alpha',market:'matchWinner',book:'Pinnacle',bookKey:'pinnacle',price:-125,fairProbability:0.54,snapshotTime:'2099-09-20T18:00:00.000Z'},
  {eventId:'cs2-1',sportKey:'esports_cs2',game:'CS2',commenceTime:start,homeTeam:'Team Alpha',awayTeam:'Team Bravo',selection:'Team Bravo',market:'matchWinner',book:'Pinnacle',bookKey:'pinnacle',price:105,fairProbability:0.46,snapshotTime:'2099-09-20T18:00:00.000Z'}
]};
const final={schemaVersion:1,source:'parlayapi-results-archive',sport:'ESPORTS',generatedAt:'2099-09-20T22:00:00.000Z',finalOnly:true,liveCoverage:false,matches:{
  'cs2-1':{id:'cs2-1',sport:'ESPORTS',sportKey:'esports_cs2',game:'CS2',commenceTime:start,homeTeam:'Team Alpha',awayTeam:'Team Bravo',homeScore:2,awayScore:1,status:'FINAL',final:true,voidLike:false,winner:'Team Alpha'}
}};
const voidFinal={...final,matches:{'cs2-1':{...final.matches['cs2-1'],voidLike:true,winner:null,resultStatus:'VOID'}}};

function response(data,status=200){return {ok:status>=200&&status<300,status,json:async()=>data};}
function withSnapshots({oddsSnapshot=odds,resultSnapshot=final}={},fn){
  const original=global.fetch;
  global.fetch=async url=>{
    const value=String(url);
    if(value.endsWith('/esports-match-odds.json'))return response(oddsSnapshot);
    if(value.endsWith('/esports-results.json'))return resultSnapshot?response(resultSnapshot):response(null,404);
    throw new Error(`unexpected URL ${value}`);
  };
  return Promise.resolve().then(fn).finally(()=>{global.fetch=original;});
}
const leg=(team,market='matchWinner')=>({sport:'ESPORTS',player:team,market,side:'yes',line:null,inclusive:true});

test('pregame esports match winner uses de-vigged Pinnacle h2h probability',async()=>withSnapshots({resultSnapshot:null},async()=>{
  const result=await analyzeEsportsSlip([leg('Team Alpha')],{referenceTime:'2099-09-20T18:30:00.000Z',now:Date.parse('2099-09-20T18:30:00.000Z')});
  const row=result.results[0];
  assert.equal(row.status,'PENDING');
  assert.equal(row.probabilityMethod,'pinnacle-devig-h2h');
  assert.equal(row.probability,0.54);
  assert.equal(row.gameId,'cs2-1');
}));

test('started esports match stays unresolved until archived final exists',async()=>withSnapshots({resultSnapshot:null},async()=>{
  const result=await analyzeEsportsSlip([leg('Team Alpha')],{referenceTime:start,now:Date.parse('2099-09-20T20:30:00.000Z')});
  assert.equal(result.results[0].status,'UNRESOLVED');
  assert.equal(result.results[0].resolutionReason,'esports-final-result-not-yet-available');
}));

test('archived clean esports winner grades HIT',async()=>withSnapshots({},async()=>{
  const result=await analyzeEsportsSlip([leg('Team Alpha')],{referenceTime:start,now:Date.parse('2099-09-20T22:00:00.000Z')});
  assert.equal(result.results[0].status,'HIT');
  assert.equal(result.results[0].current,1);
}));

test('archived clean esports loser grades MISS',async()=>withSnapshots({},async()=>{
  const result=await analyzeEsportsSlip([leg('Team Bravo')],{referenceTime:start,now:Date.parse('2099-09-20T22:00:00.000Z')});
  assert.equal(result.results[0].status,'MISS');
  assert.equal(result.results[0].current,0);
}));

test('void-like esports final fails closed',async()=>withSnapshots({resultSnapshot:voidFinal},async()=>{
  const result=await analyzeEsportsSlip([leg('Team Alpha')],{referenceTime:start,now:Date.parse('2099-09-20T22:00:00.000Z')});
  assert.equal(result.results[0].status,'UNRESOLVED');
  assert.equal(result.results[0].resolutionReason,'esports-final-void-like');
}));

test('unsupported esports player prop fails closed instead of using fantasy rows',async()=>withSnapshots({},async()=>{
  const result=await analyzeEsportsSlip([leg('Some Player','killsMaps12')],{referenceTime:start,now:Date.parse('2099-09-20T18:00:00.000Z')});
  assert.equal(result.results[0].status,'UNRESOLVED');
  assert.equal(result.results[0].resolutionReason,'esports-market-not-supported-by-trustworthy-match-feed');
}));

test('final match pairing requires both teams when sportsbook event is available',()=>{
  const event=findEsportsOddsEvent(odds,leg('Team Alpha'),{referenceTime:start});
  assert.ok(event);
  assert.ok(findEsportsFinal(final,leg('Team Alpha'),{referenceTime:start,eventRow:event}));
  const wrong={...event,awayTeam:'Different Team'};
  assert.equal(findEsportsFinal(final,leg('Team Alpha'),{referenceTime:start,eventRow:wrong}),null);
});

test('ambiguous same-team finals without sportsbook anchor are not guessed',()=>{
  const ambiguous={...final,matches:{
    one:final.matches['cs2-1'],
    two:{...final.matches['cs2-1'],id:'cs2-2',awayTeam:'Team Charlie',commenceTime:'2099-09-20T22:00:00.000Z'}
  }};
  assert.equal(findEsportsFinal(ambiguous,leg('Team Alpha'),{referenceTime:'2099-09-20T21:00:00.000Z',eventRow:null}),null);
});

test('gradeFinal refuses a final without a winner',()=>{
  const noWinner={...final.matches['cs2-1'],winner:null};
  const row=gradeFinal(leg('Team Alpha'),noWinner,odds.rows[0]);
  assert.equal(row.status,'UNRESOLVED');
  assert.equal(row.resolutionReason,'esports-final-winner-not-available');
});
