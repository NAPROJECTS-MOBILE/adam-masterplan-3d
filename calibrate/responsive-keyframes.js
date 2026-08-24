/*
  ADAM calibrator — Preview 5 responsive baseline
  ------------------------------------------------
  Native calibrator seed for the exact saved Webflow V1.5 Preview 5 timeline.

  Source of truth:
    production/adam-masterplan-v1.5-preview5.js

  IMPORTANT:
  - Desktop and Mobile each start from their own saved Preview 5 frames.
  - Mobile is NOT cloned from Desktop on boot.
  - Materials / lighting are shared globally, as in the production runtime.
  - Reset restores the exact saved Preview 5 desktop + mobile timelines and
    the saved Preview 5 scene/material baseline.
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

function setGroup(selector, values) {
  const inputs = [...document.querySelectorAll(`${selector} input`)];
  values.forEach((value, index) => setInput(inputs[index], value, 'input'));
}

function ensureToggleOn(id) {
  const button = $(id);
  if (button && !button.classList.contains('on')) button.click();
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

  setInput($('material2Face'), MATERIAL_2_BASELINE.face);
  setInput($('material2Tint'), MATERIAL_2_BASELINE.faceTint);
  setInput($('material2Lift'), MATERIAL_2_BASELINE.faceLift);
  setInput($('material2Opacity'), MATERIAL_2_BASELINE.faceOpacity);
  setInput($('material2Roughness'), MATERIAL_2_BASELINE.faceRoughness);
  setInput($('material2Metalness'), MATERIAL_2_BASELINE.faceMetalness);

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

function serialiseFrames(constName, frames) {
  const body = frames.map((k, i) =>
    `  // ${String(i + 1).padStart(2, '0')} @ ${Number(Number(k.scrollPct).toFixed(1))}% of .h-scroll\n` +
    `  { scrollPct: ${Number(Number(k.scrollPct).toFixed(1))}, azimuth: ${Number(k.azimuth).toFixed(0)}, elevation: ${Number(k.elevation).toFixed(0)}, ` +
    `zoom: ${Number(k.zoom).toFixed(2)}, panX: ${Number(k.panX).toFixed(2)}, panZ: ${Number(k.panZ).toFixed(2)}, ` +
    `motionProgress: ${Number(k.motionProgress ?? 0).toFixed(3)}, ease: '${k.ease || 'easeInOut'}' }`
  ).join(',\n');
  return `const ${constName} = [\n${body}\n];`;
}

function currentStyleBlock() {
  const value = $('out')?.value || '';
  const marker = 'const STYLE = ';
  const index = value.indexOf(marker);
  if (index >= 0) return value.slice(index).trim();
  return `const STYLE = ${JSON.stringify(STYLE_BASELINE, null, 2)};`;
}

function serialiseResponsive() {
  return `${serialiseFrames('DESKTOP_KEYFRAMES', modes.desktop)}\n\n` +
    `${serialiseFrames('MOBILE_KEYFRAMES', modes.mobile)}\n\n` +
    `// Shared across desktop + mobile.\n${currentStyleBlock()}`;
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
      ? `Editing MOBILE · ${modes.mobile.length} saved Preview 5 frames`
      : `Editing DESKTOP · ${modes.desktop.length} saved Preview 5 frames`;
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
    <p class="responsive-hint">Both modes start from the exact saved Preview 5 frames. They are independent unless you explicitly copy Desktop → Mobile.</p>
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
  if (status) status.textContent += '\nPreview 5 saved baseline restored · 5 desktop + 5 mobile frames';
}

async function install() {
  while (
    !keyframeButtons().length ||
    !document.querySelector('#camCtls input') ||
    !document.querySelector('#lightCtls input') ||
    !$('material2Face') ||
    !$('pathEdgeAngle')
  ) {
    await waitFrame();
  }

  addResponsiveUI();

  // Critical difference from the old helper: load the saved Preview 5 desktop
  // timeline directly instead of snapshotting app-v2's generic START_POSE seed.
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

  const copy = $('copyBtn');
  if (copy) {
    copy.textContent = 'Copy DESKTOP + MOBILE + STYLE';
    copy.onclick = async () => {
      modes[mode] = snapshotCurrentMode();
      const text = serialiseResponsive();
      $('out').value = text;
      try {
        await navigator.clipboard.writeText(text);
        $('status').textContent += '\nresponsive export copied · desktop + mobile';
      } catch {
        $('out').select();
      }
    };
  }

  const reset = $('resetBtn');
  if (reset) {
    reset.textContent = 'Reset to saved Preview 5 baseline';
    reset.onclick = restoreSavedBaseline;
  }

  window.__ADAM_PREVIEW5_CALIBRATOR_BASELINE = {
    desktop:cloneFrames(DESKTOP_BASELINE),
    mobile:cloneFrames(MOBILE_BASELINE),
    style:{ ...STYLE_BASELINE },
    material2:{ ...MATERIAL_2_BASELINE },
    strip:{ ...STRIP_BASELINE },
    reset:restoreSavedBaseline
  };

  updateModeUI();
  updateExportPreview();
}

install();
