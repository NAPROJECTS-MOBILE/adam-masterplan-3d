// ADAM calibration motion wrapper — v5.12 / restore Rectangle_7
//
// v5.11 removes only the three proven redundant OUTER b2 duplicate meshes.
// The user-confirmed INNER Rectangle_7 is required and must remain in the
// loaded scene. This wrapper explicitly preserves that exact Object3D across
// the v5.11 setup and forces it back on if anything in the duplicate-removal
// pass detaches or suppresses it.

const V511 = 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@9d4f9074ab195975ac7a4e3516530f53d1158f13/calibrate/spline-motion.js';

export { MOTION_WINDOW, TRACKS, AMBIENT_DRIVERS } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@9d4f9074ab195975ac7a4e3516530f53d1158f13/calibrate/spline-motion.js';
import { createSplineMotion as createV511SplineMotion } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@9d4f9074ab195975ac7a4e3516530f53d1158f13/calibrate/spline-motion.js';

const RECTANGLE_7_PATH = 'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/Rectangle_7';

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

function isDescendantOf(node, ancestor) {
  for (let p = node; p; p = p.parent) if (p === ancestor) return true;
  return false;
}

function forceVisible(node) {
  if (!node) return;
  node.visible = true;
  node.traverse(child => { child.visible = true; });
}

export function createSplineMotion(model, opts = {}) {
  // Capture Rectangle_7 BEFORE any v5.11 duplicate cleanup runs.
  const rectangle7 = findByPath(model, RECTANGLE_7_PATH);
  const originalParent = rectangle7?.parent ?? null;
  const originalLocal = rectangle7 ? {
    position: rectangle7.position.clone(),
    quaternion: rectangle7.quaternion.clone(),
    scale: rectangle7.scale.clone()
  } : null;

  const motion = createV511SplineMotion(model, opts);

  // Rectangle_7 is a retained, user-confirmed block. If it was detached by any
  // runtime cleanup, put THE SAME Object3D back under its original parent. Do
  // not clone it, do not create a second copy, and do not alter the GLB file.
  if (rectangle7 && originalParent && !isDescendantOf(rectangle7, model)) {
    originalParent.add(rectangle7);
    if (originalLocal) {
      rectangle7.position.copy(originalLocal.position);
      rectangle7.quaternion.copy(originalLocal.quaternion);
      rectangle7.scale.copy(originalLocal.scale);
    }
    rectangle7.updateMatrix();
    rectangle7.matrixWorldNeedsUpdate = true;
  }

  forceVisible(rectangle7);
  model.updateMatrixWorld(true);

  // Keep the protection through Reset as well. v5.11's reset does not intend
  // to remove Rectangle_7, but this makes the acceptance rule explicit.
  const baseReset = motion.reset?.bind(motion);
  if (baseReset) {
    motion.reset = () => {
      baseReset();
      if (rectangle7 && originalParent && !isDescendantOf(rectangle7, model)) {
        originalParent.add(rectangle7);
        if (originalLocal) {
          rectangle7.position.copy(originalLocal.position);
          rectangle7.quaternion.copy(originalLocal.quaternion);
          rectangle7.scale.copy(originalLocal.scale);
        }
      }
      forceVisible(rectangle7);
      rectangle7?.updateMatrix();
      if (rectangle7) rectangle7.matrixWorldNeedsUpdate = true;
      model.updateMatrixWorld(true);
    };
  }

  motion.rectangle7Restored = !!rectangle7;

  if (opts.debug) {
    console.group('[ADAM calibration] v5.12 Rectangle_7 restore');
    console.log('base motion source:', V511);
    console.log('Rectangle_7 found:', !!rectangle7);
    console.log('Rectangle_7 path:', rectangle7 ? pathOf(rectangle7) : RECTANGLE_7_PATH);
    console.log('Rectangle_7 visible:', rectangle7?.visible ?? false);
    console.groupEnd();
  }

  return motion;
}
