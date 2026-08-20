// ADAM calibration motion wrapper — v5.10 + b2 duplicate suppression
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
//
// v5.9 holds five user-identified inner-b2 meshes static during Play Through.
//
// v5.10 follows the duplicate geometry down into the fuller GLB. Binary
// inspection proves three of the large held meshes have exact co-located,
// geometry-identical counterparts in the OUTER b2/b2a branch:
//   inner b2_1/Rectangle_4                  <-> outer b2/Rectangle_4_1
//   inner .../Group_4/Rectangle_29          <-> outer .../Group_4_2/Rectangle_29_2
//   inner .../Group_4_1/Rectangle_29_1      <-> outer .../Group_4_3/Rectangle_29_3
// Their initial world bounds are identical. Once the inner copy is detached
// and held static, those outer copies become visible underneath and continue to
// inherit b2/b2a animation. They are redundant render copies, so v5.10 hides
// ONLY those three exact counterparts. No broad parent/geometry heuristic is
// used and the remaining b2/b2a hierarchy is untouched.

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
const CLUSTER_1_PATH = 'Scene_1/Main_Group/clusters/cluster_1';

// Exact picker targets that must remain visually static through Play Through.
// Rectangle_7 is intentionally NOT included here.
const HOLD_STATIC_PATHS = [
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/Rectangle_4',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4_1/Rectangle_29_1',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/Rectangle_29',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/mesh_51_instance_3',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2_1/b2a/Group_4/mesh_51_instance_2'
];

// Exact co-located OUTER-branch copies found by inspecting the GLB binary.
// These three are not approximations: each counterpart has the same initial
// world bounding box and identical POSITION/NORMAL/UV/index data as the held
// inner mesh it duplicates.
const HIDE_MOVING_DUPLICATE_PATHS = [
  'Scene_1/Main_Group/clusters/cluster_1/b2/Rectangle_4_1',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2a_1/Group_4_2/Rectangle_29_2',
  'Scene_1/Main_Group/clusters/cluster_1/b2/b2a_1/Group_4_3/Rectangle_29_3'
];

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

  // Capture visual-hold targets and their exact redundant outer counterparts
  // BEFORE any re-parenting changes their paths.
  const holdTargets = HOLD_STATIC_PATHS.map(path => ({ path, node: findByPath(model, path) }));
  const duplicateTargets = HIDE_MOVING_DUPLICATE_PATHS.map(path => ({ path, node: findByPath(model, path) }));
  const cluster1 = findByPath(model, CLUSTER_1_PATH);

  // Capture static authored Y values before applying calibration offsets.
  const floor = findByPath(model, FLOOR_PATH);
  const floorBaseY = floor?.position.y ?? null;
  const staticOffsets = STATIC_Y_OFFSETS.map(({ path, amount }) => {
    const node = findByPath(model, path);
    return { path, amount, node, baseY: node?.position.y ?? null };
  });

  // Bind the authoritative Spline drivers first. The core keeps references to
  // the animated b2/b2a parents, so moving selected children out afterward does
  // not disturb the driver bindings.
  const motion = createCoreSplineMotion(model, opts);

  // The outer copies are completely redundant at the accepted static pose.
  // Hide them rather than detach them: this keeps the Spline parent hierarchy
  // intact while preventing a second copy from emerging beneath the held mesh.
  const hiddenDuplicates = [];
  for (const item of duplicateTargets) {
    if (!item.node) {
      if (opts.debug) console.warn('[ADAM calibration] moving duplicate not found:', item.path);
      continue;
    }
    item.node.visible = false;
    item.node.traverse(child => { child.visible = false; });
    hiddenDuplicates.push(item.path);
  }

  // Freeze ONLY the five accepted static meshes against b2/b2a Play Through.
  // Object3D.attach preserves each mesh's current WORLD transform while moving
  // it to cluster_1, so there is no visual jump and no inherited rise/scale.
  const heldStatic = [];
  if (cluster1) {
    model.updateMatrixWorld(true);
    for (const item of holdTargets) {
      if (!item.node) {
        if (opts.debug) console.warn('[ADAM calibration] static b2 hold target not found:', item.path);
        continue;
      }
      cluster1.attach(item.node);
      item.node.updateMatrix();
      item.node.matrixWorldNeedsUpdate = true;
      heldStatic.push(item.path);
    }
    model.updateMatrixWorld(true);
  } else if (opts.debug) {
    console.warn('[ADAM calibration] cluster_1 not found; inner-b2 static hold skipped');
  }

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
      // Core reset does not change visibility, but make the acceptance rule
      // explicit so future changes cannot accidentally revive these copies.
      for (const { node } of duplicateTargets) if (node) node.visible = false;
      model.updateMatrixWorld(true);
    };
  }

  if (boolean12) nudgeY(boolean12, BLOCK_UP);
  applyStaticOffsets();
  model.updateMatrixWorld(true);

  if (opts.debug) {
    console.group('[ADAM calibration] v5.10 fixes');
    console.log('held static through Play Through:', heldStatic);
    console.log('hidden exact moving duplicates:', hiddenDuplicates);
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
