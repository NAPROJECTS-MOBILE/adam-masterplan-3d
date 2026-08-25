/*
  ADAM calibrator — responsive final baseline + complete live export
  -----------------------------------------------------------------
  Desktop/mobile framing remains independent. Visual export is now generated
  directly from the controls that are actually driving the scene, rather than
  re-reading the old partial STYLE textarea output.

  Export includes:
  - DESKTOP_KEYFRAMES
  - MOBILE_KEYFRAMES
  - STYLE
  - MATERIAL_2_STYLE
  - BASE_PLATE_STYLE
  - SHADOW_STYLE
  - STRIP_STYLE
  - STRIP_PULSE_STYLE
  - FEATURE_STATE
*/

const $ = id => document.getElementById(id);
const waitFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

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

// New saved baseline from the approved calibrator values, 25 Aug 2026.
const STYLE_BASELINE = {
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
  dotDensity:20.45,
  dotSize:0.0275,
  dotEdgeSoftness:0.012,
  dotSkew:0.5,
  dotFadedOpacity:0.05,
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

const MATERIAL_2_BASELINE = {
  face:'#ebebeb',
  faceTint:0.70,
  faceLift:0.35,
  faceOpacity:0.94,
  faceRoughness:0.97,
  faceMetalness:0
};

const BASE_PLATE_BASELINE = {
  scale:1.00
};

const SHADOW_BASELINE = {
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

const STRIP_BASELINE = {
  edgeAngle:10,
  edgeColor:'#242424',
  edgeOpacity:0.14,
  edgeWidth:1.00,
  glowColor:'#84c534',
  glowOpacity:0.076,
  glowWidth:1.30,
  haloOpacity:0.030,
  haloWidth:1.20,
  edgesVisible:true,
  glowVisible:true
};

const STRIP_PULSE_BASELINE = {
  enabled:true,
  pulseSpeed:11.95,
  pulseWidth:0.80,
  pulseStrength:0.530,
  pulseStagger:0.12
};

let mode = 'desktop';
let suppress = false;
let modes = {
  desktop: DESKTOP_BASELINE.map(frame => ({ ...frame })),
  mobile: MOBILE_BASELINE.map(frame => ({ ...frame }))
};

function cloneFrames(frames) {
  return frames.map(frame => ({ ...frame }));
}

function keyframeButtons() {
  return [...document.querySelectorAll('#kfrow button')];
}

function activeIndex() {
  const buttons = keyframeButtons();
  const index = buttons.findIndex(button => button.classList.contains('on'));
  return index >= 0 ? index : 0;
}

function stopPlayback() {
  const play = $('playBtn');
  if (play?.textContent?.includes('Pause')) play.click();
}

function readCurrentFrame() {
  const cam = [...document.querySelectorAll('#camCtls input[type="range"]')].map(input => Number(input.value));
  const motion = document.querySelector('#motionCtls input[type="range"]');
  const pct = document.querySelector('#scrollKeyframeCtl .keyframe-pct-number');
  const ease = document.querySelector('#scrollKeyframeCtl .keyframe-ease');

  return {
    scrollPct:Number(pct?.value ?? 0),
    azimuth:Number(cam[0] ?? 0),
    elevation:Number(cam[1] ?? 0),
    zoom:Number(cam[2] ?? 0.1),
    panX:Number(cam[3] ?? 0),
    panZ:Number(cam[4] ?? 0),
    motionProgress:Number(motion?.value ?? 0),
    ease:ease?.value || 'easeInOut'
  };
}

function snapshotCurrentMode() {
  stopPlayback();
  const buttons = keyframeButtons();
  if (!buttons.length) return [];

  const selected = activeIndex();
  const frames = [];
  for (let i = 0; i < buttons.length; i++) {
    keyframeButtons()[i]?.click();
    frames.push(readCurrentFrame());
  }
  keyframeButtons()[Math.min(selected, keyframeButtons().length - 1)]?.click();
  return frames;
}

function setInput(input, value, eventName = 'input') {
  if (!input) return;
  input.value = String(value);
  input.dispatchEvent(new Event(eventName, { bubbles:true }));
}

function writeSelectedFrame(frame, setPct = true) {
  if (setPct) {
    setInput(document.querySelector('#scrollKeyframeCtl .keyframe-pct-number'), frame.scrollPct, 'change');
  }

  const cam = [...document.querySelectorAll('#camCtls input[type="range"]')];
  [frame.azimuth, frame.elevation, frame.zoom, frame.panX, frame.panZ].forEach((value, index) => {
    setInput(cam[index], value, 'input');
  });

  setInput(document.querySelector('#motionCtls input[type="range"]'), frame.motionProgress ?? 0, 'input');

  const ease = document.querySelector('#scrollKeyframeCtl .keyframe-ease');
  if (ease) {
    ease.value = frame.ease || 'easeInOut';
    ease.dispatchEvent(new Event('change', { bubbles:true }));
  }
}

function loadFrames(frames) {
  if (!frames?.length) return;
  suppress = true;
  stopPlayback();

  while (keyframeButtons().length > 1) {
    const buttons = keyframeButtons();
    buttons[buttons.length - 1]?.click();
    $('deleteKFBtn')?.click();
  }

  keyframeButtons()[0]?.click();
  writeSelectedFrame(frames[0], true);

  for (let i = 1; i < frames.length; i++) {
    setInput($('scrollScrub'), frames[i].scrollPct, 'input');
    $('addKFBtn')?.click();
    writeSelectedFrame(frames[i], true);
  }

  keyframeButtons()[0]?.click();
  setInput($('scrollScrub'), frames[0].scrollPct, 'input');
  suppress = false;
}

function directGroupInputs(selector) {
  const host = document.querySelector(selector);
  if (!host) return [];
  return [...host.children]
    .map(wrap => wrap.querySelector(':scope > input'))
    .filter(Boolean);
}

function setGroup(selector, values) {
  const inputs = directGroupInputs(selector);
  values.forEach((value, index) => setInput(inputs[index], value, 'input'));
}

function groupValues(selector) {
  return directGroupInputs(selector).map(input =>
    input.type === 'color' ? input.value : Number(input.value)
  );
}

function setToggle(id, enabled) {
  const button = $(id);
  if (!button) return;
  const on = button.classList.contains('on');
  if (on !== !!enabled) button.click();
}

function baseScaleInput() {
  const host = $('slabCtls');
  if (!host) return null;
  const wrappers = [...host.children];
  const explicit = wrappers.find(wrap => wrap._key === 'baseScale');
  return explicit?.querySelector(':scope > input') || directGroupInputs('#slabCtls')[3] || null;
}

function applySavedStyle() {
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
    STYLE_BASELINE.slabRoughness,
    BASE_PLATE_BASELINE.scale
  ]);
  setInput(baseScaleInput(), BASE_PLATE_BASELINE.scale);
  if (window.__ADAM_BASE_PLATE_SIZE_STATE) {
    window.__ADAM_BASE_PLATE_SIZE_STATE.baseScale = BASE_PLATE_BASELINE.scale;
    window.__ADAM_BASE_PLATE_SIZE_APPLY?.(BASE_PLATE_BASELINE.scale);
  }

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

  setInput($('material2Face'), MATERIAL_2_BASELINE.face);
  setInput($('material2Tint'), MATERIAL_2_BASELINE.faceTint);
  setInput($('material2Lift'), MATERIAL_2_BASELINE.faceLift);
  setInput($('material2Opacity'), MATERIAL_2_BASELINE.faceOpacity);
  setInput($('material2Roughness'), MATERIAL_2_BASELINE.faceRoughness);
  setInput($('material2Metalness'), MATERIAL_2_BASELINE.faceMetalness);

  setInput($('shadowAzimuth'), SHADOW_BASELINE.azimuth);
  setInput($('shadowElevation'), SHADOW_BASELINE.elevation);
  setInput($('shadowDarkness'), SHADOW_BASELINE.darkness);
  setInput($('shadowSoftness'), SHADOW_BASELINE.softness);
  setInput($('shadowBias'), SHADOW_BASELINE.bias);
  setInput($('shadowNormalBias'), SHADOW_BASELINE.normalBias);
  setInput($('shadowReceiverOffset'), SHADOW_BASELINE.receiverOffset);
  setToggle('tShadowCalibration', SHADOW_BASELINE.enabled);

  setInput($('pathEdgeAngle'), STRIP_BASELINE.edgeAngle);
  setInput($('pathEdgeColor'), STRIP_BASELINE.edgeColor);
  setInput($('pathEdgeOpacity'), STRIP_BASELINE.edgeOpacity);
  setInput($('pathEdgeWidth'), STRIP_BASELINE.edgeWidth);
  setInput($('pathGlowColor'), STRIP_BASELINE.glowColor);
  setInput($('pathGlowOpacity'), STRIP_BASELINE.glowOpacity);
  setInput($('pathGlowWidth'), STRIP_BASELINE.glowWidth);
  setInput($('pathHaloOpacity'), STRIP_BASELINE.haloOpacity);
  setInput($('pathHaloWidth'), STRIP_BASELINE.haloWidth);
  setToggle('tPathEdges', STRIP_BASELINE.edgesVisible);
  setToggle('tPathGlow', STRIP_BASELINE.glowVisible);

  setInput($('pathPulseSpeed'), STRIP_PULSE_BASELINE.pulseSpeed);
  setInput($('pathPulseWidth'), STRIP_PULSE_BASELINE.pulseWidth);
  setInput($('pathPulseStrength'), STRIP_PULSE_BASELINE.pulseStrength);
  setInput($('pathPulseStagger'), STRIP_PULSE_BASELINE.pulseStagger);
  setToggle('tPathPulse', STRIP_PULSE_BASELINE.enabled);
}

