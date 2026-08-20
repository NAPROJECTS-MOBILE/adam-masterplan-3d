import * as THREE from 'three';
import { FORCE_GLOW_PATHS } from './glow-targets.js?v=72-strip-glow-20260821-0048';

/* ADAM explicit native classification bootstrap */
const FORCE_MIN_Y = 0.100001;
const FORCE_TAG = Symbol('adam-force-native-classification');
const matched = new Set();

// These two roof bars are re-parented later by spline-motion.js. Force them
// through the app's NATIVE solid/edge/glow classification here, before any
// motion code runs, so their glow is guaranteed to be built from the same
// edgeMat/glowMat pipeline as the rest of the architecture.
const STATIC_ROOF_GLOW_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/Rectangle_6',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/mesh_50_instance_2'
]);

// These five thin architectural meshes are now also included in
// FORCE_GLOW_PATHS. Keep this set as an explicit classification safeguard so
// they are guaranteed to enter app-v2's native solid edge+glow builder even
// when their measured world-space height is below FLAT_THRESHOLD.
const NATIVE_EDGE_ONLY_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_2_5',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_10',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_3_2',
  'Scene_1/Main_Group/clusters/cluster_1/floor',
  'Scene_1/Main_Group/clusters/cluster_1/b10/Rectangle_9'
]);

const FORCE_CLASSIFY_PATHS = new Set([
  ...FORCE_GLOW_PATHS,
  ...STATIC_ROOF_GLOW_PATHS,
  ...NATIVE_EDGE_ONLY_PATHS
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
  await import('./app-v2.js?v=strip-native-glow-20260821-0048');
} finally {
  THREE.Box3.prototype.setFromObject = originalSetFromObject;
  THREE.Box3.prototype.getSize = originalGetSize;

  console.info(
    `[ADAM native classification] ${matched.size}/${FORCE_CLASSIFY_PATHS.size} explicit paths ` +
    'were forced through the normal building solid/edge/glow pipeline.'
  );

  const missing = [...FORCE_CLASSIFY_PATHS].filter(path => !matched.has(path));
  if (missing.length) console.warn('[ADAM native classification] unresolved forced paths:', missing);

  const stripResolved = [...NATIVE_EDGE_ONLY_PATHS].filter(path => matched.has(path));
  console.info(`[ADAM five-face native edge+glow] classification ${stripResolved.length}/5`);

  const roofResolved = [...STATIC_ROOF_GLOW_PATHS].filter(path => matched.has(path));
  console.info(`[ADAM roof glow] native classification ${roofResolved.length}/2`);
}
