// ADAM calibration motion wrapper — v5.14 / remove moving Rectangle_7 twin
//
// v5.13 correctly keeps the accepted Rectangle_7 outside the collapsing inner
// b2a hierarchy. A second copy was still visible underneath and rose upward.
//
// GLB audit of the fuller model shows the accepted Rectangle_7 geometry has one
// exact co-located twin: same shared geometry AND the same initial world matrix.
// Two further instances of that geometry sit beside it at different X positions
// and are legitimate separate blocks, so they must not be removed.
//
// v5.14 therefore removes ONLY an exact same-geometry + same-world-matrix twin
// before any motion evaluator runs, then detaches the retained Rectangle_7 to
// cluster_1 exactly as v5.13 did. Nothing is hidden. Geometry/material resources
// are not disposed because the retained block shares them.

const V512 = 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@272e77fa24efc82aef2ddc3387df975758f8382e/calibrate/spline-motion.js';

export { MOTION_WINDOW, TRACKS, AMBIENT_DRIVERS } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@272e77fa24efc82aef2ddc3387df975758f8382e/calibrate/spline-motion.js';
import { createSplineMotion as createV512SplineMotion } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@272e77fa24efc82aef2ddc3387df975758f8382e/calibrate/spline-motion.js';

const RECTANGLE_7_PATH = 'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/Rectangle_7';
const CLUSTER_1_PATH = 'Scene_1/Main_Group/clusters/cluster_1';
const MATRIX_EPSILON = 1e-7;

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

function sameWorldMatrix(a, b, epsilon = MATRIX_EPSILON) {
  const ae = a?.matrixWorld?.elements;
  const be = b?.matrixWorld?.elements;
  if (!ae || !be || ae.length !== be.length) return false;
  for (let i = 0; i < ae.length; i++) {
    if (Math.abs(ae[i] - be[i]) > epsilon) return false;
  }
  return true;
}

function removeExactRectangle7Twins(model, rectangle7, opts) {
  if (!rectangle7?.isMesh || !rectangle7.geometry) return [];

  model.updateMatrixWorld(true);
  const removed = [];
  const candidates = [];

  model.traverse(object => {
    if (
      object !== rectangle7 &&
      object.isMesh &&
      object.geometry === rectangle7.geometry &&
      sameWorldMatrix(object, rectangle7)
    ) {
      candidates.push(object);
    }
  });

  for (const twin of candidates) {
    if (!twin.parent) continue;
    const twinPath = pathOf(twin);
    twin.parent.remove(twin);
    removed.push(twinPath || twin.name || '(unnamed exact Rectangle_7 twin)');
  }

  model.updateMatrixWorld(true);

  if (opts?.debug) {
    console.log('[ADAM calibration] exact Rectangle_7 twins physically removed:', removed);
  }

  return removed;
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
  // Capture the accepted block while it still has its original GLB path.
  const rectangle7 = findByPath(model, RECTANGLE_7_PATH);
  const cluster1 = findByPath(model, CLUSTER_1_PATH);
  const originalSourcePath = rectangle7 ? pathOf(rectangle7) : RECTANGLE_7_PATH;

  // Remove ONLY the exact co-located same-geometry twin. Nearby parallel copies
  // have different world matrices and therefore survive this test.
  const removedRectangle7Twins = removeExactRectangle7Twins(model, rectangle7, opts);

  // Keep the accepted Rectangle_7 out of b2a before any motion bindings/samples.
  const heldBeforeMotion = attachToCluster(rectangle7, cluster1, model);

  // Run the full accepted v5.12 chain: authored Spline motion, static holds,
  // calibration offsets and the three previously proven duplicate removals.
  const motion = createV512SplineMotion(model, opts);

  // Reassert the retained-block rule after setup and after Reset.
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
  motion.removedRectangle7Twins = removedRectangle7Twins;

  if (opts.debug) {
    console.group('[ADAM calibration] v5.14 Rectangle_7 duplicate cleanup');
    console.log('base motion source:', V512);
    console.log('Rectangle_7 found at source path:', !!rectangle7);
    console.log('Rectangle_7 source path:', originalSourcePath);
    console.log('exact co-located twins removed:', removedRectangle7Twins);
    console.log('Rectangle_7 held outside b2a before motion:', heldBeforeMotion);
    console.log('Rectangle_7 runtime parent:', rectangle7?.parent?.name || '(none)');
    console.log('Rectangle_7 visible:', rectangle7?.visible ?? false);
    console.groupEnd();
  }

  return motion;
}
