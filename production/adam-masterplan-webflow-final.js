import * as THREE from 'three';

/*
  ADAM MASTERPLAN — WEBFLOW FINAL WRAPPER
  ---------------------------------------
  Loads the accepted Preview 5 runtime, then layers in the accepted calibrator
  fixes/effects and applies the supplied final global STYLE without requiring
  any calibrator UI.
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
  dotDensity:20.45,
  dotSize:0.0275,
  dotEdgeSoftness:0.012,
  dotSkew:0.5,
  dotFadedOpacity:0.05,
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

function pathOf(object) {
  const parts = [];
  for (let node = object; node; node = node.parent) {
    if (node.name) parts.push(node.name);
  }
  return parts.reverse().join('/');
}

function eachMaterial(mesh, fn) {
  if (Array.isArray(mesh.material)) mesh.material.forEach(fn);
  else if (mesh.material) fn(mesh.material);
}

function applyFinalStyle(api) {
  if (!api?.scene || !api?.model || !api?.renderer || api.__finalWebflowStyleApplied) return false;
  api.__finalWebflowStyleApplied = true;

  // Camera keyframes — mutate in-place because the runtime closes over arrays.
  api.desktopKeyframes.splice(0, api.desktopKeyframes.length, ...DESKTOP_KEYFRAMES);
  api.mobileKeyframes.splice(0, api.mobileKeyframes.length, ...MOBILE_KEYFRAMES);

  api.renderer.toneMappingExposure = STYLE.exposure;
  api.scene.background = new THREE.Color(STYLE.background);

  // Building material changes. Face/tint are already the same white/.7 blend
  // used by the base runtime; this pass applies the supplied lift/opacity/etc.
  const material2Meshes = api.material2Meshes || new Set();
  api.model.traverse(object => {
    if (!object?.isMesh || material2Meshes.has(object)) return;
    const path = pathOf(object);
    if (!path.includes('Scene_1/Main_Group/clusters/')) return;
    eachMaterial(object, material => {
      if (!material || material.isLineMaterial || material.isShaderMaterial) return;
      if (material.emissive) material.emissiveIntensity = Math.max(0, STYLE.faceLift);
      if ('roughness' in material) material.roughness = STYLE.faceRoughness;
      if ('metalness' in material) material.metalness = STYLE.faceMetalness;
      material.transparent = true;
      material.opacity = STYLE.faceOpacity;
      material.needsUpdate = true;
    });
  });

  // Architectural line appearance. Path ribbons advertise adamPathRailLayer and
  // are deliberately excluded — their accepted independent strip styling stays.
  api.model.traverse(line => {
    if (!line?.isLineSegments2 || !line.material || line.userData?.adamPathRailLayer) return;
    const parentPath = line.parent ? pathOf(line.parent) : '';
    if (!parentPath.includes('Scene_1/Main_Group/clusters/')) return;

    const material = line.material;
    if (material.blending === THREE.AdditiveBlending) {
      material.color?.set?.(STYLE.glow);
      material.opacity = THREE.MathUtils.clamp(STYLE.glowOpacity * STYLE.glowStrength, 0, 1);
      material.linewidth = STYLE.glowWidth;
    } else {
      material.color?.set?.(STYLE.edge);
      material.opacity = STYLE.edgeOpacity;
      material.linewidth = STYLE.edgeWidth;
    }
    material.needsUpdate = true;
  });

  // Lighting.
  const hemis = [];
  const directionals = [];
  api.scene.traverse(object => {
    if (object?.isHemisphereLight) hemis.push(object);
    if (object?.isDirectionalLight) directionals.push(object);
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

  // Dot shader — set every exported value so the embed really is a complete
  // representation of the supplied STYLE object.
  api.scene.traverse(object => {
    const material = object?.material;
    const uniforms = material?.uniforms;
    if (!uniforms?.uRippleSoft || !uniforms?.uDotColor) return;
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
  });

  api.style = STYLE;
  api.version = 'webflow-final-20260825';
  api.finalStyle = STYLE;
  api.finalDesktopKeyframes = DESKTOP_KEYFRAMES;
  api.finalMobileKeyframes = MOBILE_KEYFRAMES;

  const root = document.querySelector('[data-adam-masterplan-v15-preview]');
  if (root) root.dataset.adamVersion = api.version;

  console.info('[ADAM Webflow final] style applied', {
    desktopFrames:DESKTOP_KEYFRAMES.length,
    mobileFrames:MOBILE_KEYFRAMES.length,
    edgeOpacity:STYLE.edgeOpacity,
    edgeWidth:STYLE.edgeWidth,
    glow:STYLE.glow,
    glowOpacity:STYLE.glowOpacity,
    faceLift:STYLE.faceLift,
    faceOpacity:STYLE.faceOpacity
  });
  return true;
}

// Install render-hook modules before the renderer boots.
await import('../calibrate/shadow-controls.js?v=webflow-final-shadow-v5-20260825');
await import('../calibrate/glow-stencil-destack.js?v=webflow-final-glow-lock-v4-20260825');
await import('../calibrate/sideways-motion-smoothing.js?v=webflow-final-sideways-v1-20260825');

// Preview 5 imports path-ribbon-glow before loading the GLB, preserving the
// proven strip geometry capture and the approved entry-progress scroll mapping.
await import('./adam-masterplan-v1.5-preview5.js?v=webflow-final-base-20260825');

// Independent electric whole-strip pulse. Imported after the base wrapper; it
// self-initializes from the captured strip layers on the next renderer hook.
await import('../calibrate/path-pulse-rhythm.js?v=independent-rhythm-v2-20260825-1025');

if (!applyFinalStyle(window.__adamMasterplanV15Preview)) {
  const timer = setInterval(() => {
    if (applyFinalStyle(window.__adamMasterplanV15Preview)) clearInterval(timer);
  }, 25);
  setTimeout(() => clearInterval(timer), 20000);
}
