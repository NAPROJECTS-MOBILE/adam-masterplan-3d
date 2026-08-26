import * as THREE from 'three';

/*
  ADAM MASTERPLAN — WEBFLOW FINAL FINAL
  ------------------------------------
  Current authoritative website baseline, 26 Aug 2026.
  Keeps the accepted renderer/shadow/glow machinery and the route-geometry
  cleanup, then applies the latest exported calibrator values.

  V2 pulse sync:
  The independent whole-strip pulse is explicitly re-locked and retriggered
  after the route cleanup has rebuilt the line geometry. This removes a Webflow
  initialization race where the right pulse numbers existed but the independent
  pulse overlays could still reference the pre-cleanup strip layers.
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

const FINAL_GLOBAL_GLOW = {
  color:'#82ca2b',
  opacity:0.24,
  width:5.9,
  strength:0.35
};

const FINAL_STRIP_STYLE = {
  edgeAngle:10,
  edgeColor:'#cccccc',
  edgeOpacity:0.09,
  edgeWidth:0.25,
  glowColor:'#84c534',
  glowOpacity:0.076,
  glowWidth:1.3,
  haloOpacity:0.032,
  haloWidth:1.2,
  edgesVisible:true,
  glowVisible:true,
  sourceOpacity:0.18
};

const FINAL_STRIP_PULSE_STYLE = {
  enabled:true,
  pulseSpeed:1,
  pulseWidth:0.7,
  pulseStrength:0.16,
  pulseStagger:0.42
};

const RIPPLE_SPEED = 1.25;
const RIPPLE_DIRECTION_SWITCH_PCT = 63.6;

let installed = false;
let rippleUniforms = [];
let pulseReady = false;

function pathOf(object) {
  const parts = [];
  for (let node = object; node; node = node.parent) if (node.name) parts.push(node.name);
  return parts.reverse().join('/');
}

function eachMaterial(mesh, fn) {
  if (!mesh?.material) return;
  if (Array.isArray(mesh.material)) mesh.material.forEach(fn);
  else fn(mesh.material);
}

function applyArchitecturalGlow(api) {
  api.model?.traverse?.(line => {
    if (!line?.isLineSegments2 || !line.material || line.userData?.adamPathRailLayer) return;
    const parentPath = line.parent ? pathOf(line.parent) : '';
    if (!parentPath.includes('Scene_1/Main_Group/clusters/')) return;
    if (line.material.blending !== THREE.AdditiveBlending) return;

    line.material.color?.set?.(FINAL_GLOBAL_GLOW.color);
    line.material.opacity = FINAL_GLOBAL_GLOW.opacity * FINAL_GLOBAL_GLOW.strength;
    line.material.linewidth = FINAL_GLOBAL_GLOW.width;
    line.material.needsUpdate = true;
  });
}

function applySourceOpacity() {
  const opacity = FINAL_STRIP_STYLE.sourceOpacity;
  const refs = window.__ADAM_PATH_RIBBON_REFS;
  if (!Array.isArray(refs)) return;

  for (const entry of refs) {
    const mesh = entry?.mesh;
    if (!mesh?.isMesh || !mesh.material) continue;

    if (!mesh.userData?.adamWebsiteSourceOpacityOwned) {
      const clone = material => {
        if (!material) return material;
        const copy = material.clone?.() || material;
        copy.userData = { ...(copy.userData || {}) };
        copy.userData.adamWebsiteOriginalOpacity = Number.isFinite(Number(material.opacity)) ? Number(material.opacity) : 1;
        copy.userData.adamWebsiteOriginalTransparent = !!material.transparent;
        copy.userData.adamWebsiteOriginalDepthWrite = material.depthWrite !== false;
        return copy;
      };

      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(clone)
        : clone(mesh.material);
      mesh.userData = { ...(mesh.userData || {}), adamWebsiteSourceOpacityOwned:true };
    }

    eachMaterial(mesh, material => {
      const originalOpacity = Number.isFinite(Number(material.userData?.adamWebsiteOriginalOpacity))
        ? Number(material.userData.adamWebsiteOriginalOpacity)
        : 1;
      material.transparent = true;
      material.opacity = originalOpacity * opacity;
      material.depthTest = true;
      material.depthWrite = false;
      material.needsUpdate = true;
    });
  }
}

function syncIndependentPulseState() {
  const strip = window.__ADAM_PATH_RIBBON_STYLE;
  if (!strip) return false;

  Object.assign(strip, {
    pulseEnabled:FINAL_STRIP_PULSE_STYLE.enabled,
    pulseSpeed:FINAL_STRIP_PULSE_STYLE.pulseSpeed,
    pulseWidth:FINAL_STRIP_PULSE_STYLE.pulseWidth,
    pulseStrength:FINAL_STRIP_PULSE_STYLE.pulseStrength,
    pulseStagger:FINAL_STRIP_PULSE_STYLE.pulseStagger,
    __adamFlowV3DefaultsApplied:true,
    __adamIndependentPulseDefaultsApplied:true
  });

  // The travelling pulse geometry is legacy. Keep it hidden so the only active
  // animated strip light is the accepted independent whole-strip pulse rhythm.
  const entries = window.__ADAM_PATH_PULSE?.entries;
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      if (entry?.pulseSoft) entry.pulseSoft.visible = false;
      if (entry?.pulseCore) entry.pulseCore.visible = false;
    }
  }

  return true;
}

function armIndependentPulseWhenReady() {
  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    syncIndependentPulseState();

    const rhythm = window.__ADAM_PATH_PULSE_RHYTHM;
    const overlayCount = Number(rhythm?.overlays?.size || 0);
    if (overlayCount > 0) {
      rhythm.retrigger?.();
      pulseReady = true;
      clearInterval(timer);
      console.info('[ADAM Webflow independent pulse] armed after cleanup', {
        overlays:overlayCount,
        pulseSpeed:FINAL_STRIP_PULSE_STYLE.pulseSpeed,
        pulseWidth:FINAL_STRIP_PULSE_STYLE.pulseWidth,
        pulseStrength:FINAL_STRIP_PULSE_STYLE.pulseStrength,
        pulseStagger:FINAL_STRIP_PULSE_STYLE.pulseStagger
      });
      return;
    }

    if (attempts >= 240) {
      clearInterval(timer);
      console.warn('[ADAM Webflow independent pulse] overlays did not become ready in time');
    }
  }, 25);
}

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
    sourceOpacity:FINAL_STRIP_STYLE.sourceOpacity,
    edgesVisible:FINAL_STRIP_STYLE.edgesVisible,
    glowVisible:FINAL_STRIP_STYLE.glowVisible
  });
  syncIndependentPulseState();

  // Build once from the source geometry, then apply both cleanup passes.
  window.__ADAM_REBUILD_PATH_RAILS?.();
  window.__ADAM_PATH_STRAIGHT_CENTRELINES?.run?.();
  window.__ADAM_PATH_RIBBON_SHELL_COLLAPSE?.run?.();

  // Important: arm the independent pulse only after the cleanup has replaced
  // the rail geometry. This is the production/calibrator parity fix.
  armIndependentPulseWhenReady();

  applySourceOpacity();
  applyArchitecturalGlow(api);
  findRippleUniforms(api.scene);

  const finalStyleHook = () => {
    applyArchitecturalGlow(api);
    applySourceOpacity();
    syncIndependentPulseState();

    if (!rippleUniforms.length) findRippleUniforms(api.scene);
    const late = currentScrollPct(api) >= RIPPLE_DIRECTION_SWITCH_PCT;
    const signedSpeed = late ? RIPPLE_SPEED : -RIPPLE_SPEED;
    for (const uniforms of rippleUniforms) uniforms.uRippleSpeed.value = signedSpeed;
  };

  window.__ADAM_BEFORE_RENDER_HOOKS = window.__ADAM_BEFORE_RENDER_HOOKS || [];
  window.__ADAM_BEFORE_RENDER_HOOKS.push(finalStyleHook);
  finalStyleHook();

  if (api.style) {
    api.style.glowWidth = FINAL_GLOBAL_GLOW.width;
    api.style.glowStrength = FINAL_GLOBAL_GLOW.strength;
  }
  if (api.completeExport) {
    api.completeExport.MOBILE_KEYFRAMES = FINAL_MOBILE_KEYFRAMES;
    api.completeExport.STRIP_STYLE = FINAL_STRIP_STYLE;
    api.completeExport.STRIP_PULSE_STYLE = FINAL_STRIP_PULSE_STYLE;
    if (api.completeExport.STYLE) {
      api.completeExport.STYLE.glowWidth = FINAL_GLOBAL_GLOW.width;
      api.completeExport.STYLE.glowStrength = FINAL_GLOBAL_GLOW.strength;
    }
  }

  api.version = 'webflow-final-final-pulse-parity-20260826-0024';
  api.finalFinal = {
    mobileKeyframes:FINAL_MOBILE_KEYFRAMES,
    globalGlow:FINAL_GLOBAL_GLOW,
    stripStyle:FINAL_STRIP_STYLE,
    stripPulseStyle:FINAL_STRIP_PULSE_STYLE,
    rippleDirectionSwitchPct:RIPPLE_DIRECTION_SWITCH_PCT,
    scrollSmoothing:0.90,
    straightRibbonCentrelines:true,
    ribbonShellCollapse:true,
    get independentPulseReady(){ return pulseReady; }
  };

  const root = document.querySelector('[data-adam-masterplan-v15-preview]');
  if (root) root.dataset.adamVersion = api.version;

  installed = true;
  console.info('[ADAM Webflow FINAL FINAL — pulse parity] applied', api.finalFinal);
  return true;
}

const timer = setInterval(() => {
  if (installFinalState(window.__adamMasterplanV15Preview)) clearInterval(timer);
}, 25);

installFinalState(window.__adamMasterplanV15Preview);
setTimeout(() => clearInterval(timer), 20000);
