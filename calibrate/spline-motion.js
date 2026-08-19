// ADAM calibration motion wrapper — v5.3 + Rectangle_3_2 height nudge
//
// Keep the verified v5.3 motion implementation pinned to its immutable commit,
// then apply this very small visual calibration tweak locally. This avoids
// disturbing any of the 53-object movement mappings while we iterate.

const CORE_URL = 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@8de5103d184ab80037f788834abe3d748cc50c99/calibrate/spline-motion.js';

export { MOTION_WINDOW, TRACKS, AMBIENT_DRIVERS } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@8de5103d184ab80037f788834abe3d748cc50c99/calibrate/spline-motion.js';
import { createSplineMotion as createCoreSplineMotion } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@8de5103d184ab80037f788834abe3d748cc50c99/calibrate/spline-motion.js';

const TARGET = 'Scene_1/Main_Group/clusters/cluster_2/Rectangle_3_2';

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

export function createSplineMotion(model, opts = {}) {
  const motion = createCoreSplineMotion(model, opts);

  // User-requested visual calibration: lower only Rectangle_3_2 by two local
  // source units (roughly the requested ~2 screen-pixel nudge in this view).
  // Its -90deg X levelling from v5.3 is preserved.
  const target = findByPath(model, TARGET);
  if (target) {
    target.position.y -= 2;
    target.updateMatrix();
    target.matrixWorldNeedsUpdate = true;
    model.updateMatrixWorld(true);
    if (opts.debug) console.log('[ADAM calibration] lowered Rectangle_3_2 by 2 local units');
  } else if (opts.debug) {
    console.warn('[ADAM calibration] Rectangle_3_2 not found for -2 height nudge');
  }

  return motion;
}
