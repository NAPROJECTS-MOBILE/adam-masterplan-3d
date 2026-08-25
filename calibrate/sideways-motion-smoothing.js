import * as THREE from 'three';
import './cluster4-shadow-height-calibrator.js?v=m01-m13-height-v3-20260825-0127';

// ADAM calibrator — light temporal smoothing for the two horizontal ambient
// movers only. The authoritative Spline motion still writes the target X each
// RAF; this hook damps the rendered X toward that target immediately before the
// renderer/shadow pass. Y/Z, authored endpoints and every other motion driver
// remain untouched.

const TARGET_PATHS = [
  'Scene_1/Main_Group/clusters/cluster_2/building_2_3',
  'Scene_1/Main_Group/clusters/cluster_2/building_3'
];

const TAU_SECONDS = 0.055;      // deliberately subtle: ~55 ms visual damping
const RESUME_SNAP_SECONDS = 0.12;
const MAX_SNAP_DISTANCE = 18;

let entries = null;
let lastNow = 0;
let frames = 0;

function pathOf(object) {
  const parts = [];
  for (let node = object; node; node = node.parent) {
    if (node.name) parts.push(node.name);
  }
  return parts.reverse().join('/');
}

function resolve(scene) {
  const byPath = new Map();
  scene.traverse(object => {
    const p = pathOf(object);
    if (TARGET_PATHS.includes(p)) byPath.set(p, object);
  });

  entries = TARGET_PATHS.map(path => {
    const node = byPath.get(path) || null;
    return {
      path,
      node,
      smoothX: node?.position?.x ?? 0,
      ready: !!node
    };
  });

  console.info('[ADAM sideways smoothing]', {
    tauMs: TAU_SECONDS * 1000,
    targets: entries.map(e => ({ path:e.path, found:!!e.node }))
  });
}

function beforeRender(renderer, scene) {
  frames++;
  if (!entries) resolve(scene);

  const now = performance.now() * 0.001;
  const dt = lastNow ? Math.max(0, now - lastNow) : 0;
  lastNow = now;

  let changed = false;
  for (const entry of entries || []) {
    const node = entry.node;
    if (!node) continue;

    // spline-motion has already written this frame's authoritative target.
    const targetX = node.position.x;

    if (!entry.ready || dt <= 0 || dt > RESUME_SNAP_SECONDS || Math.abs(targetX - entry.smoothX) > MAX_SNAP_DISTANCE) {
      entry.smoothX = targetX;
      entry.ready = true;
    } else {
      const alpha = 1 - Math.exp(-dt / TAU_SECONDS);
      entry.smoothX = THREE.MathUtils.lerp(entry.smoothX, targetX, alpha);
    }

    if (Math.abs(node.position.x - entry.smoothX) > 1e-7) {
      node.position.x = entry.smoothX;
      node.updateMatrix();
      node.matrixWorldNeedsUpdate = true;
      changed = true;
    }
  }

  if (changed) scene.updateMatrixWorld(true);
}

window.__ADAM_BEFORE_RENDER_HOOKS = window.__ADAM_BEFORE_RENDER_HOOKS || [];
window.__ADAM_BEFORE_RENDER_HOOKS.push(beforeRender);

window.__ADAM_SIDEWAYS_MOTION_SMOOTHING = {
  version:1,
  tauSeconds:TAU_SECONDS,
  targetPaths:TARGET_PATHS,
  get frames(){ return frames; },
  get entries(){ return entries; }
};
