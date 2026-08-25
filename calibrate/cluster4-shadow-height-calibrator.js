import * as THREE from 'three';

// ADAM calibrator — exact M01–M13 world-space vertical placement
// Raises/lowers ONLY the 13 user-confirmed cluster_4_ meshes whose shadows sit
// too high against their lower edges. Their native edge/glow LineSegments2
// objects are mesh children, so those locked visuals remain aligned.

const TARGET_PATHS = [
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/Rectangle_3',
  'Scene_1/Main_Group/clusters/cluster_4_/building_1/Boolean_1',
  'Scene_1/Main_Group/clusters/cluster_4_/building/Boolean',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/Rectangle_2',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_2',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_3',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_4',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_5',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_6',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_7',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_8',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_9',
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/mesh_6_instance_10'
];

const DEFAULT_OFFSET = 0.20;
const MIN_OFFSET = -2.0;
const MAX_OFFSET = 2.0;
const STEP = 0.02;
const RECEIVER_BASELINE = 0.025;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const tmpWorld = new THREE.Vector3();
const tmpLocal = new THREE.Vector3();

let entries = null;
let offset = DEFAULT_OFFSET;
let uiBound = false;
let receiverBaselineApplied = false;

const $ = id => document.getElementById(id);

function pathOf(object) {
  const parts = [];
  for (let node = object; node; node = node.parent) {
    if (node.name) parts.push(node.name);
  }
  return parts.reverse().join('/');
}

function resolve(scene) {
  scene.updateMatrixWorld(true);
  const byPath = new Map();
  scene.traverse(object => {
    const p = pathOf(object);
    if (TARGET_PATHS.includes(p)) byPath.set(p, object);
  });

  entries = TARGET_PATHS.map(path => {
    const node = byPath.get(path) || null;
    return {
      path,
      node,
      baseWorld: node ? node.getWorldPosition(new THREE.Vector3()) : null
    };
  });

  updateStatus();

  console.info('[ADAM M01-M13 height calibrator V4 WORLD-Y]', {
    offset,
    found: entries.filter(entry => !!entry.node).length,
    total: TARGET_PATHS.length,
    targets: entries.map(entry => ({
      path:entry.path,
      found:!!entry.node,
      baseWorldY:entry.baseWorld?.y ?? null
    }))
  });
}

function ensureControl() {
  if ($('cluster4ShadowHeight')) return;
  const root = $('shadowCtls');
  const receiverCtl = $('shadowReceiverOffset')?.closest?.('.ctl');
  const reset = $('resetShadowBtn');
  if (!root || !reset) return;

  const wrap = document.createElement('div');
  wrap.className = 'ctl';
  wrap.innerHTML = `
    <label>M01–M13 building height<span id="cluster4ShadowHeightV" data-v>+${DEFAULT_OFFSET.toFixed(2)}</span></label>
    <input id="cluster4ShadowHeight" type="range" min="${MIN_OFFSET}" max="${MAX_OFFSET}" step="${STEP}" value="${DEFAULT_OFFSET}">
    <div id="cluster4ShadowHeightStatus" class="scroll-hint">M01–M13 resolving…</div>
  `;
  root.insertBefore(wrap, receiverCtl || reset);
}

function updateReadout() {
  const readout = $('cluster4ShadowHeightV');
  if (readout) readout.textContent = `${offset >= 0 ? '+' : ''}${offset.toFixed(2)}`;
}

function updateStatus() {
  const status = $('cluster4ShadowHeightStatus');
  if (!status) return;
  if (!entries) {
    status.textContent = 'M01–M13 resolving…';
    return;
  }
  const found = entries.filter(entry => !!entry.node).length;
  status.textContent = `M01–M13 targets found ${found}/${TARGET_PATHS.length} · WORLD Y`;
}

function restoreReceiverBaselineOnce() {
  if (receiverBaselineApplied) return;
  const shadow = window.__ADAM_SHADOW_CALIBRATOR;
  if (!shadow?.state) return;

  shadow.state.receiverOffset = RECEIVER_BASELINE;
  const input = $('shadowReceiverOffset');
  if (input) input.value = RECEIVER_BASELINE;
  const readout = $('shadowReceiverOffsetV');
  if (readout) readout.textContent = `+${RECEIVER_BASELINE.toFixed(3)}`;
  receiverBaselineApplied = true;
}

function apply() {
  if (!entries) return;

  for (const entry of entries) {
    const node = entry.node;
    const parent = node?.parent;
    if (!node || !parent || !entry.baseWorld) continue;

    parent.updateWorldMatrix(true, false);
    tmpWorld.copy(entry.baseWorld).addScaledVector(WORLD_UP, offset);
    tmpLocal.copy(tmpWorld);
    parent.worldToLocal(tmpLocal);

    if (node.position.distanceToSquared(tmpLocal) > 1e-12) {
      node.position.copy(tmpLocal);
      node.updateMatrix();
      node.matrixWorldNeedsUpdate = true;
    }
  }

  for (const entry of entries) entry.node?.updateMatrixWorld?.(true);
  updateReadout();
}

function bindUI() {
  if (uiBound) return;
  ensureControl();
  const input = $('cluster4ShadowHeight');
  if (!input) return;
  uiBound = true;
  input.value = offset;
  input.addEventListener('input', () => {
    offset = Number(input.value);
    apply();
  });
  updateReadout();
  updateStatus();
}

function beforeRender(renderer, scene) {
  bindUI();
  restoreReceiverBaselineOnce();

  if (!entries) {
    resolve(scene);
    apply();
    return;
  }

  // Keep exact world-space Y placement authoritative immediately before the
  // native render/shadow pass.
  apply();
}

bindUI();
window.__ADAM_BEFORE_RENDER_HOOKS = window.__ADAM_BEFORE_RENDER_HOOKS || [];
window.__ADAM_BEFORE_RENDER_HOOKS.push(beforeRender);

window.__ADAM_CLUSTER4_SHADOW_HEIGHT = {
  version:4,
  targetPaths:TARGET_PATHS,
  receiverBaseline:RECEIVER_BASELINE,
  get offset(){ return offset; },
  set offset(value){
    offset = Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, Number(value) || 0));
    if ($('cluster4ShadowHeight')) $('cluster4ShadowHeight').value = offset;
    apply();
  },
  get entries(){ return entries; },
  get found(){ return entries?.filter(entry => !!entry.node).length || 0; }
};
