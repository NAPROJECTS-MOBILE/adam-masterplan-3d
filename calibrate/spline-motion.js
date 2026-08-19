// ADAM calibration motion wrapper — v5.3 + explicit cluster-2 clearance
//
// The previous world-bottom alignment was mathematically correct but visually
// negligible because these targets were already within roughly one source unit
// of one another. More importantly, Rectangle_10 / Rectangle_2_5 /
// Rectangle_3_2 are zero-thickness ground-pad meshes, while Rectangle_19_1 and
// Boolean_12 are building geometry. Matching their bounding-box minima is not
// the useful visual constraint. We instead reproduce the successful visible
// clearance treatment directly: pads down 2, building bottoms up 2.

export { MOTION_WINDOW, TRACKS, AMBIENT_DRIVERS } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@8de5103d184ab80037f788834abe3d748cc50c99/calibrate/spline-motion.js';
import { createSplineMotion as createCoreSplineMotion } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@8de5103d184ab80037f788834abe3d748cc50c99/calibrate/spline-motion.js';

const PAD_DOWN = -2;
const BLOCK_UP = 2;

const PAD_PATHS = [
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_10',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_2_5',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_3_2'
];

const RECTANGLE_19 = 'Scene_1/Main_Group/clusters/cluster_2/building_2_1/Rectangle_19_1';
const BOOLEAN_12 = 'Scene_1/Main_Group/clusters/cluster_2/building_2_2/Boolean_12';

function pathOf(o) {
  const parts = [];
  for (let p = o; p; p = p.parent) if (p.name) parts.push(p.name);
  return parts.reverse().join('/');
}

function findByPath(model, path) {
  let hit = null;
  model.traverse(o => {
    if (!hit && pathOf(o) === path) hit = o;
  });
  return hit;
}

function nudgeY(node, amount) {
  if (!node) return;
  node.position.y += amount;
  node.updateMatrix();
  node.matrixWorldNeedsUpdate = true;
}

export function createSplineMotion(model, opts = {}) {
  const motion = createCoreSplineMotion(model, opts);

  // These three meshes are the flat footprint/pad planes directly under the
  // cluster-2 architecture. Drop them by the same explicit two-unit visual
  // clearance requested earlier for Rectangle_3_2. This exposes the lower
  // building edge/glow without changing the buildings' animation.
  const pads = PAD_PATHS.map(path => ({ path, node: findByPath(model, path) }));
  for (const { path, node } of pads) {
    if (node) nudgeY(node, PAD_DOWN);
    else if (opts.debug) console.warn('[ADAM calibration] pad not found:', path);
  }

  // Rectangle_19_1 is actual extruded building geometry, not a ground pad.
  // Give it the same +2 lower-edge clearance treatment that visibly fixed
  // Boolean_12.
  const rectangle19 = findByPath(model, RECTANGLE_19);
  if (rectangle19) nudgeY(rectangle19, BLOCK_UP);
  else if (opts.debug) console.warn('[ADAM calibration] Rectangle_19_1 not found');

  // Boolean_12 is ambient-driven and the core rewrites its transform each RAF,
  // so its +2 must be reapplied after every authoritative Spline update.
  const boolean12 = findByPath(model, BOOLEAN_12);
  const coreSetAmbientTime = motion.setAmbientTime?.bind(motion);
  if (coreSetAmbientTime && boolean12) {
    motion.setAmbientTime = seconds => {
      coreSetAmbientTime(seconds);
      nudgeY(boolean12, BLOCK_UP);
      model.updateMatrixWorld(true);
    };
  }

  const coreReset = motion.reset?.bind(motion);
  if (coreReset) {
    motion.reset = () => {
      coreReset();
      if (boolean12) nudgeY(boolean12, BLOCK_UP);
      model.updateMatrixWorld(true);
    };
  }

  if (boolean12) nudgeY(boolean12, BLOCK_UP);
  model.updateMatrixWorld(true);

  if (opts.debug) {
    console.group('[ADAM calibration] explicit cluster-2 clearance');
    console.log('pads Y', PAD_DOWN, PAD_PATHS);
    console.log('Rectangle_19_1 Y', BLOCK_UP);
    console.log('Boolean_12 Y', BLOCK_UP, '(after ambient each frame)');
    console.groupEnd();
  }

  return motion;
}
