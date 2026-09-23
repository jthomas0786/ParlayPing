const test=require('node:test');
const assert=require('node:assert/strict');
const {mlbHeuristic,canonicalizeMlbLeg,sanitizeMlbLeg,likelyPlayerName,MLB_MARKETS}=require('../lib/mlb-parser-extension');
const {parseSlip,mergeMlbLegs}=require('../lib/slip-parser-wrapper');

test('MLB parser captures common hitter and pitcher markets beyond the legacy six',()=>{
  const legs=mlbHeuristic([
    'MLB',
    'Tarik Skubal Over 7.5 Pitcher Strikeouts',
    'Riley Greene 2+ Runs + RBI',
    'Coby Mayo 1+ Extra Base Hits',
    'Joe Ryan Over 17.5 Pitching Outs',
    'Byron Buxton Over 0.5 Batter Strikeouts'
  ].join('\n'));
  assert.deepEqual(legs.map(l=>l.market),['pitcherStrikeouts','runsRbi','extraBaseHits','pitchingOuts','batterStrikeouts']);
  assert.equal(legs[0].line,7.5);
  assert.equal(legs[1].line,2);
  assert.equal(legs[1].inclusive,true);
});

test('MLB parser canonicalizes common aliases and preserves explicit custom MLB market keys',()=>{
  assert.equal(canonicalizeMlbLeg({sport:'MLB',player:'Riley Greene',market:'homeRuns',side:'yes',line:null})?.market,'homeRun');
  assert.equal(canonicalizeMlbLeg({sport:'MLB',player:'Tarik Skubal',market:'pitcherKs',side:'over',line:7.5})?.market,'pitcherStrikeouts');
  const custom=sanitizeMlbLeg({sport:'MLB',player:'Test Player',market:'fantasyScore',side:'over',line:8.5,originalText:'Test Player Over 8.5 Fantasy Score'});
  assert.equal(custom?.market,'fantasyScore');
  assert.ok(MLB_MARKETS.has('pitcherStrikeouts'));
});

test('MLB parser rejects slip titles and league labels as fake players',()=>{
  assert.equal(likelyPlayerName('MLB'),false);
  assert.equal(likelyPlayerName('MLB HIT MEGA'),false);
  assert.equal(sanitizeMlbLeg({sport:'MLB',player:'MLB',market:'hits',side:'over',line:2,originalText:'MLB HIT MEGA https://t.co/example'}),null);
  assert.ok(sanitizeMlbLeg({sport:'MLB',player:'Leonardo Bernal',team:'ST. LOUIS CARDINALS',market:'hits',side:'over',line:0.5,originalText:'Leonardo Bernal — TO RECORD A HIT'}));
});

test('MLB wrapper collapses equivalent OCR/vision duplicate thresholds without collapsing real alternate lines',()=>{
  const shared={sport:'MLB',player:'Leonardo Bernal',team:'ST. LOUIS CARDINALS',market:'hits',side:'over'};
  const merged=mergeMlbLegs([
    {...shared,line:0.5,inclusive:false,originalText:'TO RECORD A HIT'},
    {...shared,line:0,inclusive:false,originalText:'Leonardo Bernal — TO RECORD A HIT'},
    {...shared,line:1.5,inclusive:false,originalText:'Leonardo Bernal Over 1.5 Hits'}
  ],[]);
  assert.equal(merged.length,2);
  assert.deepEqual(merged.map(row=>row.line).sort((a,b)=>a-b),[0.5,1.5]);
});

test('active slip parser merges expanded MLB heuristic legs instead of silently dropping them',async()=>{
  const original=process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try{
    const parsed=await parseSlip({text:'MLB\nTarik Skubal Over 7.5 Pitcher Strikeouts\nRiley Greene 2+ Runs + RBI',mediaUrls:[]});
    assert.equal(parsed.sport,'MLB');
    assert.deepEqual(parsed.legs.map(l=>l.market),['pitcherStrikeouts','runsRbi']);
    assert.ok(parsed.mlbParser);
  }finally{
    if(original===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=original;
  }
});

test('active MLB wrapper leaves non-MLB base parsing behavior intact',async()=>{
  const original=process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try{
    const parsed=await parseSlip({text:'NBA\nStephen Curry 4+ Made Threes',mediaUrls:[]});
    assert.equal(parsed.sport,'NBA');
    assert.equal(parsed.legs.length,1);
    assert.equal(parsed.legs[0].market,'threes');
    assert.equal(parsed.legs[0].line,4);
  }finally{
    if(original===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=original;
  }
});
