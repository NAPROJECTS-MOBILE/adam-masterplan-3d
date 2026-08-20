// ADAM calibration motion wrapper — v5.21 / static roof bars +26 Y
//
// User-confirmed correction for the two inner-b2 roof bars:
//   - Rectangle_6
//   - mesh_50_instance_2
//
// They remain permanently static at the accepted final/top roof pose from v5.17,
// and are now raised a total +26 local Y units after being detached to
// cluster_1 (+23 previously, plus an additional +3 requested now). This offset
// is captured into their static pose, so Play Through and Reset cannot make it
// accumulate or animate.
//
// The redundant mesh_50_instance_1 copy is still PHYSICALLY REMOVED (never
// hidden). Geometry/material resources are not disposed because retained bars
// may share them.

const V516 = 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@b8a717f40618b1f6de27b08065014c1a463a8f8d/calibrate/spline-motion.js';

export { MOTION_WINDOW, TRACKS, AMBIENT_DRIVERS } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@b8a717f40618b1f6de27b08065014c1a463a8f8d/calibrate/spline-motion.js';
import { createSplineMotion as createV516SplineMotion } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@b8a717f40618b1f6de27b08065014c1a463a8f8d/calibrate/spline-motion.js';

const CLUSTER_1_PATH = 'Scene_1/Main_Group/clusters/cluster_1';
const ROOF_UP_Y = 26;

const STATIC_ROOF_PATHS = [
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/Rectangle_6',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/mesh_50_instance_2'
];

const BAD_ROOF_DUPLICATE_PATH =
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/mesh_50_instance_1';

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

function attachPreservingWorld(node, parent, model) {
  if (!node || !parent) return false;
  model.updateMatrixWorld(true);
  if (node.parent !== parent) parent.attach(node);
  forceVisible(node);
  node.updateMatrix();
  node.matrixWorldNeedsUpdate = true;
  model.updateMatrixWorld(true);
  return true;
}

function captureLocal(node) {
  return node ? {
    position: node.position.clone(),
    quaternion: node.quaternion.clone(),
    scale: node.scale.clone()
  } : null;
}

function restoreLocal(node, pose) {
  if (!node || !pose) return;
  node.position.copy(pose.position);
  node.quaternion.copy(pose.quaternion);
  node.scale.copy(pose.scale);
  forceVisible(node);
  node.updateMatrix();
  node.matrixWorldNeedsUpdate = true;
}

function raiseLocalY(node, amount) {
  if (!node) return;
  node.position.y += amount;
  node.updateMatrix();
  node.matrixWorldNeedsUpdate = true;
}

export function createSplineMotion(model, opts = {}) {
  const cluster1 = findByPath(model, CLUSTER_1_PATH);
  const roofTargets = STATIC_ROOF_PATHS.map(path => ({
    path,
    node: findByPath(model, path)
  }));
  const duplicate = findByPath(model, BAD_ROOF_DUPLICATE_PATH);

  let removedDuplicate = null;
  if (duplicate?.parent) {
    removedDuplicate = pathOf(duplicate);
    duplicate.parent.remove(duplicate);
  }

  const motion = createV516SplineMotion(model, opts);

  if (motion.setProgress) motion.setProgress(1);
  model.updateMatrixWorld(true);

  const heldRoof = [];
  for (const target of roofTargets) {
    if (!target.node) {
      if (opts.debug) console.warn('[ADAM calibration] roof target not found:', target.path);
      continue;
    }
    if (attachPreservingWorld(target.node, cluster1, model)) {
      raiseLocalY(target.node, ROOF_UP_Y);
      heldRoof.push(target.path);
    }
  }
  model.updateMatrixWorld(true);

  const roofFinalPoses = roofTargets.map(target => ({
    ...target,
    pose: captureLocal(target.node)
  }));

  if (motion.setProgress) motion.setProgress(0);
  for (const target of roofFinalPoses) restoreLocal(target.node, target.pose);
  model.updateMatrixWorld(true);

  const baseReset = motion.reset?.bind(motion);
  if (baseReset) {
    motion.reset = () => {
      baseReset();
      for (const target of roofFinalPoses) {
        attachPreservingWorld(target.node, cluster1, model);
        restoreLocal(target.node, target.pose);
      }
      model.updateMatrixWorld(true);
    };
  }

  motion.staticRoofBars = heldRoof;
  motion.staticRoofYOffset = ROOF_UP_Y;
  motion.removedRoofDuplicate = removedDuplicate;

  if (opts.debug) {
    console.group('[ADAM calibration] v5.21 static roof bars');
    console.log('base motion source:', V516);
    console.log('physically removed duplicate:', removedDuplicate || '(not found)');
    console.log('held permanently at final roof pose:', heldRoof);
    console.log('total static roof Y offset:', ROOF_UP_Y);
    console.log('missing roof targets:', roofTargets.filter(x => !x.node).map(x => x.path));
    console.groupEnd();
  }

  return motion;
}
