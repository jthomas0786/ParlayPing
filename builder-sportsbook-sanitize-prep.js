(()=>{
  const state=window.__PARLAYPING_BUILDER__||{};
  const slip=state.slip||{};
  const ALLOWED=new Set(['DraftKings','FanDuel','bet365','Caesars','theScore Bet','BetMGM','Fanatics','ESPN BET','Hard Rock','Hard Rock Bet','BetRivers','Pinnacle','Parx','Parx Casino','Bovada','Fliff']);
  const aliases={
    draftkings:'DraftKings',draftkingssportsbook:'DraftKings',dk:'DraftKings',
    fanduel:'FanDuel',fanduelsportsbook:'FanDuel',fd:'FanDuel',
    bet365:'bet365','365':'bet365',caesars:'Caesars',williamhill:'Caesars',caesarssportsbook:'Caesars',
    thescorebet:'theScore Bet',thescore:'theScore Bet',betmgm:'BetMGM',mgm:'BetMGM',
    fanatics:'Fanatics',fanaticssportsbook:'Fanatics',espnbet:'ESPN BET',espn:'ESPN BET',
    hardrock:'Hard Rock Bet',hardrockbet:'Hard Rock Bet',betrivers:'BetRivers',pinnacle:'Pinnacle',
    parx:'Parx Casino',parxcasino:'Parx Casino',bovada:'Bovada',fliff:'Fliff'
  };
  function book(value){
    const raw=String(value||'').trim();
    const key=raw.toLowerCase().replace(/[^a-z0-9]/g,'');
    const normalized=aliases[key]||raw;
    return ALLOWED.has(normalized)?normalized:null;
  }
  function validOdds(value){
    if(value===null||value===undefined||value==='')return false;
    const n=Number(value);return Number.isFinite(n)&&n!==0;
  }
  function filterMap(map,{requirePrice=false}={}){
    if(!map||typeof map!=='object'||Array.isArray(map))return {};
    const out={};
    for(const [raw,value] of Object.entries(map)){
      const normalized=book(raw);if(!normalized)continue;
      if(requirePrice&&!validOdds(value?.oddsAmerican??value?.price??value?.odds))continue;
      out[normalized]=value;
    }
    return out;
  }

  slip.sportsbook=book(slip.sportsbook);
  slip.sportsbookLinks=filterMap(slip.sportsbookLinks);
  for(const leg of Array.isArray(slip.legs)?slip.legs:[]){
    leg.sportsbook=book(leg.sportsbook);
    if(!validOdds(leg.oddsAmerican))delete leg.oddsAmerican;
    if(!leg.sportsbook)delete leg.sportsbookLink;
    leg.bookOffers=filterMap(leg.bookOffers,{requirePrice:true});
    leg.altLinesByBook=filterMap(leg.altLinesByBook);
  }
})();
