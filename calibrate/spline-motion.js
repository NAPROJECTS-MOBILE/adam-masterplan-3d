// ADAM calibration motion wrapper — v5.11 / remove redundant b2 duplicates
//
// v5.10 identified three exact co-located outer-branch duplicate meshes and
// suppressed them with visible=false. The user explicitly wants unwanted
// duplicate blocks REMOVED, not hidden.
//
// Keep the proven v5.10 motion/hold logic pinned and immutable, then remove
// those three exact redundant Object3D subtrees from the loaded scene graph.
// Their geometry/material resources are intentionally NOT disposed because the
// retained inner copies may share those resources through GLTFLoader cloning.

const V510 = 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@ccd3c76fc531fad0d0a1061fc40585ce90507670/calibrate/spline-motion.js';

export { MOTION_WINDOW, TRACKS, AMBIENT_DRIVERS } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@ccd3c76fc531fad0d0a1061fc40585ce90507670/calibrate/spline-motion.js';
import { createSplineMotion as createV510SplineMotion } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@ccd3c76fc531fad0d0a1061fc40585ce90507670/calibrate/spline-motion.js';

const REMOVE_DUPLICATE_PATHS = [
  'Scene_1/Main_Group/clusters/cluster_1/b2/Rectangle_4_1',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2a_1/Group_4_2/Rectangle_29_2',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2a_1/Group_4_3/Rectangle_29_3'
];

function pathOf(object) {
  const parts = [];
  for (let node = object; node; node = node.parent) {
    if (node.name) parts.push(node.name);
  }
  return parts.reverse().join('/');
}

function findByPath(model, path) {
  let hit = null;
  model.traverse(object => {
    if (!hit && pathOf(object) === path) hit = object;
  });
  return hit;
}

export function createSplineMotion(model, opts = {}) {
  // v5.10 performs all accepted motion, static-hold and calibration work first.
  const motion = createV510SplineMotion(model, opts);

  const removed = [];
  const missing = [];

  // Remove the redundant render copies from the actual scene graph. We do not
  // call geometry.dispose()/material.dispose() because GLTFLoader may share
  // those resources with the retained accepted copies.
  for (const path of REMOVE_DUPLICATE_PATHS) {
    const node = findByPath(model, path);
    if (!node || !node.parent) {
      missing.push(path);
      continue;
    }

    const parent = node.parent;
    parent.remove(node);
    removed.push(path);
  }

  model.updateMatrixWorld(true);

  if (opts.debug) {
    console.group('[ADAM calibration] v5.11 duplicate removal');
    console.log('base motion source:', V510);
    console.log('removed redundant duplicate subtrees:', removed);
    if (missing.length) console.warn('duplicate paths not found for removal:', missing);
    console.groupEnd();
  }

  // Expose the audit result without changing existing app-v2 expectations.
  motion.removedDuplicates = removed;
  motion.missingDuplicateRemovals = missing;
  return motion;
}