function serialiseFrames(constName, frames) {
  const body = frames.map((k, i) =>
    `  // ${String(i + 1).padStart(2, '0')} @ ${Number(Number(k.scrollPct).toFixed(1))}% of .h-scroll\n` +
    `  { scrollPct: ${Number(Number(k.scrollPct).toFixed(1))}, azimuth: ${Number(k.azimuth).toFixed(0)}, elevation: ${Number(k.elevation).toFixed(0)}, ` +
    `zoom: ${Number(k.zoom).toFixed(2)}, panX: ${Number(k.panX).toFixed(2)}, panZ: ${Number(k.panZ).toFixed(2)}, ` +
    `motionProgress: ${Number(k.motionProgress ?? 0).toFixed(3)}, ease: '${k.ease || 'easeInOut'}' }`
  ).join(',\n');
  return `const ${constName} = [\n${body}\n];`;
}

function valueOr(input, fallback) {
  if (!input) return fallback;
  return input.type === 'color' ? input.value : Number(input.value);
}

function readLiveStyle() {
  const light = groupValues('#lightCtls');
  const face = groupValues('#faceCtls');
  const slab = groupValues('#slabCtls');
  const edge = groupValues('#edgeCtls');
  const glow = groupValues('#glowCtls');
  const dots = groupValues('#dotCtls');

  return {
    background:light[0] ?? STYLE_BASELINE.background,
    face:face[0] ?? STYLE_BASELINE.face,
    faceTint:face[1] ?? STYLE_BASELINE.faceTint,
    faceLift:face[2] ?? STYLE_BASELINE.faceLift,
    faceOpacity:face[3] ?? STYLE_BASELINE.faceOpacity,
    faceRoughness:face[4] ?? STYLE_BASELINE.faceRoughness,
    faceMetalness:face[5] ?? STYLE_BASELINE.faceMetalness,
    slab:slab[0] ?? STYLE_BASELINE.slab,
    slabOpacity:slab[1] ?? STYLE_BASELINE.slabOpacity,
    slabRoughness:slab[2] ?? STYLE_BASELINE.slabRoughness,
    edge:edge[0] ?? STYLE_BASELINE.edge,
    edgeOpacity:edge[1] ?? STYLE_BASELINE.edgeOpacity,
    edgeWidth:edge[2] ?? STYLE_BASELINE.edgeWidth,
    edgeAngle:edge[3] ?? STYLE_BASELINE.edgeAngle,
    glow:glow[0] ?? STYLE_BASELINE.glow,
    glowOpacity:glow[1] ?? STYLE_BASELINE.glowOpacity,
    glowWidth:glow[2] ?? STYLE_BASELINE.glowWidth,
    glowStrength:glow[3] ?? STYLE_BASELINE.glowStrength,
    glowExpansion:glow[4] ?? STYLE_BASELINE.glowExpansion,
    dotColor:dots[0] ?? STYLE_BASELINE.dotColor,
    dotDensity:dots[1] ?? STYLE_BASELINE.dotDensity,
    dotSize:dots[2] ?? STYLE_BASELINE.dotSize,
    dotEdgeSoftness:dots[3] ?? STYLE_BASELINE.dotEdgeSoftness,
    dotSkew:dots[4] ?? STYLE_BASELINE.dotSkew,
    dotFadedOpacity:dots[5] ?? STYLE_BASELINE.dotFadedOpacity,
    dotActiveOpacity:dots[6] ?? STYLE_BASELINE.dotActiveOpacity,
    rippleSpeed:dots[7] ?? STYLE_BASELINE.rippleSpeed,
    rippleFrequency:dots[8] ?? STYLE_BASELINE.rippleFrequency,
    rippleWidth:dots[9] ?? STYLE_BASELINE.rippleWidth,
    rippleSoftness:dots[10] ?? STYLE_BASELINE.rippleSoftness,
    rippleOriginX:dots[11] ?? STYLE_BASELINE.rippleOriginX,
    rippleOriginZ:dots[12] ?? STYLE_BASELINE.rippleOriginZ,
    hemisphere:light[1] ?? STYLE_BASELINE.hemisphere,
    key:light[2] ?? STYLE_BASELINE.key,
    rim:light[3] ?? STYLE_BASELINE.rim,
    exposure:light[4] ?? STYLE_BASELINE.exposure,
    keyTint:light[5] ?? STYLE_BASELINE.keyTint
  };
}

