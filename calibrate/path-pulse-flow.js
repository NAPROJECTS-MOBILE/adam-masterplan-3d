import * as THREE from 'three';

/*
  ADAM path pulse flow V3
  -----------------------
  Runs AFTER path-ribbon-glow.js and only replaces the animated pulse positions.
  The approved base strip edge/glow materials and geometry are untouched.

  Improvements over V2:
  - each actual rail segment has its own phase instead of whole ribbon meshes
    pulsing together;
  - subtle deterministic per-lane speed variation breaks mechanical lockstep;
  - the pulse travels fully off the right edge before recycling fully off the
    left edge, removing the visible wrap/reset snap;
  - performance.now() remains the continuous clock, so motion is frame-rate
    independent and smooth.
*/

const DEFAULTS = {
  speed:0.20,
  width:0.28,
  strength:0.15,
  stagger:0.17
};

const OFF_STRIP_GAP = 0.10;
const SPEED_VARIATION = 0.08; // +/- 8%, deterministic per individual rail

let ready = false;
let startSeconds = performance.now() * 0.001;
let metadata = new Map();
let frames = 0;

function fract(v) {
  return v - Math.floor(v);
}

function hash01(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // A final integer mix avoids obvious correlation between neighbouring names.
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function pulseBuffer(geometry) {
  return geometry?.attributes?.instanceStart?.data || null;
}

function writeSegment(out, offset, segment, t0, t1) {
  const ax = segment[0], ay = segment[1], az = segment[2];
  const bx = segment[3], by = segment[4], bz = segment[5];
  out[offset]     = THREE.MathUtils.lerp(ax, bx, t0);
  out[offset + 1] = THREE.MathUtils.lerp(ay, by, t0);
  out[offset + 2] = THREE.MathUtils.lerp(az, bz, t0);
  out[offset + 3] = THREE.MathUtils.lerp(ax, bx, t1);
  out[offset + 4] = THREE.MathUtils.lerp(ay, by, t1);
  out[offset + 5] = THREE.MathUtils.lerp(az, bz, t1);
}

function buildMetadata(entries) {
  metadata = new Map();

  for (const entry of entries) {
    const path = entry.originalPath || entry.source?.name || 'strip';
    const basePhase = hash01(`${path}:base`);
    const segments = entry.segmentData || [];

    const rails = segments.map((segment, index) => {
      const individuality = hash01(`${path}:rail:${index}`);
      const speedFactor = 1 + (individuality * 2 - 1) * SPEED_VARIATION;

      // Adjacent rails advance by the calibrator stagger, while each ribbon
      // group receives a stable fractional offset so separate meshes don't
      // accidentally line up into one giant synchronized wave.
      const phase = fract(basePhase + index * window.__ADAM_PATH_RIBBON_STYLE.pulseStagger);
      return { phase, speedFactor };
    });

    metadata.set(entry, rails);
  }
}

function applyRecommendedDefaults() {
  const style = window.__ADAM_PATH_RIBBON_STYLE;
  if (!style || style.__adamFlowV3DefaultsApplied) return;

  style.pulseSpeed = DEFAULTS.speed;
  style.pulseWidth = DEFAULTS.width;
  style.pulseStrength = DEFAULTS.strength;
  style.pulseStagger = DEFAULTS.stagger;
  style.__adamFlowV3DefaultsApplied = true;

  const values = [
    ['pathPulseSpeed', 'pathPulseSpeedV', style.pulseSpeed, 2],
    ['pathPulseWidth', 'pathPulseWidthV', style.pulseWidth, 2],
    ['pathPulseStrength', 'pathPulseStrengthV', style.pulseStrength, 3],
    ['pathPulseStagger', 'pathPulseStaggerV', style.pulseStagger, 2]
  ];

  for (const [inputId, valueId, value, digits] of values) {
    const input = document.getElementById(inputId);
    const readout = document.getElementById(valueId);
    if (input) input.value = String(value);
    if (readout) readout.textContent = Number(value).toFixed(digits);
  }
}

function updateEntry(entry, railMeta, elapsed, style) {
  const segments = entry.segmentData || [];
  const softBuffer = pulseBuffer(entry.pulseSoft?.geometry);
  const coreBuffer = pulseBuffer(entry.pulseCore?.geometry);
  const softArray = softBuffer?.array;
  const coreArray = coreBuffer?.array;
  if (!softArray || !coreArray || !segments.length) return;

  const speed = Math.max(0, style.pulseSpeed);
  const softWidth = THREE.MathUtils.clamp(style.pulseWidth, 0.01, 0.95);
  const coreWidth = Math.max(0.012, softWidth * 0.42);

  for (let i = 0; i < segments.length; i++) {
    const meta = railMeta[i] || { phase:0, speedFactor:1 };

    // Travel domain extends beyond both ends. At the instant the phase wraps,
    // the old pulse is already completely beyond x=1 and the new pulse is
    // completely before x=0, so there is no visible teleport on the strip.
    const travelSpan = 1 + softWidth + OFF_STRIP_GAP;
    const progress = fract(elapsed * speed * meta.speedFactor - meta.phase);
    const softHead = -softWidth * 0.5 - OFF_STRIP_GAP * 0.5 + progress * travelSpan;
    const coreHead = softHead;

    const softT0 = THREE.MathUtils.clamp(softHead - softWidth * 0.5, 0, 1);
    const softT1 = THREE.MathUtils.clamp(softHead + softWidth * 0.5, 0, 1);
    const coreT0 = THREE.MathUtils.clamp(coreHead - coreWidth * 0.5, 0, 1);
    const coreT1 = THREE.MathUtils.clamp(coreHead + coreWidth * 0.5, 0, 1);

    writeSegment(softArray, i * 6, segments[i], softT0, softT1);
    writeSegment(coreArray, i * 6, segments[i], coreT0, coreT1);
  }

  softBuffer.needsUpdate = true;
  coreBuffer.needsUpdate = true;
}

function initializeIfReady() {
  const pulse = window.__ADAM_PATH_PULSE;
  const style = window.__ADAM_PATH_RIBBON_STYLE;
  const entries = pulse?.entries;
  if (!style || !Array.isArray(entries) || !entries.length) return false;

  applyRecommendedDefaults();
  buildMetadata(entries);
  startSeconds = performance.now() * 0.001;
  ready = true;

  console.info('[ADAM path pulse flow V3]', {
    ribbons:entries.length,
    individualRails:entries.reduce((n, entry) => n + (entry.segmentData?.length || 0), 0),
    defaults:DEFAULTS,
    speedVariation:SPEED_VARIATION,
    offStripGap:OFF_STRIP_GAP
  });
  return true;
}

function beforeRender() {
  frames++;

  if (!ready && !initializeIfReady()) return;

  const pulse = window.__ADAM_PATH_PULSE;
  const style = window.__ADAM_PATH_RIBBON_STYLE;
  const entries = pulse?.entries;
  if (!style || !Array.isArray(entries) || !entries.length) return;

  // Rebuild metadata if the strip renderer rebuilt its layer array.
  if (metadata.size !== entries.length || entries.some(entry => !metadata.has(entry))) {
    buildMetadata(entries);
  }

  if (!style.pulseEnabled || !style.glowVisible) return;

  const elapsed = performance.now() * 0.001 - startSeconds;
  for (const entry of entries) {
    updateEntry(entry, metadata.get(entry) || [], elapsed, style);
  }
}

window.__ADAM_BEFORE_RENDER_HOOKS = window.__ADAM_BEFORE_RENDER_HOOKS || [];
window.__ADAM_BEFORE_RENDER_HOOKS.push(beforeRender);

window.__ADAM_PATH_PULSE_FLOW = {
  version:3,
  defaults:DEFAULTS,
  get frames(){ return frames; },
  get ready(){ return ready; },
  restart(){
    startSeconds = performance.now() * 0.001;
    const entries = window.__ADAM_PATH_PULSE?.entries || [];
    buildMetadata(entries);
  }
};
