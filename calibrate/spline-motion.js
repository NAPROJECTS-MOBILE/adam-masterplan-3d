import * as THREE from 'three';

// ADAM calibration motion wrapper — v5.3 + exact cluster-2 baseline alignment
//
// Keep the verified v5.3 movement implementation pinned to its immutable
// commit, then apply only the small visual calibration corrections here.

export { MOTION_WINDOW, TRACKS, AMBIENT_DRIVERS } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@8de5103d184ab80037f788834abe3d748cc50c99/calibrate/spline-motion.js';
import { createSplineMotion as createCoreSplineMotion } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@8de5103d184ab80037f788834abe3d748cc50c99/calibrate/spline-motion.js';

const BOOLEAN_12 = 'Scene_1/Main_Group/clusters/cluster_2/building_2_2/Boolean_12';
const BOOLEAN_Y_NUDGE = 2;

// User-confirmed cluster-2 pieces whose lower edges should all share the same
// visual baseline as Boolean_12 at its ambient BASE state.
const ALIGN_BOTTOM_PATHS = [
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_10',
  'Scene_1/Main_Group/clusters/cluster_2/building_2_1/Rectangle_19_1',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_2_5',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_3_2'
];

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

function applyLocalYNudge(node, amount) {
  if (!node) return;
  node.position.y += amount;
  node.updateMatrix();
  node.matrixWorldNeedsUpdate = true;
}

function worldBottom(node) {
  if (!node) return null;
  node.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(node, true);
  return box.isEmpty() ? null : box.min.y;
}

function shiftNodeByWorldY(node, deltaWorldY) {
  if (!node || !node.parent || Math.abs(deltaWorldY) < 1e-9) return;

  node.parent.updateWorldMatrix(true, false);
  node.updateWorldMatrix(true, false);

  const worldOrigin = node.getWorldPosition(new THREE.Vector3());
  worldOrigin.y += deltaWorldY;

  // Convert the desired world-space origin back into the node parent's local
  // coordinates. This works even if the parent has scale/rotation, so the
  // bottom alignment is exact rather than another guessed local-pixel nudge.
  const localOrigin = node.parent.worldToLocal(worldOrigin.clone());
  node.position.copy(localOrigin);
  node.updateMatrix();
  node.matrixWorldNeedsUpdate = true;
}

function alignBottomTo(node, targetWorldY) {
  const current = worldBottom(node);
  if (current == null || targetWorldY == null) return null;
  const delta = targetWorldY - current;
  shiftNodeByWorldY(node, delta);
  node.updateWorldMatrix(true, true);
  return delta;
}

export function createSplineMotion(model, opts = {}) {
  const motion = createCoreSplineMotion(model, opts);
  const boolean12 = findByPath(model, BOOLEAN_12);
  const coreSetAmbientTime = motion.setAmbientTime?.bind(motion);

  // Put Boolean_12 at its authoritative Spline BASE state, then retain the +2
  // local-unit lift that fixed the previously clipped lower glow line.
  if (coreSetAmbientTime) coreSetAmbientTime(0);
  if (boolean12) applyLocalYNudge(boolean12, BOOLEAN_Y_NUDGE);
  model.updateMatrixWorld(true);

  // Use the now-correct Boolean_12 lower edge as the single canonical baseline.
  // This satisfies both requested relationships at once:
  //   Rectangle_10 + Rectangle_19_1 == Boolean_12 bottom
  //   Rectangle_10 + Rectangle_2_5 == Rectangle_3_2 bottom
  // by putting all four static pieces on exactly the same world-Y baseline.
  const baselineY = worldBottom(boolean12);
  const aligned = [];

  for (const path of ALIGN_BOTTOM_PATHS) {
    const node = findByPath(model, path);
    if (!node) {
      if (opts.debug) console.warn('[ADAM calibration] alignment target not found:', path);
      continue;
    }
    const delta = alignBottomTo(node, baselineY);
    aligned.push({ path, deltaWorldY: delta });
  }
  model.updateMatrixWorld(true);

  // Boolean_12 is ambient-driven and its local transform is rewritten each
  // frame. Reapply only its constant +2 calibration after the core animation;
  // the static aligned pieces do NOT follow its animation and remain fixed.
  if (coreSetAmbientTime && boolean12) {
    motion.setAmbientTime = seconds => {
      coreSetAmbientTime(seconds);
      applyLocalYNudge(boolean12, BOOLEAN_Y_NUDGE);
      model.updateMatrixWorld(true);
    };
  }

  const coreReset = motion.reset?.bind(motion);
  if (coreReset) {
    motion.reset = () => {
      coreReset();
      if (coreSetAmbientTime) coreSetAmbientTime(0);
      if (boolean12) applyLocalYNudge(boolean12, BOOLEAN_Y_NUDGE);
      model.updateMatrixWorld(true);
    };
  }

  if (opts.debug) {
    console.group('[ADAM calibration] cluster-2 exact bottom alignment');
    console.log('canonical baseline:', baselineY);
    for (const item of aligned) console.log(item.path, 'world Y delta', item.deltaWorldY);
    console.groupEnd();
  }

  return motion;
}