function readMaterial2Style() {
  return {
    face:valueOr($('material2Face'), MATERIAL_2_BASELINE.face),
    faceTint:valueOr($('material2Tint'), MATERIAL_2_BASELINE.faceTint),
    faceLift:valueOr($('material2Lift'), MATERIAL_2_BASELINE.faceLift),
    faceOpacity:valueOr($('material2Opacity'), MATERIAL_2_BASELINE.faceOpacity),
    faceRoughness:valueOr($('material2Roughness'), MATERIAL_2_BASELINE.faceRoughness),
    faceMetalness:valueOr($('material2Metalness'), MATERIAL_2_BASELINE.faceMetalness)
  };
}

function readBasePlateStyle() {
  const live = Number(window.__ADAM_BASE_PLATE_SIZE_STATE?.baseScale);
  return {
    scale:Number.isFinite(live) ? live : valueOr(baseScaleInput(), BASE_PLATE_BASELINE.scale)
  };
}

function readShadowStyle() {
  const live = window.__ADAM_SHADOW_CALIBRATOR?.state || {};
  return {
    enabled:$('tShadowCalibration')?.classList.contains('on') ?? SHADOW_BASELINE.enabled,
    azimuth:valueOr($('shadowAzimuth'), live.azimuth ?? SHADOW_BASELINE.azimuth),
    elevation:valueOr($('shadowElevation'), live.elevation ?? SHADOW_BASELINE.elevation),
    darkness:valueOr($('shadowDarkness'), live.darkness ?? SHADOW_BASELINE.darkness),
    softness:valueOr($('shadowSoftness'), live.softness ?? SHADOW_BASELINE.softness),
    bias:valueOr($('shadowBias'), live.bias ?? SHADOW_BASELINE.bias),
    normalBias:valueOr($('shadowNormalBias'), live.normalBias ?? SHADOW_BASELINE.normalBias),
    receiverOffset:valueOr($('shadowReceiverOffset'), live.receiverOffset ?? SHADOW_BASELINE.receiverOffset),
    mapSize:Number(live.mapSize ?? SHADOW_BASELINE.mapSize),
    blurSamples:SHADOW_BASELINE.blurSamples,
    filter:'VSM'
  };
}

