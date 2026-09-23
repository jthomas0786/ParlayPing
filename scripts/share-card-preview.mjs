import fs from 'node:fs';
import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';

const require = createRequire(import.meta.url);
const { prepareShareSvg, renderPng } = require('../server/api/share-card');

const slip = {
  source:'X @ParlayPing',
  combinedOddsAmerican:+645,
  combinedOddsVerified:true,
  legs:[
    { sport:'NFL', player:'Josh Allen', playerId:'3918298', playerImageUrl:'https://a.espncdn.com/i/headshots/nfl/players/full/3918298.png', team:'BUF', market:'Passing Yards', side:'over', line:249.5, oddsAmerican:-110, pregameProbability:.61, status:'LIVE', liveProbability:.72, progressText:'188 / 250 yards' },
    { sport:'NFL', player:'Derrick Henry', playerId:'3043078', playerImageUrl:'https://a.espncdn.com/i/headshots/nfl/players/full/3043078.png', team:'BAL', market:'Rushing Yards', side:'over', line:84.5, oddsAmerican:-115, pregameProbability:.64, status:'LIVE', liveProbability:.69, progressText:'62 / 85 yards' },
    { sport:'NFL', player:'James Cook', playerId:'4379399', playerImageUrl:'https://a.espncdn.com/i/headshots/nfl/players/full/4379399.png', team:'BUF', market:'Rushing Yards', side:'over', line:69.5, oddsAmerican:+105, pregameProbability:.57, status:'PENDING' },
    { sport:'NFL', player:'Saquon Barkley', playerId:'3929630', playerImageUrl:'https://a.espncdn.com/i/headshots/nfl/players/full/3929630.png', team:'PHI', market:'Rushing Yards', side:'over', line:79.5, oddsAmerican:+120, pregameProbability:.54, status:'PENDING' },
    { sport:'NFL', player:'Travis Kelce', playerId:'15847', playerImageUrl:'https://a.espncdn.com/i/headshots/nfl/players/full/15847.png', team:'KC', market:'Receiving Yards', side:'over', line:54.5, oddsAmerican:+135, pregameProbability:.49, status:'PENDING' },
  ],
};

const svg = await prepareShareSvg({ slip, context:'x_reply', pageUrl:'https://parlayping.net/build/demo' });
fs.mkdirSync('artifacts', { recursive:true });
fs.writeFileSync('artifacts/share-card-preview.svg', svg);
const fullPng = await renderPng(svg);
fs.writeFileSync('artifacts/share-card-preview-1200.png', fullPng);
const smallPng = new Resvg(svg, { fitTo:{ mode:'width', value:506 }, font:{ loadSystemFonts:true } }).render().asPng();
fs.writeFileSync('artifacts/share-card-preview-506.png', smallPng);

if(!svg.includes('class="pp-approved-lockup"'))throw new Error('Approved ParlayPing lockup was not inlined into share card SVG.');
if(svg.includes('https://a.espncdn.com/i/headshots/'))throw new Error('Remote ESPN headshots survived instead of being embedded.');
const avatarImages=(svg.match(/clip-path="url\(#avatar-/g)||[]).length;
if(avatarImages!==5)throw new Error(`Expected 5 embedded player headshots in share card SVG, got ${avatarImages}.`);
const embeddedPngs=(svg.match(/data:image\/(?:png|jpeg|jpg);base64,/g)||[]).length;
if(embeddedPngs<5)throw new Error(`Expected at least 5 embedded raster assets, got ${embeddedPngs}.`);
console.log('Rendered ParlayPing share card through production asset path with approved lockup and embedded player headshots.');
