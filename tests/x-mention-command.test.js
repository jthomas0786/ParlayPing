const test=require('node:test');
const assert=require('node:assert/strict');
const {
  extractCommandText,
  parseMentionCommand,
  descriptorMatchesLeg,
  saferLineChoice,
  applyMentionCommand,
  commandReplyText
}=require('../server/api/lib/x-mention-command');

function leg(overrides={}){
  return {
    id:'leg-1',sport:'NFL',player:'Test Player',team:'CHI',market:'rushYds',displayMarket:'Rushing Yards',side:'over',line:60.5,sportsbook:'FanDuel',
    altLinesByBook:{
      FanDuel:[
        {line:60.5,side:'over',oddsAmerican:-110,selectionLink:'https://sportsbook.example/fd-60'},
        {line:55.5,side:'over',oddsAmerican:-145,selectionLink:'https://sportsbook.example/fd-55'},
        {line:50.5,side:'over',oddsAmerican:-190,selectionLink:'https://sportsbook.example/fd-50'}
      ],
      DraftKings:[
        {line:55.5,side:'over',oddsAmerican:-140,selectionLink:'https://sportsbook.example/dk-55'},
        {line:50.5,side:'over',oddsAmerican:-185,selectionLink:'https://sportsbook.example/dk-50'}
      ]
    },
    ...overrides
  };
}

test('extracts only the instruction after the explicit ParlayPing tag',()=>{
  assert.equal(extractCommandText('@someone @ParlayPing water down by 2','ParlayPing'),'water down by 2');
  assert.equal(extractCommandText('hey @ParlayPing: just the rushing yards','ParlayPing'),'just the rushing yards');
});

test('recognizes water-down and market-filter commands',()=>{
  const water=parseMentionCommand('@ParlayPing water down by 2');
  assert.equal(water.recognized,true);
  assert.equal(water.actions[0].type,'water_down');
  assert.equal(water.actions[0].steps,2);
  assert.equal(water.actions[0].all,true);

  const filter=parseMentionCommand('@ParlayPing just the rushing yards');
  assert.equal(filter.recognized,true);
  assert.equal(filter.actions[0].type,'only');
  assert.deepEqual(filter.actions[0].descriptor.markets,['rushYds']);
});

test('does not reinterpret ordinary analysis wording as a mutation command',()=>{
  const command=parseMentionCommand('@ParlayPing how is this looking?');
  assert.equal(command.recognized,false);
  assert.deepEqual(command.actions,[]);
});

test('market filters work across sports by canonical market meaning',()=>{
  const command=parseMentionCommand('@ParlayPing just the rushing yards');
  const descriptor=command.actions[0].descriptor;
  assert.equal(descriptorMatchesLeg(descriptor,leg()),true);
  assert.equal(descriptorMatchesLeg(descriptor,{sport:'NBA',player:'A',market:'points',displayMarket:'Points',side:'over',line:20.5}),false);
});

test('generic market filters work for recognized sports beyond the hard-coded aliases',()=>{
  const command=parseMentionCommand('@ParlayPing just corners');
  const descriptor=command.actions[0].descriptor;
  assert.equal(descriptorMatchesLeg(descriptor,{sport:'SOCCER',player:'Arsenal',market:'teamCorners',displayMarket:'Team Corners',side:'over',line:5.5}),true);
  assert.equal(descriptorMatchesLeg(descriptor,{sport:'SOCCER',player:'Arsenal',market:'shots',displayMarket:'Shots',side:'over',line:11.5}),false);
});

test('water down by two picks two safer verified line steps and keeps the original book when possible',()=>{
  const choice=saferLineChoice(leg(),2);
  assert.equal(choice.targetLine,50.5);
  assert.equal(choice.actualSteps,2);
  assert.equal(choice.chosen.book,'FanDuel');
  assert.equal(choice.chosen.oddsAmerican,-190);
  assert.equal(choice.chosen.selectionLink,'https://sportsbook.example/fd-50');
});

test('water down moves unders upward to reduce risk',()=>{
  const under=leg({
    sport:'NBA',market:'points',displayMarket:'Points',side:'under',line:25.5,
    altLinesByBook:{FanDuel:[
      {line:25.5,side:'under',oddsAmerican:-110},
      {line:26.5,side:'under',oddsAmerican:-135},
      {line:27.5,side:'under',oddsAmerican:-165}
    ]}
  });
  const choice=saferLineChoice(under,2);
  assert.equal(choice.targetLine,27.5);
});

test('plain water down adjusts the lower-probability half only',()=>{
  const legs=[
    leg({id:'low',player:'Low Probability',line:60.5}),
    leg({id:'high',player:'High Probability',line:60.5})
  ];
  const analysis={results:[
    {id:'low',probability:.34},
    {id:'high',probability:.66}
  ]};
  const command=parseMentionCommand('@ParlayPing water down');
  const result=applyMentionCommand({legs,analysis,command});
  assert.equal(result.changed,true);
  assert.equal(result.legs.find(row=>row.id==='low').line,55.5);
  assert.equal(result.legs.find(row=>row.id==='high').line,60.5);
  assert.equal(result.applied.find(row=>row.type==='water_down').count,1);
});

test('water down by two applies to every adjustable remaining leg',()=>{
  const legs=[
    leg({id:'one',player:'One'}),
    leg({id:'two',player:'Two'})
  ];
  const analysis={results:[{id:'one',probability:.35},{id:'two',probability:.65}]};
  const command=parseMentionCommand('@ParlayPing water down by 2');
  const result=applyMentionCommand({legs,analysis,command});
  assert.deepEqual(result.legs.map(row=>row.line),[50.5,50.5]);
  assert.equal(result.applied.find(row=>row.type==='water_down').count,2);
});

test('just rushing yards removes every non-rushing leg before building the new slip',()=>{
  const legs=[
    leg({id:'rush',player:'Runner'}),
    {id:'points',sport:'NBA',player:'Guard',market:'points',displayMarket:'Points',side:'over',line:24.5}
  ];
  const command=parseMentionCommand('@ParlayPing just the rushing yards');
  const result=applyMentionCommand({legs,analysis:{results:[]},command});
  assert.equal(result.changed,true);
  assert.deepEqual(result.legs.map(row=>row.id),['rush']);
});

test('water-down commands never invent a line when no verified safer alternate exists',()=>{
  const source=leg({altLinesByBook:{FanDuel:[{line:60.5,side:'over',oddsAmerican:-110}]}});
  const command=parseMentionCommand('@ParlayPing water down');
  const result=applyMentionCommand({legs:[source],analysis:{results:[{id:'leg-1',probability:.3}]},command});
  assert.equal(result.changed,false);
  assert.equal(result.legs[0].line,60.5);
  assert.match(result.publicMessage,/could not find a verified safer alternate line/i);
});

test('command acknowledgement is added only when it fits inside an X reply',()=>{
  const text=commandReplyText('Open betslip → https://parlayping.net/build/test',{summary:'watered down 2 legs by 2 safer line steps'});
  assert.match(text,/^Adjusted: watered down 2 legs by 2 safer line steps\./);
  assert.match(text,/Open betslip/);
});
