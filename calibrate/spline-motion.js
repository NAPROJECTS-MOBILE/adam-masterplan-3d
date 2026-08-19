// ADAM calibration motion wrapper — v5.3 + small height nudges
//
// Keep the verified v5.3 motion implementation pinned to its immutable commit,
// then apply tiny visual calibration tweaks locally without disturbing the
// 53-object movement mappings.

export { MOTION_WINDOW, TRACKS, AMBIENT_DRIVERS } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@8de5103d184ab80037f788834abe3d748cc50c99/calibrate/spline-motion.js';
import { createSplineMotion as createCoreSplineMotion } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@8de5103d184ab80037f788834abe3d748cc50c99/calibrate/spline-motion.js';

const LOWER_RECTANGLE = 'Scene_1/Main_Group/clusters/cluster_2/Rectangle_3_2';
const RAISE_BOOLEAN = 'Scene_1/Main_Group/clusters/cluster_2/building_2_2/Boolean_12';
const RECTANGLE_Y_NUDGE = -2;
const BOOLEAN_Y_NUDGE = 2;

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

function applyYNudge(node, amount) {
  if (!node) return;
  node.position.y += amount;
  node.updateMatrix();
  node.matrixWorldNeedsUpdate = true;
  node.updateMatrixWorld(true);
}

export function createSplineMotion(model, opts = {}) {
  const motion = createCoreSplineMotion(model, opts);

  // Previous user-requested calibration: lower Rectangle_3_2 by two local units.
  // It is static, so this only needs to be applied once.
  const rectangle = findByPath(model, LOWER_RECTANGLE);
  if (rectangle) {
    applyYNudge(rectangle, RECTANGLE_Y_NUDGE);
    if (opts.debug) console.log('[ADAM calibration] Rectangle_3_2 Y -2');
  } else if (opts.debug) {
    console.warn('[ADAM calibration] Rectangle_3_2 not found');
  }

  // Boolean_12 is part of the ambient animation and its core transform is
  // rewritten every frame. Raise it by a constant +2 local units AFTER the
  // authoritative Spline animation has been applied. This preserves its exact
  // motion amplitude/timing while lifting the whole animated block just enough
  // for the lower edge/glow to sit clear of the base plate.
  const boolean12 = findByPath(model, RAISE_BOOLEAN);
  const coreSetAmbientTime = motion.setAmbientTime?.bind(motion);
  if (coreSetAmbientTime && boolean12) {
    motion.setAmbientTime = seconds => {
      coreSetAmbientTime(seconds);
      applyYNudge(boolean12, BOOLEAN_Y_NUDGE);
    };
  }

  const coreReset = motion.reset?.bind(motion);
  if (coreReset && boolean12) {
    motion.reset = () => {
      coreReset();
      applyYNudge(boolean12, BOOLEAN_Y_NUDGE);
      // reset() also restores the static levelled Rectangle_3_2, so reapply its
      // tiny user calibration after a manual reset.
      if (rectangle) applyYNudge(rectangle, RECTANGLE_Y_NUDGE);
    };
  }

  if (boolean12) {
    applyYNudge(boolean12, BOOLEAN_Y_NUDGE);
    if (opts.debug) console.log('[ADAM calibration] Boolean_12 Y +2 after ambient motion');
  } else if (opts.debug) {
    console.warn('[ADAM calibration] Boolean_12 not found');
  }

  model.updateMatrixWorld(true);
  return motion;
}
