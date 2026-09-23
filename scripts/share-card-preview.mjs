import fs from 'node:fs';
import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';

const require = createRequire(import.meta.url);
const { renderShareSvg } = require('../server/api/lib/share-renderer');
const { rasterizeEmbeddedWebp } = require('../server/api/share-card');

const slip = {
  source:'X @ParlayPing',
  legs:[
    { sport:'NCAAF', player:'Skinner', team:'LOU', market:'Receiving Yards', side:'over', line:39.5, oddsAmerican:-115, pregameProbability:.574, status:'MISS' },
    { sport:'NCAAF', player:'Smith', team:'ORE', market:'Receiving Yards', side:'over', line:59.5, oddsAmerican:+105, pregameProbability:.512, status:'LIVE', liveProbability:.632, progressText:'44 / 60 yards' },
    { sport:'NCAAF', player:'Harris', team:'MIA', market:'Receiving Yards', side:'over', line:29.5, oddsAmerican:-110, pregameProbability:.601, status:'HIT' },
    { sport:'NCAAF', player:'Brooks', team:'TEX', market:'Rushing Yards', side:'over', line:74.5, oddsAmerican:+120, pregameProbability:.468, status:'PENDING' },
    { sport:'NCAAF', player:'Carter', team:'OSU', market:'Anytime Touchdown', oddsAmerican:+165, pregameProbability:.377, status:'PENDING' },
  ],
};

const svg = await rasterizeEmbeddedWebp(renderShareSvg({ slip, context:'x_reply', pageUrl:'https://parlayping.net/build/demo' }));
fs.mkdirSync('artifacts', { recursive:true });
fs.writeFileSync('artifacts/share-card-preview.svg', svg);
for (const width of [1200,506]) {
  const png = new Resvg(svg, { fitTo:{ mode:'width', value:width }, font:{ loadSystemFonts:true, defaultFontFamily:'Arial' } }).render().asPng();
  fs.writeFileSync(`artifacts/share-card-preview-${width}.png`, png);
}
console.log('Rendered ParlayPing share card previews with approved logos.');
