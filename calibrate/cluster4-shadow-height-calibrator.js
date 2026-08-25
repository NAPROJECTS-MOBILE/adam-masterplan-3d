import * as THREE from 'three';

// ADAM calibrator — exact M01–M13 vertical placement V6
// -----------------------------------------------------
// The direct per-node position approach resolved all 13 GLB paths but did not
// produce reliable visible movement through the inherited GLB transforms.
//
// V6 creates one identity wrapper under each ORIGINAL parent, reparents only
// the confirmed M01–M13 meshes beneath those wrappers (identity means their
// current world pose is unchanged), then moves the wrappers by a true world-Y
// offset. Parent-level scene/reveal motion remains inherited exactly as before.
// Native edge/glow LineSegments2 children stay attached to each mesh.

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

const DEFAULT_OFFSET = 0;
const MIN_OFFSET = -30;
const MAX_OFFSET = 30;
const STEP = 0.25;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const tmpOriginWorld = new THREE.Vector3();
const tmpDesiredWorld = new THREE.Vector3();
const tmpDesiredLocal = new THREE.Vector3();
const tmpNodeWorld = new THREE.Vector3();

let entries = null;
let wrappers = [];
let offset = DEFAULT_OFFSET;
let uiBound = false;
let installed = false;
let baselineM01WorldY = null;

const $ = id => document.getElementById(id);

function pathOf(object) {
  const parts = [];
  for (let node = object; node; node = node.parent) {
    if (node.name) parts.push(node.name);
  }
  return parts.reverse().join('/');
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
    <label>M01–M13 building height<span id="cluster4ShadowHeightV" data-v>+0.00</span></label>
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
  let measured = '';
  const m01 = entries[0]?.node;
  if (m01 && baselineM01WorldY != null) {
    m01.getWorldPosition(tmpNodeWorld);
    const delta = tmpNodeWorld.y - baselineM01WorldY;
    measured = ` · M01 measured ΔY ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`;
  }

  status.textContent = `M01–M13 ${found}/${TARGET_PATHS.length} · ${wrappers.length} parent wrappers · WORLD Y${measured}`;
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
    applyOffset();
  });
  updateReadout();
  updateStatus();
}

function install(scene) {
  if (installed) return;

  scene.updateMatrixWorld(true);

  const byPath = new Map();
  scene.traverse(object => {
    const p = pathOf(object);
    if (TARGET_PATHS.includes(p)) byPath.set(p, object);
  });

  entries = TARGET_PATHS.map(path => ({
    path,
    node: byPath.get(path) || null
  }));

  const found = entries.filter(entry => !!entry.node).length;
  if (!found) {
    updateStatus();
    return;
  }

  // Capture a visible proof point before hierarchy changes.
  entries[0]?.node?.getWorldPosition(tmpNodeWorld);
  baselineM01WorldY = entries[0]?.node ? tmpNodeWorld.y : null;

  // Group targets by their original parent. This preserves every parent-level
  // reveal/motion transform while giving us a stable transform handle.
  const parentGroups = new Map();
  for (const entry of entries) {
    const node = entry.node;
    const parent = node?.parent;
    if (!node || !parent) continue;
    if (!parentGroups.has(parent)) parentGroups.set(parent, []);
    parentGroups.get(parent).push(entry);
  }

  wrappers = [];
  let wrapperIndex = 0;
  for (const [parent, groupEntries] of parentGroups) {
    const wrapper = new THREE.Group();
    wrapper.name = `ADAM_M01_M13_HEIGHT_${++wrapperIndex}`;
    wrapper.userData.adamM01M13HeightWrapper = true;
    wrapper.position.set(0, 0, 0);
    wrapper.quaternion.identity();
    wrapper.scale.set(1, 1, 1);
    parent.add(wrapper);

    // The wrapper is identity under the SAME parent, so keeping each mesh's
    // existing local transform preserves its world transform exactly.
    for (const entry of groupEntries) wrapper.add(entry.node);

    wrappers.push({ wrapper, parent, entries:groupEntries });
  }

  scene.updateMatrixWorld(true);
  installed = true;
  applyOffset();

  console.info('[ADAM M01-M13 height calibrator V6 WRAPPERS]', {
    found,
    total:TARGET_PATHS.length,
    wrappers:wrappers.map(item => ({
      wrapper:item.wrapper.name,
      originalParent:item.parent.name,
      targets:item.entries.map(entry => entry.path)
    }))
  });
}

function applyOffset() {
  if (!installed) {
    updateReadout();
    updateStatus();
    return;
  }

  for (const item of wrappers) {
    const { wrapper, parent } = item;

    // Convert a true world-up displacement into this parent's local space.
    parent.updateWorldMatrix(true, false);
    tmpOriginWorld.set(0, 0, 0);
    parent.localToWorld(tmpOriginWorld);
    tmpDesiredWorld.copy(tmpOriginWorld).addScaledVector(WORLD_UP, offset);
    tmpDesiredLocal.copy(tmpDesiredWorld);
    parent.worldToLocal(tmpDesiredLocal);

    wrapper.position.copy(tmpDesiredLocal);
    wrapper.updateMatrix();
    wrapper.matrixWorldNeedsUpdate = true;
  }

  for (const item of wrappers) item.wrapper.updateMatrixWorld(true);
  updateReadout();
  updateStatus();
}

function beforeRender(renderer, scene) {
  bindUI();
  install(scene);
  applyOffset();
}

bindUI();
window.__ADAM_BEFORE_RENDER_HOOKS = window.__ADAM_BEFORE_RENDER_HOOKS || [];
window.__ADAM_BEFORE_RENDER_HOOKS.push(beforeRender);

window.__ADAM_CLUSTER4_SHADOW_HEIGHT = {
  version:6,
  targetPaths:TARGET_PATHS,
  range:[MIN_OFFSET, MAX_OFFSET],
  get offset(){ return offset; },
  set offset(value){
    offset = Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, Number(value) || 0));
    if ($('cluster4ShadowHeight')) $('cluster4ShadowHeight').value = offset;
    applyOffset();
  },
  get entries(){ return entries; },
  get wrappers(){ return wrappers; },
  get found(){ return entries?.filter(entry => !!entry.node).length || 0; }
};