function readStripStyle() {
  const live = window.__ADAM_PATH_RIBBON_STYLE || {};
  return {
    edgeAngle:valueOr($('pathEdgeAngle'), STRIP_BASELINE.edgeAngle),
    edgeColor:valueOr($('pathEdgeColor'), live.edgeColor ?? STRIP_BASELINE.edgeColor),
    edgeOpacity:valueOr($('pathEdgeOpacity'), live.edgeOpacity ?? STRIP_BASELINE.edgeOpacity),
    edgeWidth:valueOr($('pathEdgeWidth'), live.edgeWidth ?? STRIP_BASELINE.edgeWidth),
    glowColor:valueOr($('pathGlowColor'), live.glowColor ?? STRIP_BASELINE.glowColor),
    glowOpacity:valueOr($('pathGlowOpacity'), live.glowOpacity ?? STRIP_BASELINE.glowOpacity),
    glowWidth:valueOr($('pathGlowWidth'), live.glowWidth ?? STRIP_BASELINE.glowWidth),
    haloOpacity:valueOr($('pathHaloOpacity'), live.haloOpacity ?? STRIP_BASELINE.haloOpacity),
    haloWidth:valueOr($('pathHaloWidth'), live.haloWidth ?? STRIP_BASELINE.haloWidth),
    edgesVisible:$('tPathEdges')?.classList.contains('on') ?? true,
    glowVisible:$('tPathGlow')?.classList.contains('on') ?? true
  };
}

