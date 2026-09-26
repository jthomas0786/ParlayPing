(()=>{
  function applyCommunityMode(){
    const feature=document.querySelector('#ppTrendFeature');
    if(feature){
      const label=feature.querySelector('.pp-card-label');
      const headline=document.querySelector('#ppTrendFeatureHeadline');
      const copy=document.querySelector('#ppTrendFeatureCopy');
      const cta=feature.querySelector('.pp-card-cta');
      if(label)label.textContent='COMMUNITY BETSLIPS';
      if(headline&&!headline.dataset.ppCommunityMode){headline.textContent='Verify a betslip and help build the community.';headline.dataset.ppCommunityMode='1';}
      if(copy){copy.textContent='Community submissions are verified pregame. Previously captured X slips remain as cached context — live X crawling is off.';}
      if(cta){cta.href='/submit';cta.innerHTML='Submit a betslip <span>→</span>';}
    }
    const title=document.querySelector('#trending .pp-trending-head h2');
    const subtitle=document.querySelector('#ppTrendingSubtitle');
    if(title)title.textContent='Verified betslips';
    if(subtitle&&!subtitle.dataset.ppCommunityMode){subtitle.textContent='Community submissions + cached public X observations · no live X API crawling';subtitle.dataset.ppCommunityMode='1';}
    const grid=document.querySelector('#ppTrendingGrid');
    if(grid&&grid.querySelector('.pp-trend-empty')&&!grid.dataset.ppCommunityMode){const empty=grid.querySelector('.pp-trend-empty');if(empty)empty.textContent='Loading verified community submissions and cached upcoming X betslips…';grid.dataset.ppCommunityMode='1';}
    const section=document.querySelector('#trending .pp-trending-head');
    if(section&&!section.querySelector('[data-pp-submit-community]')){
      const link=document.createElement('a');link.href='/submit';link.dataset.ppSubmitCommunity='1';link.className='pp-trend-refresh';link.textContent='Submit yours →';
      const tools=section.querySelector('.pp-trend-tools');if(tools)tools.appendChild(link);
    }
  }
  function init(){let tries=0;const run=()=>{applyCommunityMode();tries+=1;if(tries<12)setTimeout(run,250);};run();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
