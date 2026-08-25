import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/*
  ADAM path pulse rhythm V1
  -------------------------
  Replaces the synchronized travelling pulse with sparse, independent whole-strip
  illumination hits: quick attack, soft decay, irregular timing, shuffled strip
  selection. The approved base strip edge/glow remains underneath and unchanged.
*/

const DEFAULTS = {
  pulseSpeed:1.35,      // average independent strip hits per second
  pulseWidth:0.70,      // total pulse envelope duration (seconds)
  pulseStrength:0.20,   // peak extra glow
  pulseStagger:0.78     // repurposed as timing/strength randomness (0..1)
};

const MIN_INTERVAL = 0.12;
const MAX_SIMULTANEOUS = 3;
const overlays = new Map();
let currentEntries = [];
let queue = [];
let nextHitAt = 0;
let lastIndex = -1;
let initialized = false;
let frames = 0;
let lastStatusFrame = 0;

function makeMaterial() {
  const material = new LineMaterial({
    transparent:true,
    depthTest:true,
    depthWrite:false,
    blending:THREE.NormalBlending
  });
  material.toneMapped = false;
  material.opacity = 0;
  return material;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function refillQueue(count) {
  queue = shuffle(Array.from({ length:count }, (_, i) => i));
  if (queue.length > 1 && queue[queue.length - 1] === lastIndex) {
    [queue[queue.length - 1], queue[queue.length - 2]] = [queue[queue.length - 2], queue[queue.length - 1]];
  }
}

function globalGlowOn() {
  const global = document.getElementById('tGlow');
  return global ? global.classList.contains('on') : true;
}

function setControlLabel(inputId, text) {
  const input = document.getElementById(inputId);
  const label = input?.closest?.('.ctl')?.querySelector?.('label');
  if (!label?.firstChild) return;
  label.firstChild.nodeValue = text;
}

function paintControl(id, value, digits) {
  const input = document.getElementById(id);
  const readout = document.getElementById(`${id}V`);
  if (input) input.value = String(value);
  if (readout) readout.textContent = Number(value).toFixed(digits);
}

function configureControls(style) {
  if (style.__adamIndependentPulseDefaultsApplied) return;
  style.pulseSpeed = DEFAULTS.pulseSpeed;
  style.pulseWidth = DEFAULTS.pulseWidth;
  style.pulseStrength = DEFAULTS.pulseStrength;
  style.pulseStagger = DEFAULTS.pulseStagger;
  style.__adamIndependentPulseDefaultsApplied = true;

  const toggle = document.getElementById('tPathPulse');
  if (toggle) toggle.textContent = 'Independent strip pulse';

  const speed = document.getElementById('pathPulseSpeed');
  if (speed) { speed.min = '0.15'; speed.max = '4'; speed.step = '0.05'; }
  const width = document.getElementById('pathPulseWidth');
  if (width) { width.min = '0.15'; width.max = '1.8'; width.step = '0.05'; }
  const stagger = document.getElementById('pathPulseStagger');
  if (stagger) { stagger.min = '0'; stagger.max = '1'; stagger.step = '0.02'; }

  setControlLabel('pathPulseSpeed', 'Pulse rate (hits/sec)');
  setControlLabel('pathPulseWidth', 'Pulse decay time');
  setControlLabel('pathPulseStrength', 'Pulse brightness');
  setControlLabel('pathPulseStagger', 'Timing randomness');

  paintControl('pathPulseSpeed', style.pulseSpeed, 2);
  paintControl('pathPulseWidth', style.pulseWidth, 2);
  paintControl('pathPulseStrength', style.pulseStrength, 3);
  paintControl('pathPulseStagger', style.pulseStagger, 2);
}

function clearOverlays() {
  for (const state of overlays.values()) {
    for (const line of [state.halo, state.core]) {
      line?.removeFromParent?.();
      line?.geometry?.dispose?.();
      line?.material?.dispose?.();
    }
  }
  overlays.clear();
  currentEntries = [];
  queue = [];
  lastIndex = -1;
}

function buildOverlays(entries) {
  clearOverlays();
  currentEntries = [...entries];

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (!entry?.source || !entry?.inner?.geometry) continue;

    // Suppress the old moving dash layers. Base strip glow remains untouched.
    if (entry.pulseSoft) entry.pulseSoft.visible = false;
    if (entry.pulseCore) entry.pulseCore.visible = false;

    const haloMat = makeMaterial();
    const coreMat = makeMaterial();
    const halo = new LineSegments2(entry.inner.geometry.clone(), haloMat);
    const core = new LineSegments2(entry.inner.geometry.clone(), coreMat);

    for (const line of [halo, core]) {
      line.userData.adamPathRailLayer = true;
      line.userData.adamIndependentPulse = true;
      line.userData.adamPathRailSource = entry.originalPath;
      line.frustumCulled = false;
    }
    halo.renderOrder = 3.22;
    core.renderOrder = 3.42;
    entry.source.add(halo, core);

    overlays.set(entry, {
      entry,
      index,
      halo,
      core,
      startedAt:-Infinity,
      duration:DEFAULTS.pulseWidth,
      attack:0.075,
      hold:0.035,
      peak:1,
      active:false
    });
  }

  refillQueue(entries.length);
  nextHitAt = performance.now() * 0.001 + 0.15;
  console.info('[ADAM independent strip pulse V1]', {
    ribbons:entries.length,
    overlays:overlays.size,
    defaults:DEFAULTS
  });
}

function entriesChanged(entries) {
  if (entries.length !== currentEntries.length) return true;
  for (let i = 0; i < entries.length; i++) if (entries[i] !== currentEntries[i]) return true;
  return false;
}

