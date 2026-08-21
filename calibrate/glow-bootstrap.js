import * as THREE from 'three';
import { FORCE_GLOW_PATHS } from './glow-targets.js?v=72-strip-glow-20260821-0048';

/*
  ADAM native classification bootstrap
  ------------------------------------
  The foreground ribbons are NOT cluster meshes. They live under:

    Scene_1/Main_Group/paths/**

  app-v2 classifies meshes as architectural solids when their measured world Y
  height is >= FLAT_THRESHOLD. The path ribbons are only a few thousandths high,
  so they were falling into `flats` / `pathMeshes` and never entering app-v2's
  proven native edge + glow builder.

  This bootstrap now promotes the real Main_Group/paths meshes through that same
  native builder. It also prevents those wide paths from changing contentBox, so
  camera framing/keyframes remain based on the architecture exactly as before.
*/

const FORCE_MIN_Y = 0.100001;
const PATH_PREFIX = 'Scene_1/Main_Group/paths/';
const FORCE_TAG = Symbol('adam-force-native-classification');
const PATH_TAG = Symbol('adam-native-path-strip');
const matched = new Set();
const matchedPathStrips = new Set();

// These two roof bars are re-parented later by spline-motion.js. Keep the
// historical safeguard so they still enter app-v2's native line builder.
const STATIC_ROOF_GLOW_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/Rectangle_6',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/mesh_50_instance_2'
]);

// Historical five thin cluster meshes. These are not the foreground ribbons,
// but retaining their classification preserves previous architectural fixes.
const CRITICAL_THIN_CLUSTER_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_2_5',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_10',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_3_2',
  'Scene_1/Main_Group/clusters/cluster_1/floor',
  'Scene_1/Main_Group/clusters/cluster_1/b10/Rectangle_9'
]);

const FORCE_CLASSIFY_PATHS = new Set([
  ...FORCE_GLOW_PATHS,
  ...STATIC_ROOF_GLOW_PATHS,
  ...CRITICAL_THIN_CLUSTER_PATHS
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
const originalUnion = THREE.Box3.prototype.union;

THREE.Box3.prototype.setFromObject = function(object, precise) {
  const result = originalSetFromObject.call(this, object, precise);
  const path = object?.isMesh ? pathOf(object) : '';
  const isPathStrip = !!path && path.startsWith(PATH_PREFIX);
  const force = isPathStrip || (!!path && FORCE_CLASSIFY_PATHS.has(path));

  this[FORCE_TAG] = force;
  this[PATH_TAG] = isPathStrip;

  if (isPathStrip) matchedPathStrips.add(path);
  else if (force) matched.add(path);

  return result;
};

THREE.Box3.prototype.getSize = function(target) {
  const result = originalGetSize.call(this, target);
  if (this[FORCE_TAG] && result.y < FORCE_MIN_Y) result.y = FORCE_MIN_Y;
  return result;
};

// app-v2 calls `contentBox.union(b)` for anything classified as a solid. The
// paths are much wider than the architectural content and must NOT silently
// alter the calibrated camera framing. Ignore only Box3 instances produced from
// Main_Group/paths meshes while this bootstrap is active.
THREE.Box3.prototype.union = function(box) {
  if (box?.[PATH_TAG]) return this;
  return originalUnion.call(this, box);
};

try {
  await import('./app-v2.js?v=paths-native-glow-20260821-1320');
} finally {
  THREE.Box3.prototype.setFromObject = originalSetFromObject;
  THREE.Box3.prototype.getSize = originalGetSize;
  THREE.Box3.prototype.union = originalUnion;

  console.info(
    `[ADAM native classification] ${matched.size}/${FORCE_CLASSIFY_PATHS.size} explicit architectural paths ` +
    'were forced through the normal solid/edge/glow pipeline.'
  );

  const missing = [...FORCE_CLASSIFY_PATHS].filter(path => !matched.has(path));
  if (missing.length) console.warn('[ADAM native classification] unresolved explicit paths:', missing);

  console.info(
    `[ADAM native path strips] ${matchedPathStrips.size} Main_Group/paths mesh(es) ` +
    'promoted into app-v2 native edge+glow; excluded from camera contentBox.'
  );

  const thinResolved = [...CRITICAL_THIN_CLUSTER_PATHS].filter(path => matched.has(path));
  console.info(`[ADAM five-face native edge+glow] classification ${thinResolved.length}/5`);

  const roofResolved = [...STATIC_ROOF_GLOW_PATHS].filter(path => matched.has(path));
  console.info(`[ADAM roof glow] native classification ${roofResolved.length}/2`);
}
