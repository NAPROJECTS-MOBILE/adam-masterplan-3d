import * as THREE from 'three';

/*
  ADAM MASTERPLAN — WEBFLOW FINAL / COMPLETE CALIBRATOR EXPORT
  ------------------------------------------------------------
  Exact exported state supplied 25 Aug 2026.
  Includes camera, global STYLE, Material 2, base plate, shadows,
  static strip styling, independent strip pulse and feature state.
*/

const DESKTOP_KEYFRAMES = [
  { scrollPct:0,   azimuth:22, elevation:27, zoom:0.04, panX:-0.46, panZ:-0.08, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:25,  azimuth:38, elevation:27, zoom:0.08, panX:-0.46, panZ:-0.08, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:50,  azimuth:51, elevation:28, zoom:0.08, panX:-0.19, panZ:0.17,  motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:75,  azimuth:51, elevation:28, zoom:0.08, panX:0.12,  panZ:0.27,  motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:100, azimuth:44, elevation:28, zoom:0.08, panX:0.48,  panZ:0.35,  motionProgress:0.000, ease:'easeInOut' }
];

const MOBILE_KEYFRAMES = [
  { scrollPct:0,   azimuth:29, elevation:32, zoom:0.02, panX:-0.44, panZ:0.00, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:25,  azimuth:37, elevation:34, zoom:0.06, panX:-0.44, panZ:0.00, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:50,  azimuth:14, elevation:37, zoom:0.05, panX:-0.19, panZ:0.27, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:75,  azimuth:29, elevation:36, zoom:0.08, panX:0.11,  panZ:0.27, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:100, azimuth:29, elevation:37, zoom:0.08, panX:0.48,  panZ:0.31, motionProgress:0.000, ease:'easeInOut' }
];

const STYLE = {
  background:'#ffffff',
  face:'#ffffff',
  faceTint:0.7,
  faceLift:0.85,
  faceOpacity:0.95,
  faceRoughness:0.97,
  faceMetalness:0,
  slab:'#ffffff',
  slabOpacity:0.14,
  slabRoughness:1,
  edge:'#242424',
  edgeOpacity:0.14,
  edgeWidth:0.65,
  edgeAngle:30,
  glow:'#82ca2b',
  glowOpacity:0.24,
  glowWidth:7,
  glowStrength:0.3,
  glowExpansion:0,
  dotColor:'#141414',
  dotDensity:24.95,
  dotSize:0.0275,
  dotEdgeSoftness:0.012,
  dotSkew:0.5,
  dotFadedOpacity:0,
  dotActiveOpacity:0.34,
  rippleSpeed:-1.25,
  rippleFrequency:0.35,
  rippleWidth:0.3,
  rippleSoftness:0.081,
  rippleOriginX:0,
  rippleOriginZ:0,
  hemisphere:0.6,
  key:1.3,
  rim:0.35,
  exposure:0.85,
  keyTint:'#ffffff'
};

const MATERIAL_2_STYLE = {
  face:'#ebebeb',
  faceTint:0.7,
  faceLift:0.35,
  faceOpacity:0.94,
  faceRoughness:0.97,
  faceMetalness:0
};

const BASE_PLATE_STYLE = { scale:1 };

const SHADOW_STYLE = {
  enabled:true,
  azimuth:180,
  elevation:62,
  darkness:0.04,
  softness:2,
  bias:-0.00035,
  normalBias:0.02,
  receiverOffset:0.025,
  mapSize:4096,
  blurSamples:8,
  filter:'VSM'
};

const STRIP_STYLE = {
  edgeAngle:10,
  edgeColor:'#242424',
  edgeOpacity:0.14,
  edgeWidth:1,
  glowColor:'#84c534',
  glowOpacity:0.076,
  glowWidth:1.3,
  haloOpacity:0.03,
  haloWidth:1.2,
  edgesVisible:true,
  glowVisible:true
};

const STRIP_PULSE_STYLE = {
  enabled:true,
  pulseSpeed:8.05,
  pulseWidth:0.85,
  pulseStrength:0.76,
  pulseStagger:0.42
};

const FEATURE_STATE = {
  shadows:true,
  edges:true,
  glow:true,
  dots:true,
  animateDots:true,
  stripEdges:true,
  stripGlow:true,
  stripPulse:true,
  architecturalGlowStencil:true
};

