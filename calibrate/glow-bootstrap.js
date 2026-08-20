import * as THREE from 'three';
import { FORCE_GLOW_PATHS } from './glow-targets.js?v=67-20260820-1242';

/* ADAM explicit-glow bootstrap */
const FORCE_MIN_Y = 0.100001;
const FORCE_TAG = Symbol('adam-force-native-glow');
const matched = new Set();

// These two roof bars are re-parented later by spline-motion.js. Force them
// through the app's NATIVE solid/edge/glow classification here, before any
// motion code runs, so their glow is guaranteed to be built from the same
// edgeMat/glowMat pipeline as the rest of the architecture.
const STATIC_ROOF_GLOW_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/Rectangle_6',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/mesh_50_instance_2'
]);

const FORCE_CLASSIFY_PATHS = new Set([
  ...FORCE_GLOW_PATHS,
  ...STATIC_ROOF_GLOW_PATHS
]);

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

const originalSetFromObject = THREE.Box3.prototype.setFromObject;
const originalGetSize = THREE.Box3.prototype.getSize;

THREE.Box3.prototype.setFromObject = function(object, precise) {
  const result = originalSetFromObject.call(this, object, precise);
  const path = object?.isMesh ? pathOf(object) : '';
  const force = !!path && FORCE_CLASSIFY_PATHS.has(path);
  this[FORCE_TAG] = force;
  if (force) matched.add(path);
  return result;
};

THREE.Box3.prototype.getSize = function(target) {
  const result = originalGetSize.call(this, target);
  if (this[FORCE_TAG] && result.y < FORCE_MIN_Y) result.y = FORCE_MIN_Y;
  return result;
};

try {
  await import('./app-v2.js?v=keyframe-easing-typed-percent-20260820-1431');
} finally {
  THREE.Box3.prototype.setFromObject = originalSetFromObject;
  THREE.Box3.prototype.getSize = originalGetSize;

  console.info(
    `[ADAM native glow] ${matched.size}/${FORCE_CLASSIFY_PATHS.size} explicit paths ` +
    'were forced through the normal building edge + glow pipeline.'
  );

  const missing = [...FORCE_CLASSIFY_PATHS].filter(path => !matched.has(path));
  if (missing.length) console.warn('[ADAM native glow] unresolved forced paths:', missing);

  const roofResolved = [...STATIC_ROOF_GLOW_PATHS].filter(path => matched.has(path));
  console.info(`[ADAM roof glow] native classification ${roofResolved.length}/2`);
}
