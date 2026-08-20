// ADAM calibration motion wrapper — v5.13 / keep Rectangle_7 present
//
// v5.12 proved that merely setting Rectangle_7.visible=true is not sufficient:
// the mesh can still disappear because it lives below the animated inner b2a
// hierarchy and therefore inherits that parent's translation/scale reveal.
//
// v5.13 fixes the actual cause. BEFORE the existing motion evaluator binds or
// samples b2/b2a, move the exact user-confirmed Rectangle_7 Object3D to
// cluster_1 with Object3D.attach(). attach() preserves its current WORLD pose,
// so no replacement/clone is created and there is no visual jump. From then on
// Rectangle_7 cannot inherit the b2a scale-to-zero/collapse.
//
// The three proven redundant OUTER duplicate meshes are still physically
// removed by the pinned v5.11/v5.12 chain. Rectangle_7 itself is never hidden,
// removed, cloned or disposed.

const V512 = 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@272e77fa24efc82aef2ddc3387df975758f8382e/calibrate/spline-motion.js';

export { MOTION_WINDOW, TRACKS, AMBIENT_DRIVERS } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@272e77fa24efc82aef2ddc3387df975758f8382e/calibrate/spline-motion.js';
import { createSplineMotion as createV512SplineMotion } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@272e77fa24efc82aef2ddc3387df975758f8382e/calibrate/spline-motion.js';

const RECTANGLE_7_PATH = 'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/Rectangle_7';
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
  // IMPORTANT: capture and detach from b2a before any motion code runs.
  const rectangle7 = findByPath(model, RECTANGLE_7_PATH);
  const cluster1 = findByPath(model, CLUSTER_1_PATH);
  const originalSourcePath = rectangle7 ? pathOf(rectangle7) : RECTANGLE_7_PATH;

  const heldBeforeMotion = attachToCluster(rectangle7, cluster1, model);

  // Run the complete accepted v5.12 chain: 53-object ambient map, b2/b2a
  // evaluator, static holds, calibration offsets and physical duplicate removal.
  const motion = createV512SplineMotion(model, opts);

  // v5.12 searches for Rectangle_7 at its original GLB path, so after the
  // intentional pre-bind attach it will not find/re-parent it. Reassert the
  // acceptance rule after setup anyway.
  attachToCluster(rectangle7, cluster1, model);

  const baseReset = motion.reset?.bind(motion);
  if (baseReset) {
    motion.reset = () => {
      baseReset();
      attachToCluster(rectangle7, cluster1, model);
    };
  }

  motion.rectangle7HeldStatic = heldBeforeMotion;
  motion.rectangle7SourcePath = originalSourcePath;

  if (opts.debug) {
    console.group('[ADAM calibration] v5.13 Rectangle_7 hold');
    console.log('base motion source:', V512);
    console.log('Rectangle_7 found at source path:', !!rectangle7);
    console.log('Rectangle_7 source path:', originalSourcePath);
    console.log('Rectangle_7 held outside b2a before motion:', heldBeforeMotion);
    console.log('Rectangle_7 runtime parent:', rectangle7?.parent?.name || '(none)');
    console.log('Rectangle_7 visible:', rectangle7?.visible ?? false);
    console.groupEnd();
  }

  return motion;
}
