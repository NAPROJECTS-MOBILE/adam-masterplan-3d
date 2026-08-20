// ADAM calibration motion wrapper — v5.17 / static roof bars at final top pose
//
// User-confirmed correction for the two inner-b2 roof bars:
//   - Rectangle_6
//   - mesh_50_instance_2
//
// These are not reveal animation elements. They should already be lying flat on
// the roof, like the accepted Rectangle_14 example, and must never rise during
// Play Through.
//
// The fuller GLB also contains mesh_50_instance_1 exactly co-located with
// Rectangle_6. That is a redundant render copy, so it is PHYSICALLY REMOVED
// (never hidden). Geometry/material resources are not disposed because the
// retained bars share them.
//
// To recover the correct authored roof elevation without guessing a pixel/unit
// offset, v5.17 lets the existing b2/b2a evaluator reach progress=1 once during
// setup, then detaches the two accepted bars at that FINAL world pose. The rest
// of the model is immediately returned to progress=0. From that point onward
// the bars live under static cluster_1 and cannot inherit b2/b2a motion.

const V516 = 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@b8a717f40618b1f6de27b08065014c1a463a8f8d/calibrate/spline-motion.js';

export { MOTION_WINDOW, TRACKS, AMBIENT_DRIVERS } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@b8a717f40618b1f6de27b08065014c1a463a8f8d/calibrate/spline-motion.js';
import { createSplineMotion as createV516SplineMotion } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@b8a717f40618b1f6de27b08065014c1a463a8f8d/calibrate/spline-motion.js';

const CLUSTER_1_PATH = 'Scene_1/Main_Group/clusters/cluster_1';

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

export function createSplineMotion(model, opts = {}) {
  // Resolve exact GLB paths while they still exist in their authored hierarchy.
  const cluster1 = findByPath(model, CLUSTER_1_PATH);
  const roofTargets = STATIC_ROOF_PATHS.map(path => ({
    path,
    node: findByPath(model, path)
  }));
  const duplicate = findByPath(model, BAD_ROOF_DUPLICATE_PATH);

  // Remove the exact redundant mesh_50 copy. Do not hide and do not dispose its
  // shared geometry/material resources.
  let removedDuplicate = null;
  if (duplicate?.parent) {
    removedDuplicate = pathOf(duplicate);
    duplicate.parent.remove(duplicate);
  }

  // Run the accepted v5.16 chain first. This preserves all previous calibration
  // fixes, including the Rectangle_7 duplicate cleanup and static hold.
  const motion = createV516SplineMotion(model, opts);

  // The two roof bars currently inherit the b2/b2a rise. Let that hierarchy
  // reach its intended END pose once, then freeze the actual bars there.
  if (motion.setProgress) motion.setProgress(1);
  model.updateMatrixWorld(true);

  const heldRoof = [];
  for (const target of roofTargets) {
    if (!target.node) {
      if (opts.debug) console.warn('[ADAM calibration] roof target not found:', target.path);
      continue;
    }
    if (attachPreservingWorld(target.node, cluster1, model)) heldRoof.push(target.path);
  }

  // Capture the static final roof poses after detaching them from b2/b2a.
  const roofFinalPoses = roofTargets.map(target => ({
    ...target,
    pose: captureLocal(target.node)
  }));

  // Return the rest of the model to the entry state. The detached roof bars do
  // not move because they are no longer children of the animated hierarchy.
  if (motion.setProgress) motion.setProgress(0);
  for (const target of roofFinalPoses) restoreLocal(target.node, target.pose);
  model.updateMatrixWorld(true);

  // Reset must preserve the accepted static roof pose as well.
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
  motion.removedRoofDuplicate = removedDuplicate;

  if (opts.debug) {
    console.group('[ADAM calibration] v5.17 static roof bars');
    console.log('base motion source:', V516);
    console.log('physically removed duplicate:', removedDuplicate || '(not found)');
    console.log('held permanently at final roof pose:', heldRoof);
    console.log('missing roof targets:', roofTargets.filter(x => !x.node).map(x => x.path));
    console.groupEnd();
  }

  return motion;
}
