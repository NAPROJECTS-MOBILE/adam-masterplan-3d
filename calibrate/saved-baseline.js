/*
  ADAM calibrator — saved baseline loader
  ---------------------------------------
  Makes the calibration tool open from the last known-good Preview 5 baseline
  rather than app-v2's generic START_POSE / Official Light seed.

  Source of truth:
  - desktop/mobile camera timeline: production/adam-masterplan-v1.5-preview5.js
  - global scene style: production/adam-masterplan-v1.5-preview.js
  - Material 2 defaults: production/adam-masterplan-v1.5-preview.js
  - strip style: calibrate/path-ribbon-glow.js accepted defaults

  This module only drives the calibrator's existing controls. It does not modify
  the production runtime or GLB.
*/

const $ = id => document.getElementById(id);
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

const DESKTOP_BASELINE = [
  { scrollPct:0,   azimuth:22, elevation:27, zoom:0.04, panX:-0.46, panZ:-0.08, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:25,  azimuth:38, elevation:27, zoom:0.08, panX:-0.46, panZ:-0.08, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:50,  azimuth:51, elevation:28, zoom:0.08, panX:-0.19, panZ:0.17,  motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:75,  azimuth:51, elevation:28, zoom:0.08, panX:0.12,  panZ:0.27,  motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:100, azimuth:44, elevation:28, zoom:0.08, panX:0.48,  panZ:0.35,  motionProgress:0.000, ease:'easeInOut' }
];

const MOBILE_BASELINE = [
  { scrollPct:0,   azimuth:29, elevation:32, zoom:0.02, panX:-0.44, panZ:0.00, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:25,  azimuth:37, elevation:34, zoom:0.06, panX:-0.44, panZ:0.00, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:50,  azimuth:14, elevation:37, zoom:0.05, panX:-0.19, panZ:0.27, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:75,  azimuth:29, elevation:36, zoom:0.08, panX:0.11,  panZ:0.27, motionProgress:0.000, ease:'easeInOut' },
  { scrollPct:100, azimuth:29, elevation:37, zoom:0.08, panX:0.48,  panZ:0.31, motionProgress:0.000, ease:'easeInOut' }
];

const STYLE_BASELINE = {
  background:'#ffffff',
  face:'#ffffff',
  faceTint:0.70,
  faceLift:0.50,
  faceOpacity:0.94,
  faceRoughness:0.97,
  faceMetalness:0,
  slab:'#ffffff',
  slabOpacity:0.14,
  slabRoughness:1,
  edge:'#242424',
  edgeOpacity:0.15,
  edgeWidth:1,
  edgeAngle:30,
  glow:'#b9e222',
  glowOpacity:0.06,
  glowWidth:7,
  glowStrength:0.30,
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
  rippleWidth:0.30,
  rippleSoftness:0.08,
  rippleOriginX:0,
  rippleOriginZ:0,
  hemisphere:0.60,
  key:1.30,
  rim:0.35,
  exposure:0.85,
  keyTint:'#ffffff'
};

const MATERIAL_2_BASELINE = {
  face:'#ebebeb',
  faceTint:0.70,
  faceLift:0.15,
  faceOpacity:0.94,
  faceRoughness:0.97,
  faceMetalness:0
};

const STRIP_BASELINE = {
  edgeAngle:10,
  edgeColor:'#242424',
  edgeOpacity:0.14,
  edgeWidth:1,
  glowColor:'#86bf40',
  glowOpacity:0.076,
  glowWidth:1.96,
  haloOpacity:0.030,
  haloWidth:3.50
};

let applying = false;

function fire(input, eventName = 'input') {
  input?.dispatchEvent(new Event(eventName, { bubbles:true }));
}

function setInput(input, value, eventName = 'input') {
  if (!input) return;
  input.value = String(value);
  fire(input, eventName);
}

function setGroup(selector, values) {
  const inputs = [...document.querySelectorAll(`${selector} input`)];
  values.forEach((value, index) => setInput(inputs[index], value));
}

function stopPlayback() {
  const play = $('playBtn');
  if (play?.textContent?.includes('Pause')) play.click();
}

function frameButtons() {
  return [...document.querySelectorAll('#kfrow button')];
}

function writeSelectedFrame(frame) {
  const pct = document.querySelector('#scrollKeyframeCtl .keyframe-pct-number');
  setInput(pct, frame.scrollPct, 'change');

  const cam = [...document.querySelectorAll('#camCtls input[type="range"]')];
  [frame.azimuth, frame.elevation, frame.zoom, frame.panX, frame.panZ].forEach((value, index) => {
    setInput(cam[index], value);
  });

  setInput(document.querySelector('#motionCtls input[type="range"]'), frame.motionProgress ?? 0);

  const ease = document.querySelector('#scrollKeyframeCtl .keyframe-ease');
  if (ease) {
    ease.value = frame.ease || 'easeInOut';
    fire(ease, 'change');
  }
}

function loadFrames(frames) {
  stopPlayback();

  while (frameButtons().length > 1) {
    const buttons = frameButtons();
    buttons[buttons.length - 1]?.click();
    $('deleteKFBtn')?.click();
  }

  frameButtons()[0]?.click();
  writeSelectedFrame(frames[0]);

  for (let i = 1; i < frames.length; i++) {
    setInput($('scrollScrub'), frames[i].scrollPct);
    $('addKFBtn')?.click();
    writeSelectedFrame(frames[i]);
  }

  frameButtons()[0]?.click();
  setInput($('scrollScrub'), 0);
}

