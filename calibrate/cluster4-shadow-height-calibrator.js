// ADAM calibrator — M01/M02/M03 vertical placement
// Raises/lowers only the three confirmed cluster_4_ meshes whose shadows sit
// too high against their lower edges. Their edge/glow LineSegments2 objects are
// mesh children, so they remain perfectly aligned when the mesh moves.

const TARGET_PATHS = [
  'Scene_1/Main_Group/clusters/cluster_4_/Group_2/Rectangle_3',
  'Scene_1/Main_Group/clusters/cluster_4_/building_1/Boolean_1',
  'Scene_1/Main_Group/clusters/cluster_4_/building/Boolean'
];

const DEFAULT_OFFSET = 0.20;
const MIN_OFFSET = -2.0;
const MAX_OFFSET = 2.0;
const STEP = 0.02;

let entries = null;
let offset = DEFAULT_OFFSET;
let uiBound = false;

const $ = id => document.getElementById(id);

function pathOf(object) {
  const parts = [];
  for (let node = object; node; node = node.parent) {
    if (node.name) parts.push(node.name);
  }
  return parts.reverse().join('/');
}

function resolve(scene) {
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
      baseY: node?.position?.y ?? 0
    };
  });

  console.info('[ADAM M01-M03 height calibrator]', {
    offset,
    targets: entries.map(entry => ({ path:entry.path, found:!!entry.node, baseY:entry.baseY }))
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
    <label>M01–M03 building height<span id="cluster4ShadowHeightV" data-v>+${DEFAULT_OFFSET.toFixed(2)}</span></label>
    <input id="cluster4ShadowHeight" type="range" min="${MIN_OFFSET}" max="${MAX_OFFSET}" step="${STEP}" value="${DEFAULT_OFFSET}">
  `;
  root.insertBefore(wrap, receiverCtl || reset);
}

function updateReadout() {
  const readout = $('cluster4ShadowHeightV');
  if (readout) readout.textContent = `${offset >= 0 ? '+' : ''}${offset.toFixed(2)}`;
}

function apply() {
  if (!entries) return;
  let changed = false;
  for (const entry of entries) {
    if (!entry.node) continue;
    const desiredY = entry.baseY + offset;
    if (Math.abs(entry.node.position.y - desiredY) > 1e-7) {
      entry.node.position.y = desiredY;
      entry.node.updateMatrix();
      entry.node.matrixWorldNeedsUpdate = true;
      changed = true;
    }
  }
  if (changed) {
    for (const entry of entries) entry.node?.updateMatrixWorld?.(true);
  }
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
}

function beforeRender(renderer, scene) {
  bindUI();
  if (!entries) {
    resolve(scene);
    apply();
    return;
  }
  // Keep the calibrated Y position authoritative in case another scene helper
  // touches transforms later in the frame.
  apply();
}

bindUI();
window.__ADAM_BEFORE_RENDER_HOOKS = window.__ADAM_BEFORE_RENDER_HOOKS || [];
window.__ADAM_BEFORE_RENDER_HOOKS.push(beforeRender);

window.__ADAM_CLUSTER4_SHADOW_HEIGHT = {
  version:1,
  targetPaths:TARGET_PATHS,
  get offset(){ return offset; },
  set offset(value){
    offset = Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, Number(value) || 0));
    if ($('cluster4ShadowHeight')) $('cluster4ShadowHeight').value = offset;
    apply();
  },
  get entries(){ return entries; }
};
