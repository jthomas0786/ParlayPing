const addison = {
  lines: ["35+", "40+", "50+", "60+", "70+"],
  probs: [72, 67, 58, 47, 38]
};

const kelce = {
  lines: ["40+", "50+", "60+", "70+", "80+"],
  probs: [76, 69, 61, 53, 44]
};

const addisonRisk = document.getElementById("addisonRisk");
const kelceRisk = document.getElementById("kelceRisk");
const addisonLine = document.getElementById("addisonLine");
const kelceLine = document.getElementById("kelceLine");
const addisonProb = document.getElementById("addisonProb");
const kelceProb = document.getElementById("kelceProb");
const combinedProbability = document.getElementById("combinedProbability");
const buildSummary = document.getElementById("buildSummary");
const presets = [...document.querySelectorAll(".preset")];

function currentIndex(input) {
  return Math.max(0, Math.min(4, Number(input.value)));
}

function updateBuilder() {
  const a = currentIndex(addisonRisk);
  const k = currentIndex(kelceRisk);

  addisonLine.textContent = addison.lines[a];
  kelceLine.textContent = kelce.lines[k];
  addisonProb.textContent = `${addison.probs[a]}%`;
  kelceProb.textContent = `${kelce.probs[k]}%`;

  const combined = Math.round((addison.probs[a] / 100) * (kelce.probs[k] / 100) * 100);
  combinedProbability.textContent = `${combined}%`;
  buildSummary.textContent = `Addison ${addison.lines[a]} · Kelce ${kelce.lines[k]}`;

  const isPreset = a === k && [0, 2, 4].includes(a);
  presets.forEach(btn => btn.classList.remove("active"));
  if (isPreset) {
    const map = {0: "safe", 2: "balanced", 4: "aggressive"};
    const target = document.querySelector(`[data-preset="${map[a]}"]`);
    if (target) target.classList.add("active");
  }
}

function setPreset(name) {
  const value = name === "safe" ? 0 : name === "aggressive" ? 4 : 2;
  addisonRisk.value = value;
  kelceRisk.value = value;
  updateBuilder();
}

addisonRisk?.addEventListener("input", updateBuilder);
kelceRisk?.addEventListener("input", updateBuilder);

presets.forEach(btn => {
  btn.addEventListener("click", () => setPreset(btn.dataset.preset));
});

function neutralizeSignedOutProfile(){
  document.querySelectorAll('.pp-profile').forEach(node=>{
    if(String(node.textContent||'').trim().toUpperCase()!=='JT')return;
    node.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="3.25" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 19c.7-4 3-6 6.5-6s5.8 2 6.5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    node.setAttribute('aria-label','Sign in or open account');
    node.dataset.signedOutProfile='true';
  });
}

function watchSignedOutProfile(){
  neutralizeSignedOutProfile();
  if(!document.body||typeof MutationObserver!=='function')return;
  const observer=new MutationObserver(neutralizeSignedOutProfile);
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(()=>observer.disconnect(),5000);
}

function loadLandingHub(){
  if(document.querySelector('script[data-pp-landing-hub]'))return;
  const script=document.createElement('script');
  script.src='/landing-hub.js?v=20260925c';
  script.async=false;
  script.dataset.ppLandingHub='1';
  document.body.appendChild(script);
}

function loadAppNav(){
  if(document.querySelector('script[data-pp-app-nav]'))return;
  const script=document.createElement('script');
  script.src='/app-nav.js?v=20260925b';
  script.async=false;
  script.dataset.ppAppNav='1';
  document.body.appendChild(script);
}

updateBuilder();
watchSignedOutProfile();
loadLandingHub();
loadAppNav();
