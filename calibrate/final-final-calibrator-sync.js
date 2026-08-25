/*
  ADAM calibrator — COMPLETE final website baseline V2
  ----------------------------------------------------
  This is intentionally a complete baseline, not "old baseline + deltas".
  Every visual control that defines the current website appearance is asserted
  from one source of truth after the calibrator UI/runtime has finished binding.
*/

const $ = id => document.getElementById(id);
const raf = () => new Promise(resolve => requestAnimationFrame(resolve));

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
  { scrollPct:100, azimuth:44, elevation:37, zoom:0.08, panX:0.50,  panZ:0.31, motionProgress:0.000, ease:'easeInOut' }
];

const STYLE = {
  background:'#ffffff',
  face:'#ffffff',
  faceTint:0.70,
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
  glowStrength:0.30,
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
  rippleWidth:0.30,
  rippleSoftness:0.081,
  rippleOriginX:0,
  rippleOriginZ:0,
  hemisphere:0.60,
  key:1.30,
  rim:0.35,
  exposure:0.85,
  keyTint:'#ffffff'
};

const MATERIAL_2_STYLE = {
  face:'#ebebeb',
  faceTint:0.70,
  faceLift:0.35,
  faceOpacity:0.94,
  faceRoughness:0.97,
  faceMetalness:0
};

const BASE_PLATE_STYLE = { scale:1.00 };

const SHADOW_STYLE = {
  enabled:true,
  azimuth:180,
  elevation:62,
  darkness:0.04,
  softness:2.00,
  bias:-0.00035,
  normalBias:0.0200,
  receiverOffset:0.025,
  mapSize:4096,
  blurSamples:8,
  filter:'VSM'
};

