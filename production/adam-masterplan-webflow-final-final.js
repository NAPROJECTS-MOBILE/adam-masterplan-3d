import * as THREE from 'three';

/*
  ADAM MASTERPLAN — WEBFLOW FINAL FINAL
  ------------------------------------
  Current authoritative website baseline, 26 Aug 2026.
  - 95% 3D scroll smoothing
  - final strip source/edge/glow/halo styling
  - independent whole-strip pulse parity
  - route centreline + shell-collapse cleanup
*/

await import('./adam-masterplan-webflow-final.js?v=complete-export-v1-20260825-1117');
await import('./scroll-smoothing-95.js?v=smooth95-v1-20260826-1050');
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
        return copy;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
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

function syncStaticStripMaterials() {
  const entries = window.__ADAM_PATH_PULSE?.entries || window.__ADAM_PATH_RAIL_LAYERS;
  if (!Array.isArray(entries)) return false;

  for (const entry of entries) {
    const edge = entry?.edge?.material;
    const inner = entry?.inner?.material;
    const outer = entry?.outer?.material;

    if (edge) {
      edge.color?.set?.(FINAL_STRIP_STYLE.edgeColor);
      edge.opacity = FINAL_STRIP_STYLE.edgeOpacity;
      edge.linewidth = FINAL_STRIP_STYLE.edgeWidth;
      edge.transparent = true;
      edge.depthTest = true;
      edge.depthWrite = false;
      edge.needsUpdate = true;
      entry.edge.visible = FINAL_STRIP_STYLE.edgesVisible;
    }

    if (inner) {
      inner.color?.set?.(FINAL_STRIP_STYLE.glowColor);
      inner.opacity = FINAL_STRIP_STYLE.glowOpacity;
      inner.linewidth = FINAL_STRIP_STYLE.glowWidth;
      inner.transparent = true;
      inner.depthTest = true;
      inner.depthWrite = false;
      inner.needsUpdate = true;
      entry.inner.visible = FINAL_STRIP_STYLE.glowVisible;
    }

    if (outer) {
      outer.color?.set?.(FINAL_STRIP_STYLE.glowColor);
      outer.opacity = FINAL_STRIP_STYLE.haloOpacity;
      outer.linewidth = FINAL_STRIP_STYLE.haloWidth;
      outer.transparent = true;
      outer.depthTest = true;
      outer.depthWrite = false;
      outer.needsUpdate = true;
      entry.outer.visible = FINAL_STRIP_STYLE.glowVisible;
    }
  }

  return true;
}

function syncIndependentPulseState() {
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
    glowVisible:FINAL_STRIP_STYLE.glowVisible,
    pulseEnabled:FINAL_STRIP_PULSE_STYLE.enabled,
    pulseSpeed:FINAL_STRIP_PULSE_STYLE.pulseSpeed,
    pulseWidth:FINAL_STRIP_PULSE_STYLE.pulseWidth,
    pulseStrength:FINAL_STRIP_PULSE_STYLE.pulseStrength,
    pulseStagger:FINAL_STRIP_PULSE_STYLE.pulseStagger,
    __adamFlowV3DefaultsApplied:true,
    __adamIndependentPulseDefaultsApplied:true
  });

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
    syncStaticStripMaterials();

    const rhythm = window.__ADAM_PATH_PULSE_RHYTHM;
    const overlayCount = Number(rhythm?.overlays?.size || 0);
    if (overlayCount > 0) {
      rhythm.retrigger?.();
      pulseReady = true;
      clearInterval(timer);
      console.info('[ADAM Webflow independent pulse] armed', {
        overlays:overlayCount,
        style:FINAL_STRIP_PULSE_STYLE
      });
      return;
    }

    if (attempts >= 240) clearInterval(timer);
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

  if (!window.__ADAM_PATH_RIBBON_STYLE) return false;
  syncIndependentPulseState();

  window.__ADAM_REBUILD_PATH_RAILS?.();
  window.__ADAM_PATH_STRAIGHT_CENTRELINES?.run?.();
  window.__ADAM_PATH_RIBBON_SHELL_COLLAPSE?.run?.();

  syncStaticStripMaterials();
  applySourceOpacity();
  armIndependentPulseWhenReady();
  applyArchitecturalGlow(api);
  findRippleUniforms(api.scene);

  const finalStyleHook = () => {
    applyArchitecturalGlow(api);
    applySourceOpacity();
    syncIndependentPulseState();
    syncStaticStripMaterials();

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

  api.version = 'webflow-final-final-smooth95-strip-glow-lock-20260826-1050';
  api.finalFinal = {
    mobileKeyframes:FINAL_MOBILE_KEYFRAMES,
    globalGlow:FINAL_GLOBAL_GLOW,
    stripStyle:FINAL_STRIP_STYLE,
    stripPulseStyle:FINAL_STRIP_PULSE_STYLE,
    rippleDirectionSwitchPct:RIPPLE_DIRECTION_SWITCH_PCT,
    scrollSmoothing:0.95,
    straightRibbonCentrelines:true,
    ribbonShellCollapse:true,
    get independentPulseReady(){ return pulseReady; }
  };

  const root = document.querySelector('[data-adam-masterplan-v15-preview]');
  if (root) root.dataset.adamVersion = api.version;

  installed = true;
  console.info('[ADAM Webflow FINAL FINAL — smooth95 + strip glow lock] applied', api.finalFinal);
  return true;
}

const timer = setInterval(() => {
  if (installFinalState(window.__adamMasterplanV15Preview)) clearInterval(timer);
}, 25);

installFinalState(window.__adamMasterplanV15Preview);
setTimeout(() => clearInterval(timer), 20000);
