const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');

const modulePath=path.join(__dirname,'../server/api/lib/nfl-sportsbook-pregame-fallback.js');
const realFetch=global.fetch;
const sourceUrl='https://thesportsoutpost.com/slates/nfl-odds.json';
const backupUrl='https://raw.githubusercontent.com/jthomas0786/The-Sports-Outpost/main/slates/nfl-odds.json';

function fresh(){
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}
function snapshot(fetchedAt=new Date().toISOString()){
  return {meta:{source:'parlayapi',sample:false,fetchedAt},games:[{
    gameId:'nfl-future-999',startDateUTC:'2099-10-02T00:15:00Z',
    awayTeam:'PIT',homeTeam:'CLE',players:[]
  }]};
}
function response(body,{type='application/json',status=200}={}){
  return new Response(body,{status,headers:{'content-type':type}});
}
test.afterEach(()=>{global.fetch=realFetch;delete require.cache[require.resolve(modulePath)];});

test('healthy TSO JSON serves as primary; GitHub is never fetched',async()=>{
  const urls=[];
  const published=snapshot();
  global.fetch=async url=>{urls.push(url);return response(JSON.stringify(published));};
  const value=await fresh().loadNflOddsSnapshot();
  assert.deepEqual(value,published);
  assert.deepEqual(urls,[sourceUrl]);
});

test('HTML rewrite from TSO is recovered from current verified public GitHub snapshot',async()=>{
  const urls=[],published=snapshot();
  global.fetch=async url=>{
    urls.push(url);
    if(url===sourceUrl)return response('<!doctype html><title>TSO 2.0</title>',{type:'text/html'});
    if(url===backupUrl)return response(JSON.stringify(published));
    throw Error('unexpected endpoint '+url);
  };
  const load=fresh().loadNflOddsSnapshot;
  assert.deepEqual(await load(),published);
  assert.deepEqual(await load(),published,'successful verified snapshot is cached');
  assert.deepEqual(urls,[sourceUrl,backupUrl]);
});

test('stale backup fails closed even if its future game slate contains matching players',async()=>{
  global.fetch=async url=>url===sourceUrl
    ?response('<!doctype html><title>app shell</title>',{type:'text/html'})
    :response(JSON.stringify(snapshot(new Date(Date.now()-7*60*60*1000).toISOString())));
  await assert.rejects(fresh().loadNflOddsSnapshot(),/fresh verified NFL sportsbook odds snapshot is unavailable/);
});

test('incorrectly sourced or simulated GitHub backup cannot masquerade as real odds',async()=>{
  global.fetch=async url=>url===sourceUrl
    ?response('<!doctype html><title>app shell</title>',{type:'text/html'})
    :response(JSON.stringify({meta:{source:'manual',sample:true,fetchedAt:new Date().toISOString()},games:[]}));
  await assert.rejects(fresh().loadNflOddsSnapshot(),/fresh verified NFL sportsbook odds snapshot is unavailable/);
});

test('malformed backup and missing games return errors without inventing odds',async()=>{
  global.fetch=async url=>url===sourceUrl
    ?response('bad upstream',{type:'text/plain'})
    :response(JSON.stringify({meta:{source:'parlayapi',sample:false,fetchedAt:new Date().toISOString()},items:[]}));
  await assert.rejects(fresh().loadNflOddsSnapshot(),/fresh verified NFL sportsbook odds snapshot is unavailable/);
});

test('source requests never include API keys or bearer authorization',async()=>{
  const seen=[];
  global.fetch=async(url,options)=>{seen.push({url,headers:options.headers});return response(JSON.stringify(snapshot()));};
  await fresh().loadNflOddsSnapshot();
  assert.equal(seen.length,1);
  assert.equal(seen[0].headers.authorization,undefined);
  assert.equal(seen[0].headers['x-api-key'],undefined);
});
