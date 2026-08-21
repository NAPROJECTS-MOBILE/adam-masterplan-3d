import * as THREE from 'three';
import { FORCE_GLOW_PATHS } from './glow-targets.js?v=72-strip-glow-20260821-0048';

/* ADAM explicit native classification bootstrap
   ---------------------------------------------
   This bootstrap now applies ONLY to architectural cluster meshes that need to
   enter app-v2's existing building edge/glow pipeline.

   Foreground path ribbons live under Scene_1/Main_Group/paths/** and are no
   longer promoted here. They stay in app-v2's flat/path population and receive
   their own mesh-based ribbon glow from path-ribbon-glow.js, which avoids the
   endpoint blobs caused by EdgesGeometry on ultra-thin ribbons.
*/

const FORCE_MIN_Y = 0.100001;
const FORCE_TAG = Symbol('adam-force-native-classification');
const matched = new Set();

const STATIC_ROOF_GLOW_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/Rectangle_6',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/mesh_50_instance_2'
]);

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
  await import('./app-v2.js?v=path-ribbon-glow-20260821-1336');
} finally {
  THREE.Box3.prototype.setFromObject = originalSetFromObject;
  THREE.Box3.prototype.getSize = originalGetSize;

  console.info(
    `[ADAM native classification] ${matched.size}/${FORCE_CLASSIFY_PATHS.size} explicit architectural paths ` +
    'were forced through the normal building solid/edge/glow pipeline.'
  );

  const missing = [...FORCE_CLASSIFY_PATHS].filter(path => !matched.has(path));
  if (missing.length) console.warn('[ADAM native classification] unresolved explicit paths:', missing);

  const thinResolved = [...CRITICAL_THIN_CLUSTER_PATHS].filter(path => matched.has(path));
  console.info(`[ADAM five-face native edge+glow] classification ${thinResolved.length}/5`);

  const roofResolved = [...STATIC_ROOF_GLOW_PATHS].filter(path => matched.has(path));
  console.info(`[ADAM roof glow] native classification ${roofResolved.length}/2`);
}