function readStripPulseStyle() {
  const live = window.__ADAM_PATH_RIBBON_STYLE || {};
  return {
    enabled:$('tPathPulse')?.classList.contains('on') ?? STRIP_PULSE_BASELINE.enabled,
    pulseSpeed:valueOr($('pathPulseSpeed'), live.pulseSpeed ?? STRIP_PULSE_BASELINE.pulseSpeed),
    pulseWidth:valueOr($('pathPulseWidth'), live.pulseWidth ?? STRIP_PULSE_BASELINE.pulseWidth),
    pulseStrength:valueOr($('pathPulseStrength'), live.pulseStrength ?? STRIP_PULSE_BASELINE.pulseStrength),
    pulseStagger:valueOr($('pathPulseStagger'), live.pulseStagger ?? STRIP_PULSE_BASELINE.pulseStagger)
  };
}

function readFeatureState() {
  return {
    shadows:$('tShadowCalibration')?.classList.contains('on') ?? true,
    edges:$('tEdges')?.classList.contains('on') ?? true,
    glow:$('tGlow')?.classList.contains('on') ?? true,
    dots:$('tDots')?.classList.contains('on') ?? true,
    animateDots:$('tAnimate')?.classList.contains('on') ?? true,
    stripEdges:$('tPathEdges')?.classList.contains('on') ?? true,
    stripGlow:$('tPathGlow')?.classList.contains('on') ?? true,
    stripPulse:$('tPathPulse')?.classList.contains('on') ?? true,
    architecturalGlowStencil:true
  };
}

function serialiseObject(name, value) {
  return `const ${name} = ${JSON.stringify(value, null, 2)};`;
}