const STRIP_STYLE = {
  edgeAngle:10,
  edgeColor:'#cccccc',
  edgeOpacity:0.67,
  edgeWidth:0.25,
  glowColor:'#84c534',
  glowOpacity:0.076,
  glowWidth:1.30,
  haloOpacity:0.030,
  haloWidth:1.20,
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

const RUNTIME_STYLE = {
  scrollSmoothing:0.90,
  rippleDirectionSwitchPct:63.6,
  straightRibbonCentrelines:true
};

let applying = false;
let installed = false;
let rippleUniforms = [];

function fire(input, eventName = 'input') {
  input?.dispatchEvent(new Event(eventName, { bubbles:true }));
}

function setValue(id, value, eventName = 'input') {
  const input = $(id);
  if (!input) return;
  input.value = String(value);
  fire(input, eventName);
}

function directInputs(selector) {
  const host = document.querySelector(selector);
  if (!host) return [];
  return [...host.children]
    .map(wrap => wrap.querySelector(':scope > input'))
    .filter(Boolean);
}

function setGroup(selector, values) {
  const inputs = directInputs(selector);
  values.forEach((value, index) => {
    const input = inputs[index];
    if (!input) return;
    input.value = String(value);
    fire(input);
  });
}

function setToggle(id, enabled) {
  const button = $(id);
  if (!button) return;
  const current = button.classList.contains('on');
  if (current !== !!enabled) button.click();
}

function applyGlobalStyle() {
  setGroup('#lightCtls', [
    STYLE.background,
    STYLE.hemisphere,
    STYLE.key,
    STYLE.rim,
    STYLE.exposure,
    STYLE.keyTint
  ]);

  setGroup('#faceCtls', [
    STYLE.face,
    STYLE.faceTint,
    STYLE.faceLift,
    STYLE.faceOpacity,
    STYLE.faceRoughness,
    STYLE.faceMetalness
  ]);

  setGroup('#slabCtls', [
    STYLE.slab,
    STYLE.slabOpacity,
    STYLE.slabRoughness,
    BASE_PLATE_STYLE.scale
  ]);

  setGroup('#edgeCtls', [
    STYLE.edge,
    STYLE.edgeOpacity,
    STYLE.edgeWidth,
    STYLE.edgeAngle
  ]);

  setGroup('#glowCtls', [
    STYLE.glow,
    STYLE.glowOpacity,
    STYLE.glowWidth,
    STYLE.glowStrength,
    STYLE.glowExpansion
  ]);

  setGroup('#dotCtls', [
    STYLE.dotColor,
    STYLE.dotDensity,
    STYLE.dotSize,
    STYLE.dotEdgeSoftness,
    STYLE.dotSkew,
    STYLE.dotFadedOpacity,
    STYLE.dotActiveOpacity,
    STYLE.rippleSpeed,
    STYLE.rippleFrequency,
    STYLE.rippleWidth,
    STYLE.rippleSoftness,
    STYLE.rippleOriginX,
    STYLE.rippleOriginZ
  ]);

  if (window.__ADAM_BASE_PLATE_SIZE_STATE) {
    window.__ADAM_BASE_PLATE_SIZE_STATE.baseScale = BASE_PLATE_STYLE.scale;
    window.__ADAM_BASE_PLATE_SIZE_APPLY?.(BASE_PLATE_STYLE.scale);
  }
}

function applyMaterial2() {
  setValue('material2Face', MATERIAL_2_STYLE.face);
  setValue('material2Tint', MATERIAL_2_STYLE.faceTint);
  setValue('material2Lift', MATERIAL_2_STYLE.faceLift);
  setValue('material2Opacity', MATERIAL_2_STYLE.faceOpacity);
  setValue('material2Roughness', MATERIAL_2_STYLE.faceRoughness);
  setValue('material2Metalness', MATERIAL_2_STYLE.faceMetalness);
}

function applyShadows() {
  const state = window.__ADAM_SHADOW_CALIBRATOR?.state;
  if (state) {
    Object.assign(state, {
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

  setValue('shadowAzimuth', SHADOW_STYLE.azimuth);
  setValue('shadowElevation', SHADOW_STYLE.elevation);
  setValue('shadowDarkness', SHADOW_STYLE.darkness);
  setValue('shadowSoftness', SHADOW_STYLE.softness);
  setValue('shadowBias', SHADOW_STYLE.bias);
  setValue('shadowNormalBias', SHADOW_STYLE.normalBias);
  setValue('shadowReceiverOffset', SHADOW_STYLE.receiverOffset);
  setToggle('tShadowCalibration', SHADOW_STYLE.enabled);
}

function applyStripStyle() {
  setValue('pathEdgeAngle', STRIP_STYLE.edgeAngle);
  setValue('pathEdgeColor', STRIP_STYLE.edgeColor);
  setValue('pathEdgeOpacity', STRIP_STYLE.edgeOpacity);
  setValue('pathEdgeWidth', STRIP_STYLE.edgeWidth);
  setValue('pathGlowColor', STRIP_STYLE.glowColor);
  setValue('pathGlowOpacity', STRIP_STYLE.glowOpacity);
  setValue('pathGlowWidth', STRIP_STYLE.glowWidth);
  setValue('pathHaloOpacity', STRIP_STYLE.haloOpacity);
  setValue('pathHaloWidth', STRIP_STYLE.haloWidth);

  setValue('pathPulseSpeed', STRIP_PULSE_STYLE.pulseSpeed);
  setValue('pathPulseWidth', STRIP_PULSE_STYLE.pulseWidth);
  setValue('pathPulseStrength', STRIP_PULSE_STYLE.pulseStrength);
  setValue('pathPulseStagger', STRIP_PULSE_STYLE.pulseStagger);

  setToggle('tPathEdges', FEATURE_STATE.stripEdges);
  setToggle('tPathGlow', FEATURE_STATE.stripGlow);
  setToggle('tPathPulse', FEATURE_STATE.stripPulse);

  const style = window.__ADAM_PATH_RIBBON_STYLE;
  if (style) {
    Object.assign(style, {
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
  }

  window.__ADAM_REBUILD_PATH_RAILS?.();
  window.__ADAM_PATH_STRAIGHT_CENTRELINES?.run?.();
}

function applyFeatureState() {
  setToggle('tEdges', FEATURE_STATE.edges);
  setToggle('tGlow', FEATURE_STATE.glow);
  setToggle('tDots', FEATURE_STATE.dots);
  setToggle('tAnimate', FEATURE_STATE.animateDots);
}

async function setFrame(mode, index, frame) {
  const modeButton = mode === 'mobile' ? $('responsiveMobileBtn') : $('responsiveDesktopBtn');
  if (!modeButton) return;
  if (!modeButton.classList.contains('on')) modeButton.click();
  await raf();

  const buttons = [...document.querySelectorAll('#kfrow button')];
  buttons[index]?.click();
  await raf();

  const cam = [...document.querySelectorAll('#camCtls input[type="range"]')];
  const values = [frame.azimuth, frame.elevation, frame.zoom, frame.panX, frame.panZ];
  values.forEach((value, i) => {
    if (!cam[i]) return;
    cam[i].value = String(value);
    fire(cam[i]);
  });

  const motion = document.querySelector('#motionCtls input[type="range"]');
  if (motion) {
    motion.value = String(frame.motionProgress ?? 0);
    fire(motion);
  }

  const pct = document.querySelector('#scrollKeyframeCtl .keyframe-pct-number');
  if (pct) {
    pct.value = String(frame.scrollPct);
    fire(pct, 'change');
  }
}

async function applyCameraBaseline() {
  for (let i = 0; i < DESKTOP_KEYFRAMES.length; i++) await setFrame('desktop', i, DESKTOP_KEYFRAMES[i]);
  for (let i = 0; i < MOBILE_KEYFRAMES.length; i++) await setFrame('mobile', i, MOBILE_KEYFRAMES[i]);

  $('responsiveDesktopBtn')?.click();
  await raf();
  [...document.querySelectorAll('#kfrow button')][0]?.click();
  setValue('scrollScrub', 0);
}

function discoverRippleUniforms() {
  rippleUniforms = [];
  const candidates = [
    window.__adamMasterplanV15Preview?.scene,
    window.__ADAM_CALIBRATOR_API?.scene,
    window.__adamCalibrator?.scene
  ].filter(Boolean);

  for (const scene of candidates) {
    scene.traverse?.(object => {
      const uniforms = object?.material?.uniforms;
      if (uniforms?.uRippleSpeed && uniforms?.uRippleSoft && uniforms?.uDotColor) rippleUniforms.push(uniforms);
    });
    if (rippleUniforms.length) break;
  }
}

function applyRippleDirection() {
  if (!rippleUniforms.length) discoverRippleUniforms();
  const pct = Number($('scrollScrub')?.value || 0);
  const speed = pct >= RUNTIME_STYLE.rippleDirectionSwitchPct ? 1.25 : -1.25;
  for (const uniforms of rippleUniforms) uniforms.uRippleSpeed.value = speed;
}

function enrichExport() {
  const out = $('out');
  if (!out?.value) return;
  const marker = '// Website-only runtime / geometry state.';
  const base = out.value.split(`\n\n${marker}`)[0];
  out.value = `${base}\n\n${marker}\nconst PATH_GEOMETRY_STATE = ${JSON.stringify({ straightRibbonCentrelines:true }, null, 2)};\n\nconst SCROLL_RUNTIME_STYLE = ${JSON.stringify({ smoothing:0.90, rippleDirectionSwitchPct:63.6 }, null, 2)};`;
}

function publishBaseline() {
  window.__ADAM_FINAL_FINAL_CALIBRATOR = {
    version:2,
    desktopKeyframes:DESKTOP_KEYFRAMES,
    mobileKeyframes:MOBILE_KEYFRAMES,
    style:STYLE,
    material2Style:MATERIAL_2_STYLE,
    basePlateStyle:BASE_PLATE_STYLE,
    shadowStyle:SHADOW_STYLE,
    stripStyle:STRIP_STYLE,
    stripPulseStyle:STRIP_PULSE_STYLE,
    featureState:FEATURE_STATE,
    runtimeStyle:RUNTIME_STYLE,
    apply:applyFinalState,
    enrichExport
  };
}

async function applyFinalState({ camera = true } = {}) {
  if (applying) return;
  applying = true;
  try {
    applyGlobalStyle();
    applyMaterial2();
    applyShadows();
    applyStripStyle();
    applyFeatureState();
    if (camera) await applyCameraBaseline();
    window.__ADAM_PATH_STRAIGHT_CENTRELINES?.run?.();
    applyRippleDirection();
    enrichExport();
  } finally {
    applying = false;
  }
}

async function install() {
  if (installed) return;

  while (
    !$('responsiveDesktopBtn') ||
    !$('responsiveMobileBtn') ||
    !document.querySelector('#lightCtls input') ||
    !document.querySelector('#faceCtls input') ||
    !document.querySelector('#slabCtls input') ||
    !document.querySelector('#edgeCtls input') ||
    !document.querySelector('#glowCtls input') ||
    !document.querySelector('#dotCtls input') ||
    !$('material2Face') ||
    !$('shadowReceiverOffset') ||
    !$('pathEdgeColor') ||
    !$('pathPulseSpeed') ||
    !window.__ADAM_SHADOW_CALIBRATOR ||
    !window.__ADAM_PATH_RIBBON_STYLE
  ) await raf();

  installed = true;
  publishBaseline();
  await applyFinalState({ camera:true });

  $('scrollScrub')?.addEventListener('input', applyRippleDirection);
  window.__ADAM_BEFORE_RENDER_HOOKS = window.__ADAM_BEFORE_RENDER_HOOKS || [];
  window.__ADAM_BEFORE_RENDER_HOOKS.push(applyRippleDirection);

  const copy = $('copyBtn');
  if (copy && !copy.dataset.finalFinalSync) {
    copy.dataset.finalFinalSync = 'v2';
    const original = copy.onclick;
    copy.onclick = async function(event) {
      if (original) await original.call(this, event);
      enrichExport();
      try { await navigator.clipboard.writeText($('out').value); } catch {}
    };
  }

  const reset = $('resetBtn');
  if (reset && !reset.dataset.finalFinalSync) {
    reset.dataset.finalFinalSync = 'v2';
    reset.onclick = async function() {
      await applyFinalState({ camera:true });
      const status = $('status');
      if (status) status.textContent += '\nreset to COMPLETE final website baseline';
    };
  }

  // One delayed visual-only reassert catches late model/material initialization
  // without touching camera/keyframe state again.
  setTimeout(() => applyFinalState({ camera:false }), 600);

  const status = $('status');
  if (status) status.textContent += '\nCOMPLETE final website baseline V2 loaded';
}

install();