function scheduleInterval(style) {
  const rate = Math.max(0.05, Number(style.pulseSpeed) || DEFAULTS.pulseSpeed);
  const randomness = THREE.MathUtils.clamp(Number(style.pulseStagger) || 0, 0, 1);
  const base = 1 / rate;
  const variation = (Math.random() * 2 - 1) * randomness * 0.58;
  return Math.max(MIN_INTERVAL, base * (1 + variation));
}

function chooseNextState() {
  if (!currentEntries.length) return null;
  if (!queue.length) refillQueue(currentEntries.length);

  let index = queue.pop();
  if (index === lastIndex && queue.length) {
    const alternate = queue.pop();
    queue.push(index);
    index = alternate;
  }
  lastIndex = index;
  return overlays.get(currentEntries[index]) || null;
}

function activeCount(now) {
  let count = 0;
  for (const state of overlays.values()) {
    if (now - state.startedAt < state.duration) count++;
  }
  return count;
}

function trigger(state, now, style) {
  if (!state) return;
  const randomness = THREE.MathUtils.clamp(Number(style.pulseStagger) || 0, 0, 1);
  const baseDuration = Math.max(0.12, Number(style.pulseWidth) || DEFAULTS.pulseWidth);
  const durationJitter = 1 + (Math.random() * 2 - 1) * randomness * 0.24;

  state.startedAt = now;
  state.duration = Math.max(0.16, baseDuration * durationJitter);
  state.attack = Math.min(0.11, Math.max(0.045, state.duration * 0.12));
  state.hold = Math.min(0.055, state.duration * 0.07);
  state.peak = THREE.MathUtils.lerp(0.88, 1.16, Math.random() * randomness);
  state.active = true;
}

function smoothstep01(t) {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

function envelope(state, now) {
  const age = now - state.startedAt;
  if (age < 0 || age >= state.duration) {
    state.active = false;
    return 0;
  }

  if (age < state.attack) return smoothstep01(age / state.attack);
  if (age < state.attack + state.hold) return 1;

  const decayStart = state.attack + state.hold;
  const u = THREE.MathUtils.clamp((age - decayStart) / Math.max(0.001, state.duration - decayStart), 0, 1);

  // Fast electric crest with a softer luminous tail — "vroom", not "ommmm".
  return Math.exp(-3.6 * u) * (1 - u);
}

function syncMaterial(material, entry, opacity, widthMultiplier) {
  const style = window.__ADAM_PATH_RIBBON_STYLE;
  if (!style || !material) return;
  material.color.set(style.glowColor);
  material.opacity = THREE.MathUtils.clamp(opacity, 0, 1);
  material.linewidth = Math.max(0.1, style.glowWidth * widthMultiplier);

  const sourceResolution = entry?.inner?.material?.resolution;
  if (sourceResolution) material.resolution.copy(sourceResolution);
}

function updateVisuals(now, style) {
  const enabled = !!style.pulseEnabled && !!style.glowVisible && globalGlowOn();
  const strength = Math.max(0, Number(style.pulseStrength) || 0);

  for (const state of overlays.values()) {
    // The old travelling pulse layer can be re-shown by its own controls; keep
    // it suppressed here because this module is the active pulse mode.
    if (state.entry.pulseSoft) state.entry.pulseSoft.visible = false;
    if (state.entry.pulseCore) state.entry.pulseCore.visible = false;

    const env = enabled ? envelope(state, now) * state.peak : 0;
    const coreOpacity = strength * env;
    const haloOpacity = strength * 0.34 * env;

    state.core.visible = enabled && coreOpacity > 0.0005;
    state.halo.visible = enabled && haloOpacity > 0.0003;
    syncMaterial(state.core.material, state.entry, coreOpacity, 1.28);
    syncMaterial(state.halo.material, state.entry, haloOpacity, Math.max(1.8, style.haloWidth / Math.max(0.1, style.glowWidth)));
  }
}

function updateStatus(style) {
  const status = document.getElementById('pathRibbonStatus');
  if (!status) return;
  status.textContent = `${currentEntries.length} ribbons · independent pulse · ${Number(style.pulseSpeed).toFixed(2)} hits/s · randomness ${Number(style.pulseStagger).toFixed(2)}`;
}

function beforeRender() {
  frames++;
  const pulse = window.__ADAM_PATH_PULSE;
  const style = window.__ADAM_PATH_RIBBON_STYLE;
  const entries = pulse?.entries;
  if (!style || !Array.isArray(entries) || !entries.length) return;

  if (!initialized) {
    configureControls(style);
    buildOverlays(entries);
    initialized = true;
  } else if (entriesChanged(entries)) {
    buildOverlays(entries);
  }

  const now = performance.now() * 0.001;

  if (style.pulseEnabled && style.glowVisible && globalGlowOn() && now >= nextHitAt) {
    if (activeCount(now) < MAX_SIMULTANEOUS) trigger(chooseNextState(), now, style);
    nextHitAt = now + scheduleInterval(style);
  }

  updateVisuals(now, style);

  if (frames - lastStatusFrame > 45) {
    lastStatusFrame = frames;
    updateStatus(style);
  }
}

window.__ADAM_BEFORE_RENDER_HOOKS = window.__ADAM_BEFORE_RENDER_HOOKS || [];
window.__ADAM_BEFORE_RENDER_HOOKS.push(beforeRender);

window.__ADAM_PATH_PULSE_RHYTHM = {
  version:1,
  defaults:DEFAULTS,
  get frames(){ return frames; },
  get overlays(){ return overlays; },
  retrigger(){ nextHitAt = performance.now() * 0.001; }
};
