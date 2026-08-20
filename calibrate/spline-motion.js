// ADAM calibration motion wrapper — v5.8 + explicit cluster-1 clearances
//
// v5.4 fixes an important timeline sampling bug in the pinned v5.3 core:
// b2a's first authored key is at Spline t=1.50 with scaleY=0. Before that
// key, Spline should retain the node's base transform. The core sampler was
// instead returning the first key for every earlier time, which flattened the
// b2a geometry into the base plane from t=1.00 through 1.50.
//
// v5.5 lowers the user-identified cluster_1/floor mesh by exactly 2 local units.
// v5.8 keeps cluster_1/b12/Rectangle_9_4 at +2 local Y and raises
// cluster_1/b6/Boolean_9 to +3 local Y.
// All static visual corrections are applied from captured GLB base Y values so
// refresh/reset can never accumulate the offsets.

export { MOTION_WINDOW, TRACKS, AMBIENT_DRIVERS } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@8de5103d184ab80037f788834abe3d748cc50c99/calibrate/spline-motion.js';
import { createSplineMotion as createCoreSplineMotion } from 'https://cdn.jsdelivr.net/gh/NAPROJECTS-MOBILE/adam-masterplan-3d@8de5103d184ab80037f788834abe3d748cc50c99/calibrate/spline-motion.js';

const PAD_DOWN = -2;
const BLOCK_UP = 2;
const FLOOR_DOWN = -2;
const MOTION_START = 1.0;
const MOTION_END = 1.75;
const B2A_FIRST_KEY = 1.5;

const PAD_PATHS = [
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_10',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_2_5',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_3_2'
];

const FLOOR_PATH = 'Scene_1/Main_Group/clusters/cluster_1/floor';

const STATIC_Y_OFFSETS = [
  { path: 'Scene_1/Main_Group/clusters/cluster_1/b6/Boolean_9', amount: 3 },
  { path: 'Scene_1/Main_Group/clusters/cluster_1/b12/Rectangle_9_4', amount: 2 }
];

const B2A_PATHS = [
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2a_1',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a'
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

function setAbsoluteY(node, y) {
  if (!node) return;
  node.position.y = y;
  node.updateMatrix();
  node.matrixWorldNeedsUpdate = true;
}

function captureLocal(node) {
  return node ? {
    position: node.position.clone(),
    quaternion: node.quaternion.clone(),
    scale: node.scale.clone()
  } : null;
}

function restoreLocal(node, base) {
  if (!node || !base) return;
  node.position.copy(base.position);
  node.quaternion.copy(base.quaternion);
  node.scale.copy(base.scale);
  node.updateMatrix();
  node.matrixWorldNeedsUpdate = true;
}

export function createSplineMotion(model, opts = {}) {
  // Capture the GLB/base pose before the core has a chance to sample the first
  // b2a key. These are the values Spline should retain before t=1.50.
  const b2aPreKey = B2A_PATHS.map(path => {
    const node = findByPath(model, path);
    return { path, node, base: captureLocal(node) };
  });

  // Capture static authored Y values before applying calibration offsets.
  const floor = findByPath(model, FLOOR_PATH);
  const floorBaseY = floor?.position.y ?? null;
  const staticOffsets = STATIC_Y_OFFSETS.map(({ path, amount }) => {
    const node = findByPath(model, path);
    return { path, amount, node, baseY: node?.position.y ?? null };
  });

  const motion = createCoreSplineMotion(model, opts);

  // Fix pre-first-key semantics for b2a. The pinned core's sample() returns
  // the first key for t < firstKey, which incorrectly forces scaleY=0 at
  // section entry. Spline retains the base pose until the first authored key.
  const coreSetProgress = motion.setProgress?.bind(motion);
  if (coreSetProgress) {
    motion.setProgress = progress => {
      coreSetProgress(progress);

      const p = Math.max(0, Math.min(1, Number(progress) || 0));
      const splineTime = MOTION_START + p * (MOTION_END - MOTION_START);
      if (splineTime < B2A_FIRST_KEY) {
        for (const { node, base } of b2aPreKey) restoreLocal(node, base);
        model.updateMatrixWorld(true);
      }
    };
  }

  // Existing cluster-2 visual clearances.
  const pads = PAD_PATHS.map(path => ({ path, node: findByPath(model, path) }));
  for (const { path, node } of pads) {
    if (node) nudgeY(node, PAD_DOWN);
    else if (opts.debug) console.warn('[ADAM calibration] pad not found:', path);
  }

  const rectangle19 = findByPath(model, RECTANGLE_19);
  if (rectangle19) nudgeY(rectangle19, BLOCK_UP);
  else if (opts.debug) console.warn('[ADAM calibration] Rectangle_19_1 not found');

  // Static cluster-1 corrections are always set from their captured GLB Y.
  const applyStaticOffsets = () => {
    if (floor && floorBaseY != null) setAbsoluteY(floor, floorBaseY + FLOOR_DOWN);
    for (const { node, baseY, amount } of staticOffsets) {
      if (node && baseY != null) setAbsoluteY(node, baseY + amount);
    }
  };
  applyStaticOffsets();

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
      applyStaticOffsets();
      model.updateMatrixWorld(true);
    };
  }

  if (boolean12) nudgeY(boolean12, BLOCK_UP);
  applyStaticOffsets();
  model.updateMatrixWorld(true);

  if (opts.debug) {
    console.group('[ADAM calibration] v5.8 fixes');
    console.log('b2a pre-key base preserved until Spline t=1.50:',
      b2aPreKey.map(x => ({ path: x.path, found: !!x.node })));
    console.log('pads Y', PAD_DOWN, PAD_PATHS);
    console.log('Rectangle_19_1 Y', BLOCK_UP);
    console.log('Boolean_12 Y', BLOCK_UP, '(after ambient each frame)');
    console.log('cluster_1/floor Y', FLOOR_DOWN,
      floor ? `(base ${floorBaseY} -> ${floorBaseY + FLOOR_DOWN})` : '(not found)');
    console.log('cluster_1 static Y offsets',
      staticOffsets.map(x => ({
        path: x.path,
        amount: x.amount,
        found: !!x.node,
        baseY: x.baseY,
        targetY: x.baseY == null ? null : x.baseY + x.amount
      })));
    console.groupEnd();
  }

  return motion;
}