function pathOf(object) {
  const parts = [];
  for (let node = object; node; node = node.parent) if (node.name) parts.push(node.name);
  return parts.reverse().join('/');
}

function eachMaterial(mesh, fn) {
  if (Array.isArray(mesh.material)) mesh.material.forEach(fn);
  else if (mesh.material) fn(mesh.material);
}

// The calibrator strip renderer historically waits for a handful of calibrator
// controls before it creates the dedicated rail layers. Webflow has no panel,
// so provide an invisible compatibility host. This is the key difference that
// lets production use the exact same strip renderer as calibrate.
function ensureHeadlessStripBootstrap() {
  if (document.getElementById('pathEdgeColor') && document.getElementById('tEdges') && document.getElementById('tGlow')) return;
  const host = document.createElement('div');
  host.hidden = true;
  host.setAttribute('aria-hidden', 'true');
  host.innerHTML = `
    <input id="pathEdgeColor" type="color" value="#242424">
    <button id="tEdges" class="on" type="button"></button>
    <button id="tGlow" class="on" type="button"></button>
  `;
  document.body.appendChild(host);
}

ensureHeadlessStripBootstrap();

// Install renderer-hook modules before the renderer exists.
await import('../calibrate/shadow-controls.js?v=webflow-complete-shadow-v1-20260825-1108');
await import('../calibrate/glow-stencil-destack.js?v=webflow-complete-glow-lock-v1-20260825-1108');
await import('../calibrate/sideways-motion-smoothing.js?v=webflow-complete-sideways-v1-20260825-1108');

// Seed exact shadow state BEFORE the first renderer hook installs the light.
if (window.__ADAM_SHADOW_CALIBRATOR?.state) {
  Object.assign(window.__ADAM_SHADOW_CALIBRATOR.state, {
    enabled:SHADOW_STYLE.enabled,
    azimuth:SHADOW_STYLE.azimuth,
    elevation:SHADOW_STYLE.elevation,
    darkness:SHADOW_STYLE.darkness,
    softness:SHADOW_STYLE.softness,
    bias:SHADOW_STYLE.bias,
    normalBias:SHADOW_STYLE.normalBias,
    receiverOffset:SHADOW_STYLE.receiverOffset,
    mapSize:SHADOW_STYLE.mapSize
  });
}

// Preview 5 supplies the accepted entry-progress scroll mapping and captures
// the path GLTF before the base runtime mutates the hierarchy.
await import('./adam-masterplan-v1.5-preview5.js?v=webflow-complete-base-v1-20260825-1108');

// Seed static strip + independent pulse BEFORE the first render. The two guard
// flags stop the older travelling-flow helper and rhythm module from replacing
// this exported pulse state with their own historical defaults.
if (window.__ADAM_PATH_RIBBON_STYLE) {
  Object.assign(window.__ADAM_PATH_RIBBON_STYLE, {
    edgeColor:STRIP_STYLE.edgeColor,
    edgeOpacity:STRIP_STYLE.edgeOpacity,
    edgeWidth:STRIP_STYLE.edgeWidth,
    glowColor:STRIP_STYLE.glowColor,
    glowOpacity:STRIP_STYLE.glowOpacity,
    glowWidth:STRIP_STYLE.glowWidth,
    haloOpacity:STRIP_STYLE.haloOpacity,
    haloWidth:STRIP_STYLE.haloWidth,
    edgesVisible:STRIP_STYLE.edgesVisible,
    glowVisible:STRIP_STYLE.glowVisible,
    pulseEnabled:STRIP_PULSE_STYLE.enabled,
    pulseSpeed:STRIP_PULSE_STYLE.pulseSpeed,
    pulseWidth:STRIP_PULSE_STYLE.pulseWidth,
    pulseStrength:STRIP_PULSE_STYLE.pulseStrength,
    pulseStagger:STRIP_PULSE_STYLE.pulseStagger,
    __adamFlowV3DefaultsApplied:true,
    __adamIndependentPulseDefaultsApplied:true
  });
}

await import('../calibrate/path-pulse-rhythm.js?v=webflow-complete-independent-rhythm-v1-20260825-1108');