function serialiseResponsive() {
  return [
    serialiseFrames('DESKTOP_KEYFRAMES', modes.desktop),
    serialiseFrames('MOBILE_KEYFRAMES', modes.mobile),
    '// Shared global scene styling.',
    serialiseObject('STYLE', readLiveStyle()),
    '// Secondary material styling.',
    serialiseObject('MATERIAL_2_STYLE', readMaterial2Style()),
    '// Base plate footprint.',
    serialiseObject('BASE_PLATE_STYLE', readBasePlateStyle()),
    '// Shadow renderer styling.',
    serialiseObject('SHADOW_STYLE', readShadowStyle()),
    '// Static strip edge/glow styling.',
    serialiseObject('STRIP_STYLE', readStripStyle()),
    '// Independent whole-strip electric pulse.',
    serialiseObject('STRIP_PULSE_STYLE', readStripPulseStyle()),
    '// Visual feature toggles.',
    serialiseObject('FEATURE_STATE', readFeatureState())
  ].join('\n\n');
}

function updateExportPreview() {
  const out = $('out');
  if (out) out.value = serialiseResponsive();
}

function updateModeUI() {
  $('responsiveDesktopBtn')?.classList.toggle('on', mode === 'desktop');
  $('responsiveMobileBtn')?.classList.toggle('on', mode === 'mobile');

  const frame = $('frame');
  frame?.classList.toggle('portrait', mode === 'mobile');
  frame?.classList.toggle('responsive-mobile-edit', mode === 'mobile');

  const portrait = $('tPortrait');
  if (portrait) {
    portrait.disabled = mode === 'mobile';
    portrait.classList.toggle('on', mode === 'mobile');
  }

  const badge = $('responsiveModeStatus');
  if (badge) {
    badge.textContent = mode === 'mobile'
      ? `Editing MOBILE · ${modes.mobile.length} saved frames`
      : `Editing DESKTOP · ${modes.desktop.length} saved frames`;
  }
}

function saveActiveFrameFromControls() {
  if (suppress) return;
  const index = activeIndex();
  if (!modes[mode][index]) return;
  modes[mode][index] = readCurrentFrame();
  updateModeUI();
  setTimeout(updateExportPreview, 0);
}

function refreshModeSnapshot() {
  if (suppress) return;
  modes[mode] = snapshotCurrentMode();
  updateModeUI();
  updateExportPreview();
}

function switchMode(nextMode) {
  if (nextMode === mode) return;
  modes[mode] = snapshotCurrentMode();
  mode = nextMode;
  loadFrames(modes[mode]);
  updateModeUI();
  updateExportPreview();
}

function addResponsiveUI() {
  if ($('responsiveDesktopBtn')) return;

  const keyframeHeading = [...document.querySelectorAll('#panel h2')]
    .find(heading => heading.textContent.trim() === 'Keyframe');
  if (!keyframeHeading) return;

  const heading = document.createElement('h2');
  heading.textContent = 'Responsive framing';

  const box = document.createElement('div');
  box.className = 'responsive-keyframe-box';
  box.innerHTML = `
    <div class="row tog responsive-mode-row">
      <button id="responsiveDesktopBtn" class="on">Desktop frames</button>
      <button id="responsiveMobileBtn">Mobile frames</button>
    </div>
    <button class="btn ghost responsive-sync-btn" id="responsiveSyncBtn">Copy desktop → mobile</button>
    <div class="responsive-mode-status" id="responsiveModeStatus"></div>
    <p class="responsive-hint">Desktop and Mobile framing are independent. The main export below always contains both framing sets plus every live visual styling block.</p>
  `;

  keyframeHeading.before(heading, box);

  $('responsiveDesktopBtn').onclick = () => switchMode('desktop');
  $('responsiveMobileBtn').onclick = () => switchMode('mobile');
  $('responsiveSyncBtn').onclick = () => {
    if (mode === 'desktop') modes.desktop = snapshotCurrentMode();
    modes.mobile = cloneFrames(modes.desktop);
    if (mode === 'mobile') loadFrames(modes.mobile);
    updateModeUI();
    updateExportPreview();
  };
}

