const MAX_MATCH_DISTANCE_MS=48*60*60*1000;

const finite=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const clean=v=>String(v??'').trim();
const normName=value=>clean(value).toLowerCase().normalize('NFKD').replace(/[.'’]/g,'').replace(/\b(jr|sr|ii|iii|iv|v)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const normNameTokens=value=>normName(value).split(' ').filter(Boolean).sort().join(' ');
function samePerson(a,b){
  const x=normName(a),y=normName(b);
  if(!x||!y)return false;
  return x===y||normNameTokens(x)===normNameTokens(y);
}
const normTeam=value=>clean(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'');
function sameTeam(a,b){
  const x=normTeam(a),y=normTeam(b);
  if(!x||!y)return false;
  return x===y||x.includes(y)||y.includes(x);
}
function teamMatchesNode(value,node){
  if(!value||!node)return false;
  return sameTeam(value,node.name)||sameTeam(value,node.abbr);
}
function dateDistance(a,b){
  const x=Date.parse(a||''),y=Date.parse(b||'');
  return Number.isFinite(x)&&Number.isFinite(y)?Math.abs(x-y):Infinity;
}
function targetStart(referenceTime,eventRow){
  return eventRow?.commenceTime||referenceTime||null;
}
function withinWindow(start,anchor){
  if(!anchor)return true;
  return dateDistance(start,anchor)<=MAX_MATCH_DISTANCE_MS;
}
function soccerPlayer(game,leg){
  return (game?.players||[]).find(p=>samePerson(p?.name,leg?.player))||null;
}
function soccerTeamScore(game,eventRow){
  if(!eventRow)return 0;
  const home=eventRow.homeTeam,away=eventRow.awayTeam;
  if(!home&&!away)return 0;
  const direct=(!home||teamMatchesNode(home,game?.home))&&(!away||teamMatchesNode(away,game?.away));
  if(direct)return 0;
  const swapped=(!home||teamMatchesNode(home,game?.away))&&(!away||teamMatchesNode(away,game?.home));
  if(swapped)return 2;
  return 20;
}
function findSoccerGame(snapshot,leg,{referenceTime,eventRow}={}){
  const anchor=targetStart(referenceTime,eventRow);
  const candidates=[];
  for(const game of Object.values(snapshot?.games||{})){
    const player=soccerPlayer(game,leg);if(!player)continue;
    if(!withinWindow(game?.startTime,anchor))continue;
    const teamPenalty=soccerTeamScore(game,eventRow);if(teamPenalty>=20)continue;
    const timePenalty=anchor?dateDistance(game?.startTime,anchor)/3600000:0;
    candidates.push({game,player,score:teamPenalty+timePenalty});
  }
  candidates.sort((a,b)=>a.score-b.score);
  return candidates[0]||null;
}
function tennisPlayer(match,leg){
  return (match?.players||[]).find(p=>samePerson(p?.name,leg?.player))||null;
}
function tennisOpponentNames(eventRow){
  return [eventRow?.homeTeam,eventRow?.awayTeam].filter(Boolean);
}
function tennisEventScore(match,eventRow){
  if(!eventRow)return 0;
  const bookPlayers=tennisOpponentNames(eventRow);
  if(!bookPlayers.length)return 0;
  const livePlayers=(match?.players||[]).map(p=>p?.name).filter(Boolean);
  const allMatched=bookPlayers.every(name=>livePlayers.some(p=>samePerson(name,p)));
  return allMatched?0:20;
}
function findTennisMatch(snapshot,leg,{referenceTime,eventRow}={}){
  const anchor=targetStart(referenceTime,eventRow);
  const candidates=[];
  for(const match of Object.values(snapshot?.matches||{})){
    const player=tennisPlayer(match,leg);if(!player)continue;
    if(!withinWindow(match?.startTime,anchor))continue;
    const eventPenalty=tennisEventScore(match,eventRow);if(eventPenalty>=20)continue;
    const timePenalty=anchor?dateDistance(match?.startTime,anchor)/3600000:0;
    candidates.push({match,player,score:eventPenalty+timePenalty});
  }
  candidates.sort((a,b)=>a.score-b.score);
  return candidates[0]||null;
}
function soccerCurrent(player,market){
  const fields={shots:'shots',shotsOnTarget:'shotsOnTarget',assists:'assists',goalsAssists:'goalsAssists',fouls:'fouls',goals:'goals',anytimeGoal:'goals',toReceiveCard:'cards',saves:'saves'};
  const field=fields[market];
  return field?finite(player?.[field]):null;
}
function tiebreaksPlayed(match){
  const players=match?.players||[];if(players.length<2)return null;
  const a=players[0]?.linescores||[],b=players[1]?.linescores||[];
  const n=Math.min(a.length,b.length);if(!n)return null;
  let count=0;
  for(let i=0;i<n;i++){
    const x=finite(a[i]),y=finite(b[i]);
    if(x===null||y===null)continue;
    if((x===7&&y===6)||(x===6&&y===7))count++;
  }
  return count;
}
function tennisCurrent(match,player,market){
  if(market==='matchWinner')return typeof player?.winner==='boolean'?(player.winner?1:0):null;
  if(market==='gamesWon')return finite(player?.gamesWon);
  if(market==='gamesPlayed')return finite(match?.gamesPlayed);
  if(market==='setsWon')return finite(player?.setsWon);
  if(market==='setsPlayed')return finite(match?.setsPlayed??player?.setsPlayed);
  if(market==='tiebreaksPlayed')return tiebreaksPlayed(match);
  const fields={aces:'aces',doubleFaults:'doubleFaults',breakPointsWon:'breakPointsWon',firstSetAces:'firstSetAces'};
  const field=fields[market];
  return field?finite(player?.[field]):null;
}
function binaryResult(leg,current,final){
  const happened=Number(current)>=1,wantsNo=String(leg?.side||'yes').toLowerCase()==='no';
  if(happened)return wantsNo?'MISS':'HIT';
  if(final)return wantsNo?'HIT':'MISS';
  return 'LIVE';
}
function numericResult(leg,current,final){
  const value=finite(current),line=finite(leg?.line);if(value===null||line===null)return null;
  const side=String(leg?.side||'over').toLowerCase();
  if(side==='under'){
    if(value>line)return 'MISS';
    if(!final)return 'LIVE';
    if(value<line)return 'HIT';
    return 'PUSH';
  }
  const hit=leg?.inclusive?value>=line:value>line;
  if(hit)return 'HIT';
  if(!final)return 'LIVE';
  if(!leg?.inclusive&&value===line)return 'PUSH';
  return 'MISS';
}
function baseEventFields(kind,node){
  if(kind==='SOCCER')return {gameId:String(node?.id||''),matchup:`${node?.away?.name||node?.away?.abbr||''} @ ${node?.home?.name||node?.home?.abbr||''}`.trim(),startTimeUTC:node?.startTime||null,gameState:node?.final?'post':node?.state||null,clock:node?.clock||null,period:node?.period??null};
  return {gameId:String(node?.id||''),matchup:(node?.players||[]).map(p=>p?.name).filter(Boolean).join(' vs '),startTimeUTC:node?.startTime||null,gameState:node?.final?'post':node?.state||null,period:node?.period??null};
}
function unresolved(leg,reason,fields={}){return {...leg,...fields,status:'UNRESOLVED',resolutionReason:reason,current:null,probability:null,probabilityPct:null,probabilityMethod:null,marketOptions:[]};}
function gradeSoccerLeg(leg,snapshot,options={}){
  const found=findSoccerGame(snapshot,leg,options);if(!found)return null;
  const {game,player}=found;const fields=baseEventFields('SOCCER',game);
  if(game?.state==='pre'&&!game?.final)return null;
  if(game?.final&&!player?.appeared)return unresolved(leg,'soccer-player-did-not-appear',fields);
  const current=soccerCurrent(player,leg?.market);
  if(current===null)return unresolved(leg,'soccer-live-stat-not-available',fields);
  const binary=['anytimeGoal','toReceiveCard'].includes(leg?.market);
  const status=binary?binaryResult(leg,current,Boolean(game?.final)):numericResult(leg,current,Boolean(game?.final));
  if(status==='PUSH')return unresolved(leg,'soccer-final-result-is-push',{...fields,current});
  if(!status)return unresolved(leg,'soccer-line-not-gradeable',{...fields,current});
  return {...leg,...fields,status,resolutionReason:null,current,probability:null,probabilityPct:null,probabilityMethod:null,marketOptions:[]};
}
function gradeTennisLeg(leg,snapshot,options={}){
  const found=findTennisMatch(snapshot,leg,options);if(!found)return null;
  const {match,player}=found;const fields=baseEventFields('TENNIS',match);
  if(match?.state==='pre'&&!match?.final)return null;
  if(leg?.market==='matchWinner'){
    if(!match?.final)return {...leg,...fields,status:'LIVE',resolutionReason:null,current:null,probability:null,probabilityPct:null,probabilityMethod:null,marketOptions:[]};
    const current=tennisCurrent(match,player,leg.market);if(current===null)return unresolved(leg,'tennis-winner-not-available',fields);
    const status=binaryResult(leg,current,true);
    return {...leg,...fields,status,resolutionReason:null,current,probability:null,probabilityPct:null,probabilityMethod:null,marketOptions:[]};
  }
  const current=tennisCurrent(match,player,leg?.market);
  if(current===null)return unresolved(leg,'tennis-live-stat-not-available',fields);
  const status=numericResult(leg,current,Boolean(match?.final));
  if(status==='PUSH')return unresolved(leg,'tennis-final-result-is-push',{...fields,current});
  if(!status)return unresolved(leg,'tennis-line-not-gradeable',{...fields,current});
  return {...leg,...fields,status,resolutionReason:null,current,probability:null,probabilityPct:null,probabilityMethod:null,marketOptions:[]};
}
function gradeExtendedLiveLeg(sport,leg,snapshot,options={}){
  if(sport==='SOCCER')return gradeSoccerLeg(leg,snapshot,options);
  if(sport==='TENNIS')return gradeTennisLeg(leg,snapshot,options);
  return null;
}

module.exports={MAX_MATCH_DISTANCE_MS,normName,samePerson,sameTeam,findSoccerGame,findTennisMatch,soccerCurrent,tennisCurrent,tiebreaksPlayed,numericResult,binaryResult,gradeSoccerLeg,gradeTennisLeg,gradeExtendedLiveLeg};
