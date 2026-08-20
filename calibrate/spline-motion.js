// ADAM calibration motion wrapper — v5.16 / remove exact lower Rectangle_7 duplicate
//
// The fuller GLB contains an exact co-located mesh twin of the accepted
// Rectangle_7 under the same Group_4. GLTFLoader names that raw duplicate
// `mesh_51_instance_1`. It is the copy that starts lower vertically and rises
// with the b2/b2a hierarchy.
//
// Previous geometry/footprint heuristics were intentionally removed here.
// v5.16 is surgical: physically remove ONLY the exact runtime path
// `.../Group_4/mesh_51_instance_1`, then detach the accepted Rectangle_7 from
// b2a before motion evaluation so the retained block stays visible and static.
// Nothing is hidden, cloned, or disposed. The adjacent instance_2 / instance_3
// blocks are left untouched.

const V512 = 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@272e77fa24efc82aef2ddc3387df975758f8382e/calibrate/spline-motion.js';

export { MOTION_WINDOW, TRACKS, AMBIENT_DRIVERS } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@272e77fa24efc82aef2ddc3387df975758f8382e/calibrate/spline-motion.js';
import { createSplineMotion as createV512SplineMotion } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@272e77fa24efc82aef2ddc3387df975758f8382e/calibrate/spline-motion.js';

const RECTANGLE_7_PATH = 'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/Rectangle_7';
const BAD_RECTANGLE_7_DUPLICATE_PATH = 'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/mesh_51_instance_1';
const CLUSTER_1_PATH = 'Scene_1/Main_Group/clusters/cluster_1';

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

function forceVisible(node) {
  if (!node) return;
  node.visible = true;
  node.traverse(child => { child.visible = true; });
}

function attachToCluster(node, cluster, model) {
  if (!node || !cluster) return false;
  model.updateMatrixWorld(true);
  if (node.parent !== cluster) cluster.attach(node);
  forceVisible(node);
  node.updateMatrix();
  node.matrixWorldNeedsUpdate = true;
  model.updateMatrixWorld(true);
  return true;
}

export function createSplineMotion(model, opts = {}) {
  // Resolve both exact GLB paths BEFORE any motion or re-parenting changes them.
  const rectangle7 = findByPath(model, RECTANGLE_7_PATH);
  const duplicate = findByPath(model, BAD_RECTANGLE_7_DUPLICATE_PATH);
  const cluster1 = findByPath(model, CLUSTER_1_PATH);

  let removedDuplicatePath = null;
  if (duplicate?.parent) {
    removedDuplicatePath = pathOf(duplicate);
    duplicate.parent.remove(duplicate);
    // Deliberately do NOT dispose geometry/material resources: the accepted
    // Rectangle_7 and neighbouring instances may share them.
  }

  // Preserve the accepted Rectangle_7 exactly where it is in world space, but
  // remove it from b2a inheritance before the evaluator can make it rise/collapse.
  const heldBeforeMotion = attachToCluster(rectangle7, cluster1, model);

  // Run the established accepted calibration/motion chain for everything else.
  const motion = createV512SplineMotion(model, opts);

  // Reassert the acceptance rule after setup and reset.
  attachToCluster(rectangle7, cluster1, model);

  const baseReset = motion.reset?.bind(motion);
  if (baseReset) {
    motion.reset = () => {
      baseReset();
      attachToCluster(rectangle7, cluster1, model);
    };
  }

  motion.rectangle7HeldStatic = heldBeforeMotion;
  motion.removedRectangle7Duplicate = removedDuplicatePath;
  motion.rectangle7DuplicateExpectedPath = BAD_RECTANGLE_7_DUPLICATE_PATH;

  if (opts.debug) {
    console.group('[ADAM calibration] v5.16 exact Rectangle_7 cleanup');
    console.log('accepted Rectangle_7 found:', !!rectangle7);
    console.log('exact lower duplicate found:', !!duplicate);
    console.log('physically removed duplicate:', removedDuplicatePath || '(not found)');
    console.log('accepted Rectangle_7 held outside b2a:', heldBeforeMotion);
    console.log('accepted runtime parent:', rectangle7?.parent?.name || '(none)');
    console.groupEnd();
  }

  return motion;
}