async function restoreSavedBaseline() {
  suppress = true;
  stopPlayback();
  modes.desktop = cloneFrames(DESKTOP_BASELINE);
  modes.mobile = cloneFrames(MOBILE_BASELINE);
  applySavedStyle();
  mode = 'desktop';
  loadFrames(modes.desktop);
  suppress = false;
  updateModeUI();
  updateExportPreview();

  const status = $('status');
  if (status) status.textContent += '\nFinal saved baseline restored · complete styling export refreshed';
}

async function install() {
  while (
    !keyframeButtons().length ||
    !document.querySelector('#camCtls input') ||
    !document.querySelector('#lightCtls input') ||
    !$('material2Face') ||
    !$('pathEdgeAngle') ||
    !$('pathPulseSpeed') ||
    !$('shadowReceiverOffset')
  ) {
    await waitFrame();
  }

  addResponsiveUI();

  suppress = true;
  applySavedStyle();
  loadFrames(DESKTOP_BASELINE);
  modes.desktop = cloneFrames(DESKTOP_BASELINE);
  modes.mobile = cloneFrames(MOBILE_BASELINE);
  mode = 'desktop';
  suppress = false;

  const keyframeHosts = [
    $('camCtls'), $('motionCtls'), $('scrollKeyframeCtl')
  ].filter(Boolean);

  for (const host of keyframeHosts) {
    host.addEventListener('input', saveActiveFrameFromControls);
    host.addEventListener('change', saveActiveFrameFromControls);
  }

  for (const id of ['addKFBtn', 'deleteKFBtn', 'copyPrevBtn']) {
    $(id)?.addEventListener('click', () => setTimeout(refreshModeSnapshot, 0));
  }

  // Any visual control movement immediately refreshes the export textarea.
  const panel = $('panel');
  panel?.addEventListener('input', () => {
    if (!suppress) setTimeout(updateExportPreview, 0);
  });
  panel?.addEventListener('change', () => {
    if (!suppress) setTimeout(updateExportPreview, 0);
  });
  panel?.addEventListener('click', event => {
    const id = event.target?.id || '';
    if (/^t(?:ShadowCalibration|PathEdges|PathGlow|PathPulse|Edges|Glow|Dots|Animate)$/.test(id)) {
      setTimeout(updateExportPreview, 0);
    }
  });

  const copy = $('copyBtn');
  if (copy) {
    copy.textContent = 'Copy COMPLETE DESKTOP + MOBILE + STYLES';
    copy.onclick = async () => {
      modes[mode] = snapshotCurrentMode();
      const text = serialiseResponsive();
      $('out').value = text;
      try {
        await navigator.clipboard.writeText(text);
        $('status').textContent += '\ncomplete export copied · frames + global + M2 + base + shadows + strips + pulse';
      } catch {
        $('out').select();
      }
    };
  }

  const reset = $('resetBtn');
  if (reset) {
    reset.textContent = 'Reset to saved FINAL baseline';
    reset.onclick = restoreSavedBaseline;
  }

  window.__ADAM_PREVIEW5_CALIBRATOR_BASELINE = {
    desktop:cloneFrames(DESKTOP_BASELINE),
    mobile:cloneFrames(MOBILE_BASELINE),
    style:{ ...STYLE_BASELINE },
    material2:{ ...MATERIAL_2_BASELINE },
    basePlate:{ ...BASE_PLATE_BASELINE },
    shadows:{ ...SHADOW_BASELINE },
    strip:{ ...STRIP_BASELINE },
    stripPulse:{ ...STRIP_PULSE_BASELINE },
    export:serialiseResponsive,
    reset:restoreSavedBaseline
  };

  updateModeUI();
  updateExportPreview();
}

install();