function applyCompleteState(api) {
  if (!api?.scene || !api?.model || !api?.renderer || api.__completeExportApplied) return false;
  api.__completeExportApplied = true;

  api.desktopKeyframes.splice(0, api.desktopKeyframes.length, ...DESKTOP_KEYFRAMES);
  api.mobileKeyframes.splice(0, api.mobileKeyframes.length, ...MOBILE_KEYFRAMES);

  api.renderer.toneMappingExposure = STYLE.exposure;
  api.scene.background = new THREE.Color(STYLE.background);
  api.setBaseScale?.(BASE_PLATE_STYLE.scale);

  const material2Meshes = api.material2Meshes || new Set();

  // Main building material. Base runtime already used the same #fff / .7 tint,
  // so preserve its correct blended colour and apply the exported live values.
  api.model.traverse(object => {
    if (!object?.isMesh || material2Meshes.has(object)) return;
    const p = pathOf(object);
    if (!p.includes('Scene_1/Main_Group/clusters/')) return;
    eachMaterial(object, material => {
      if (!material || material.isLineMaterial || material.isShaderMaterial) return;
      if (material.emissive && material.color) {
        material.emissive.copy(material.color);
        material.emissiveIntensity = STYLE.faceLift;
      }
      if ('roughness' in material) material.roughness = STYLE.faceRoughness;
      if ('metalness' in material) material.metalness = STYLE.faceMetalness;
      material.transparent = true;
      material.opacity = STYLE.faceOpacity;
      material.needsUpdate = true;
    });
  });

  // Material 2 used the same #ebebeb/.7 tint in the base runtime; apply the
  // changed lift and all remaining exported material properties exactly.
  for (const mesh of material2Meshes) {
    eachMaterial(mesh, material => {
      if (!material) return;
      if (material.emissive && material.color) {
        material.emissive.copy(material.color);
        material.emissiveIntensity = MATERIAL_2_STYLE.faceLift;
      }
      if ('roughness' in material) material.roughness = MATERIAL_2_STYLE.faceRoughness;
      if ('metalness' in material) material.metalness = MATERIAL_2_STYLE.faceMetalness;
      material.transparent = true;
      material.opacity = MATERIAL_2_STYLE.faceOpacity;
      material.needsUpdate = true;
    });
  }

  // Architecture edges + glow only. Strip layers identify themselves and are
  // deliberately excluded so their dedicated exported style stays authoritative.
  api.model.traverse(line => {
    if (!line?.isLineSegments2 || !line.material || line.userData?.adamPathRailLayer) return;
    const parentPath = line.parent ? pathOf(line.parent) : '';
    if (!parentPath.includes('Scene_1/Main_Group/clusters/')) return;

    if (line.material.blending === THREE.AdditiveBlending) {
      line.material.color?.set?.(STYLE.glow);
      line.material.opacity = STYLE.glowOpacity * STYLE.glowStrength;
      line.material.linewidth = STYLE.glowWidth;
      line.visible = FEATURE_STATE.glow;
    } else {
      line.material.color?.set?.(STYLE.edge);
      line.material.opacity = STYLE.edgeOpacity;
      line.material.linewidth = STYLE.edgeWidth;
      line.visible = FEATURE_STATE.edges;
    }
    line.material.needsUpdate = true;
  });

  // Lighting. Ignore the almost-zero dedicated shadow light by name.
  const hemis = [];
  const directionals = [];
  api.scene.traverse(object => {
    if (object?.isHemisphereLight) hemis.push(object);
    if (object?.isDirectionalLight && object.name !== 'ADAM_Shadow_Directional') directionals.push(object);
  });
  for (const light of hemis) light.intensity = STYLE.hemisphere;
  if (directionals[0]) {
    directionals[0].color.set(STYLE.keyTint);
    directionals[0].intensity = STYLE.key;
  }
  if (directionals[1]) {
    directionals[1].color.set(STYLE.glow);
    directionals[1].intensity = STYLE.rim;
  }

  // Dot shader + visibility.
  api.scene.traverse(object => {
    const uniforms = object?.material?.uniforms;
    if (!uniforms?.uDotColor || !uniforms?.uRippleSoft) return;
    uniforms.uDotColor.value.set(STYLE.dotColor);
    uniforms.uSpacing.value = 2 / Math.max(0.05, STYLE.dotDensity);
    uniforms.uDotSize.value = STYLE.dotSize;
    uniforms.uEdgeSoft.value = STYLE.dotEdgeSoftness;
    uniforms.uSkew.value = STYLE.dotSkew;
    uniforms.uFadedOpacity.value = STYLE.dotFadedOpacity;
    uniforms.uActiveOpacity.value = STYLE.dotActiveOpacity;
    uniforms.uRippleSpeed.value = STYLE.rippleSpeed;
    uniforms.uRippleFrequency.value = STYLE.rippleFrequency;
    uniforms.uRippleWidth.value = STYLE.rippleWidth;
    uniforms.uRippleSoft.value = STYLE.rippleSoftness;
    uniforms.uRippleOrigin.value.set(STYLE.rippleOriginX, STYLE.rippleOriginZ);
    uniforms.uAnimate.value = FEATURE_STATE.animateDots ? 1 : 0;
    object.visible = FEATURE_STATE.dots;
  });

  // Re-assert strip state and rebuild once the captured rail sources exist.
  if (window.__ADAM_PATH_RIBBON_STYLE) {
    Object.assign(window.__ADAM_PATH_RIBBON_STYLE, {
      edgeColor:STRIP_STYLE.edgeColor,
      edgeOpacity:STRIP_STYLE.edgeOpacity,
      edgeWidth:STRIP_STYLE.edgeWidth,
      glowColor:STRIP_STYLE.glowColor,
      glowOpacity:STRIP_STYLE.glowOpacity,
      glowWidth:STRIP_STYLE.glowWidth,
      haloOpacity:STRIP_STYLE.haloOpacity,
      haloWidth:STRIP_STYLE.haloWidth,
      edgesVisible:FEATURE_STATE.stripEdges,
      glowVisible:FEATURE_STATE.stripGlow,
      pulseEnabled:FEATURE_STATE.stripPulse && STRIP_PULSE_STYLE.enabled,
      pulseSpeed:STRIP_PULSE_STYLE.pulseSpeed,
      pulseWidth:STRIP_PULSE_STYLE.pulseWidth,
      pulseStrength:STRIP_PULSE_STYLE.pulseStrength,
      pulseStagger:STRIP_PULSE_STYLE.pulseStagger,
      __adamFlowV3DefaultsApplied:true,
      __adamIndependentPulseDefaultsApplied:true
    });
    window.__ADAM_REBUILD_PATH_RAILS?.();
  }

  // Re-assert shadow state in case install occurred during async model boot.
  if (window.__ADAM_SHADOW_CALIBRATOR?.state) {
    Object.assign(window.__ADAM_SHADOW_CALIBRATOR.state, {
      enabled:FEATURE_STATE.shadows && SHADOW_STYLE.enabled,
      azimuth:SHADOW_STYLE.azimuth,
      elevation:SHADOW_STYLE.elevation,
      darkness:SHADOW_STYLE.darkness,
      softness:SHADOW_STYLE.softness,
      bias:SHADOW_STYLE.bias,
      normalBias:SHADOW_STYLE.normalBias,
      receiverOffset:SHADOW_STYLE.receiverOffset,
      mapSize:SHADOW_STYLE.mapSize
    });
  }

  api.style = STYLE;
  Object.assign(api.material2Style || {}, MATERIAL_2_STYLE);
  api.version = 'webflow-complete-export-20260825-1108';
  api.completeExport = {
    DESKTOP_KEYFRAMES,
    MOBILE_KEYFRAMES,
    STYLE,
    MATERIAL_2_STYLE,
    BASE_PLATE_STYLE,
    SHADOW_STYLE,
    STRIP_STYLE,
    STRIP_PULSE_STYLE,
    FEATURE_STATE
  };

  const root = document.querySelector('[data-adam-masterplan-v15-preview]');
  if (root) root.dataset.adamVersion = api.version;

  console.info('[ADAM Webflow complete export] applied', api.completeExport);
  return true;
}

if (!applyCompleteState(window.__adamMasterplanV15Preview)) {
  const timer = setInterval(() => {
    if (applyCompleteState(window.__adamMasterplanV15Preview)) clearInterval(timer);
  }, 25);
  setTimeout(() => clearInterval(timer), 20000);
}
