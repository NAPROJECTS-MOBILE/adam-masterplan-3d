import * as THREE from 'three';

/*
  ADAM MASTERPLAN — WEBFLOW FINAL FINAL
  ------------------------------------
  Small final override layer on top of the complete production runtime.
  Keeps all accepted architecture glow / shadow / pulse machinery in the
  production modules and applies only the final approved deltas:
  - mobile frame 05 azimuth/pan
  - light grey, thinner strip edges
  - late-scroll dot ripple direction compensation
  - 90% scroll smoothing for the 3D camera timeline
  - one visible centre rail per long straight ribbon mesh, any plan direction
  - shell/bevel duplicate collapse inside every remaining ribbon entry
*/

await import('./adam-masterplan-webflow-final.js?v=complete-export-v1-20260825-1117');
await import('./scroll-smoothing-90.js?v=smooth90-v1-20260825-1322');
await import('../calibrate/path-central-centerlines.js?v=straight-centrelines-v3-20260825-1653');
await import('../calibrate/path-ribbon-shell-collapse.js?v=shell-collapse-v1-20260825-2332');

const FINAL_MOBILE_KEYFRAMES = [
  { scrollPct:0,   azimuth:29, elevation:32, zoom:0.02, panX:-0.44, panZ:0.00, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:25,  azimuth:37, elevation:34, zoom:0.06, panX:-0.44, panZ:0.00, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:50,  azimuth:14, elevation:37, zoom:0.05, panX:-0.19, panZ:0.27, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:75,  azimuth:29, elevation:36, zoom:0.08, panX:0.11,  panZ:0.27, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:100, azimuth:44, elevation:37, zoom:0.08, panX:0.50,  panZ:0.31, motionProgress:0.000, ease:'easeInOut' }
];

const FINAL_STRIP_STYLE = {
  edgeAngle:10,
  edgeColor:'#cccccc',
  edgeOpacity:0.67,
  edgeWidth:0.25,
  glowColor:'#84c534',
  glowOpacity:0.076,
  glowWidth:1.3,
  haloOpacity:0.03,
  haloWidth:1.2,
  edgesVisible:true,
  glowVisible:true
};

const RIPPLE_SPEED = 1.25;
const RIPPLE_DIRECTION_SWITCH_PCT = 63.6;

let installed = false;
let rippleUniforms = [];

function findRippleUniforms(scene) {
  rippleUniforms = [];
  scene?.traverse?.(object => {
    const uniforms = object?.material?.uniforms;
    if (uniforms?.uRippleSpeed && uniforms?.uRippleSoft && uniforms?.uDotColor) rippleUniforms.push(uniforms);
  });
}

function currentScrollPct(api) {
  const p = Number(api?.smoothedEntryProgress?.() ?? api?.progress?.());
  if (Number.isFinite(p)) return p;
  const root = document.querySelector('[data-adam-masterplan-v15-preview]');
  const datasetPct = Number(root?.dataset?.scrollPct);
  return Number.isFinite(datasetPct) ? datasetPct : 0;
}

function installFinalState(api) {
  if (installed || !api?.scene || !api?.renderer || !api?.mobileKeyframes) return false;

  api.mobileKeyframes.splice(0, api.mobileKeyframes.length, ...FINAL_MOBILE_KEYFRAMES);

  const strip = window.__ADAM_PATH_RIBBON_STYLE;
  if (!strip) return false;

  Object.assign(strip, {
    edgeColor:FINAL_STRIP_STYLE.edgeColor,
    edgeOpacity:FINAL_STRIP_STYLE.edgeOpacity,
    edgeWidth:FINAL_STRIP_STYLE.edgeWidth,
    glowColor:FINAL_STRIP_STYLE.glowColor,
    glowOpacity:FINAL_STRIP_STYLE.glowOpacity,
    glowWidth:FINAL_STRIP_STYLE.glowWidth,
    haloOpacity:FINAL_STRIP_STYLE.haloOpacity,
    haloWidth:FINAL_STRIP_STYLE.haloWidth,
    edgesVisible:FINAL_STRIP_STYLE.edgesVisible,
    glowVisible:FINAL_STRIP_STYLE.glowVisible,
    pulseEnabled:true,
    pulseSpeed:8.05,
    pulseWidth:0.85,
    pulseStrength:0.76,
    pulseStagger:0.42,
    __adamFlowV3DefaultsApplied:true,
    __adamIndependentPulseDefaultsApplied:true
  });

  window.__ADAM_REBUILD_PATH_RAILS?.();
  window.__ADAM_PATH_STRAIGHT_CENTRELINES?.run?.();
  window.__ADAM_PATH_RIBBON_SHELL_COLLAPSE?.run?.();

  findRippleUniforms(api.scene);

  const rippleDirectionHook = () => {
    if (!rippleUniforms.length) findRippleUniforms(api.scene);
    const late = currentScrollPct(api) >= RIPPLE_DIRECTION_SWITCH_PCT;
    const signedSpeed = late ? RIPPLE_SPEED : -RIPPLE_SPEED;
    for (const uniforms of rippleUniforms) uniforms.uRippleSpeed.value = signedSpeed;
  };

  window.__ADAM_BEFORE_RENDER_HOOKS = window.__ADAM_BEFORE_RENDER_HOOKS || [];
  window.__ADAM_BEFORE_RENDER_HOOKS.push(rippleDirectionHook);
  rippleDirectionHook();

  if (api.completeExport) {
    api.completeExport.MOBILE_KEYFRAMES = FINAL_MOBILE_KEYFRAMES;
    api.completeExport.STRIP_STYLE = FINAL_STRIP_STYLE;
  }

  api.version = 'webflow-final-final-smooth90-shell-collapse-20260825-2332';
  api.finalFinal = {
    mobileKeyframes:FINAL_MOBILE_KEYFRAMES,
    stripStyle:FINAL_STRIP_STYLE,
    rippleDirectionSwitchPct:RIPPLE_DIRECTION_SWITCH_PCT,
    scrollSmoothing:0.90,
    straightRibbonCentrelines:true,
    ribbonShellCollapse:true
  };

  const root = document.querySelector('[data-adam-masterplan-v15-preview]');
  if (root) root.dataset.adamVersion = api.version;

  installed = true;
  console.info('[ADAM Webflow FINAL FINAL + shell collapse] applied', api.finalFinal);
  return true;
}

const timer = setInterval(() => {
  if (installFinalState(window.__adamMasterplanV15Preview)) clearInterval(timer);
}, 25);

installFinalState(window.__adamMasterplanV15Preview);
setTimeout(() => clearInterval(timer), 20000);