function applyGlobalStyle() {
  setGroup('#lightCtls', [
    STYLE_BASELINE.background,
    STYLE_BASELINE.hemisphere,
    STYLE_BASELINE.key,
    STYLE_BASELINE.rim,
    STYLE_BASELINE.exposure,
    STYLE_BASELINE.keyTint
  ]);

  setGroup('#faceCtls', [
    STYLE_BASELINE.face,
    STYLE_BASELINE.faceTint,
    STYLE_BASELINE.faceLift,
    STYLE_BASELINE.faceOpacity,
    STYLE_BASELINE.faceRoughness,
    STYLE_BASELINE.faceMetalness
  ]);

  setGroup('#slabCtls', [
    STYLE_BASELINE.slab,
    STYLE_BASELINE.slabOpacity,
    STYLE_BASELINE.slabRoughness
  ]);

  setGroup('#edgeCtls', [
    STYLE_BASELINE.edge,
    STYLE_BASELINE.edgeOpacity,
    STYLE_BASELINE.edgeWidth,
    STYLE_BASELINE.edgeAngle
  ]);

  setGroup('#glowCtls', [
    STYLE_BASELINE.glow,
    STYLE_BASELINE.glowOpacity,
    STYLE_BASELINE.glowWidth,
    STYLE_BASELINE.glowStrength,
    STYLE_BASELINE.glowExpansion
  ]);

  setGroup('#dotCtls', [
    STYLE_BASELINE.dotColor,
    STYLE_BASELINE.dotDensity,
    STYLE_BASELINE.dotSize,
    STYLE_BASELINE.dotEdgeSoftness,
    STYLE_BASELINE.dotSkew,
    STYLE_BASELINE.dotFadedOpacity,
    STYLE_BASELINE.dotActiveOpacity,
    STYLE_BASELINE.rippleSpeed,
    STYLE_BASELINE.rippleFrequency,
    STYLE_BASELINE.rippleWidth,
    STYLE_BASELINE.rippleSoftness,
    STYLE_BASELINE.rippleOriginX,
    STYLE_BASELINE.rippleOriginZ
  ]);
}

function applyMaterial2() {
  setInput($('material2Face'), MATERIAL_2_BASELINE.face);
  setInput($('material2Tint'), MATERIAL_2_BASELINE.faceTint);
  setInput($('material2Lift'), MATERIAL_2_BASELINE.faceLift);
  setInput($('material2Opacity'), MATERIAL_2_BASELINE.faceOpacity);
  setInput($('material2Roughness'), MATERIAL_2_BASELINE.faceRoughness);
  setInput($('material2Metalness'), MATERIAL_2_BASELINE.faceMetalness);
}

function ensureToggleOn(id) {
  const button = $(id);
  if (button && !button.classList.contains('on')) button.click();
}

function applyStripStyle() {
  setInput($('pathEdgeAngle'), STRIP_BASELINE.edgeAngle);
  setInput($('pathEdgeColor'), STRIP_BASELINE.edgeColor);
  setInput($('pathEdgeOpacity'), STRIP_BASELINE.edgeOpacity);
  setInput($('pathEdgeWidth'), STRIP_BASELINE.edgeWidth);
  setInput($('pathGlowColor'), STRIP_BASELINE.glowColor);
  setInput($('pathGlowOpacity'), STRIP_BASELINE.glowOpacity);
  setInput($('pathGlowWidth'), STRIP_BASELINE.glowWidth);
  setInput($('pathHaloOpacity'), STRIP_BASELINE.haloOpacity);
  setInput($('pathHaloWidth'), STRIP_BASELINE.haloWidth);
  ensureToggleOn('tPathEdges');
  ensureToggleOn('tPathGlow');
}

async function applySavedBaseline() {
  if (applying) return;
  applying = true;

  try {
    stopPlayback();

    // Scene-global appearance first so every camera frame previews the same
    // saved material / lighting baseline.
    applyGlobalStyle();
    applyMaterial2();
    applyStripStyle();

    // Desktop baseline.
    $('responsiveDesktopBtn')?.click();
    await nextFrame();
    loadFrames(DESKTOP_BASELINE);
    await nextFrame();

    // Independent saved mobile baseline — do not merely clone desktop.
    $('responsiveMobileBtn')?.click();
    await nextFrame();
    loadFrames(MOBILE_BASELINE);
    await nextFrame();

    // Return the tool to Desktop frame 01 / scroll 0 for a deterministic start.
    $('responsiveDesktopBtn')?.click();
    await nextFrame();
    frameButtons()[0]?.click();
    setInput($('scrollScrub'), 0);

    document.documentElement.dataset.savedBaseline = 'preview5';
    const status = $('status');
    if (status && !status.textContent.includes('saved Preview 5 baseline loaded')) {
      status.textContent += '\nsaved Preview 5 baseline loaded · desktop + mobile + materials';
    }
  } finally {
    applying = false;
  }
}

async function install() {
  while (
    !$('responsiveDesktopBtn') ||
    !$('responsiveMobileBtn') ||
    !frameButtons().length ||
    !document.querySelector('#camCtls input') ||
    !document.querySelector('#lightCtls input')
  ) {
    await nextFrame();
  }

  await applySavedBaseline();

  const reset = $('resetBtn');
  if (reset) {
    reset.textContent = 'Reset to saved baseline';
    reset.onclick = () => applySavedBaseline();
  }

  window.__ADAM_SAVED_CALIBRATION_BASELINE = {
    version:'preview5',
    desktop:DESKTOP_BASELINE.map(frame => ({ ...frame })),
    mobile:MOBILE_BASELINE.map(frame => ({ ...frame })),
    style:{ ...STYLE_BASELINE },
    material2:{ ...MATERIAL_2_BASELINE },
    strip:{ ...STRIP_BASELINE },
    reset:applySavedBaseline
  };
}

install();
