import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/*
  ADAM path-ribbon renderer + travelling pulse V2
  ------------------------------------------------
  The approved base strip edge/glow geometry and styling remain unchanged.
  Pulse is a separate pair of moving overlay layers (soft wave + bright core),
  so turning Pulse off returns exactly to the established strip appearance.
*/

const PATH_PREFIX = 'Scene_1/Main_Group/paths/';
const DEFAULT_PATH_EDGE_ANGLE = 10;

const style = {
  edgeColor:'#242424',
  edgeOpacity:0.14,
  edgeWidth:1.0,
  glowColor:'#86bf40',
  glowOpacity:0.076,
  glowWidth:1.96,
  haloOpacity:0.030,
  haloWidth:3.50,
  edgesVisible:true,
  glowVisible:true,

  // Travelling strip pulse. Base glow remains visible beneath this overlay.
  pulseEnabled:true,
  pulseSpeed:0.24,      // sweeps per second
  pulseWidth:0.22,      // fraction of strip length occupied by soft wave
  pulseStrength:0.16,   // bright-core overlay opacity
  pulseStagger:0.09     // phase offset between neighbouring ribbon meshes
};

const SPUR_FIX_PATHS = new Set([
  'Scene_1/Main_Group/Rectangle',
  'Scene_1/Main_Group/paths/path_13_Clones/Clone_1_1/path_13_1',
  'Scene_1/Main_Group/paths/path_13_Clones/Clone_0_1/path_13',
  'Scene_1/Main_Group/paths/path_11',
  'Scene_1/Main_Group/paths/mesh_125_instance_2',
  'Scene_1/Main_Group/paths/path_2',
  'Scene_1/Main_Group/paths/mesh_134_instance_2',
  'Scene_1/Main_Group/paths/mesh_134_instance_3',
  'Scene_1/Main_Group/paths/path_4',
  'Scene_1/Main_Group/paths/mesh_132_instance_2'
]);

const retained = [];
const entries = [];
let initialized = false;
let totalRailSegments = 0;
let pulseStartSeconds = performance.now() * 0.001;
let pulseFrames = 0;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _wa = new THREE.Vector3();
const _wb = new THREE.Vector3();
const _centre = new THREE.Vector3();
const _box = new THREE.Box3();

function makeLineMaterial({ depthBias = false } = {}) {
  const material = new LineMaterial({
    transparent:true,
    depthTest:true,
    depthWrite:false,
    blending:THREE.NormalBlending
  });
  material.toneMapped = false;
  if (depthBias) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = -4;
    material.polygonOffsetUnits = -4;
  }
  return material;
}

const edgeMaterial = makeLineMaterial();
const innerGlowMaterial = makeLineMaterial();
const outerGlowMaterial = makeLineMaterial();
const spurInnerGlowMaterial = makeLineMaterial({ depthBias:true });
const spurOuterGlowMaterial = makeLineMaterial({ depthBias:true });

// Pulse overlays are deliberately separate materials. They brighten the approved
// base glow without changing its colour, opacity, width or blending behaviour.
const pulseCoreMaterial = makeLineMaterial();
const pulseSoftMaterial = makeLineMaterial();
const spurPulseCoreMaterial = makeLineMaterial({ depthBias:true });
const spurPulseSoftMaterial = makeLineMaterial({ depthBias:true });

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

function eachMaterial(mesh, fn) {
  if (Array.isArray(mesh.material)) mesh.material.forEach(fn);
  else if (mesh.material) fn(mesh.material);
}

function enforceSourceDepth(mesh) {
  mesh.renderOrder = 0;
  eachMaterial(mesh, material => {
    material.depthTest = true;
    material.needsUpdate = true;
  });
}

function capture(root) {
  retained.length = 0;
  const foundSpurs = new Set();
  root?.traverse?.(object => {
    if (!object?.isMesh || !object.geometry?.attributes?.position) return;
    const path = pathOf(object);
    const isNormalRibbon = path.startsWith(PATH_PREFIX);
    const isTargetSpur = SPUR_FIX_PATHS.has(path);
    if (!isNormalRibbon && !isTargetSpur) return;
    if (retained.some(entry => entry.mesh === object)) return;
    retained.push({ mesh:object, originalPath:path, spurFix:isTargetSpur });
    if (isTargetSpur) foundSpurs.add(path);
  });
  console.info(`[ADAM path rails] captured ${retained.length} ribbon mesh(es); targeted spurs ${foundSpurs.size}/${SPUR_FIX_PATHS.size}.`);
}

const originalLoadAsync = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function adamCapturePathRails(...args) {
  try {
    const gltf = await originalLoadAsync.apply(this, args);
    capture(gltf?.scene);
    setTimeout(() => waitForControls(), 0);
    return gltf;
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoadAsync;
  }
};

function longestAxisOf(mesh) {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  if (!box) return 0;
  const size = box.getSize(new THREE.Vector3());
  if (size.y >= size.x && size.y >= size.z) return 1;
  if (size.z >= size.x && size.z >= size.y) return 2;
  return 0;
}

function orientSegmentLeftToRight(mesh, values) {
  _a.set(values[0], values[1], values[2]);
  _b.set(values[3], values[4], values[5]);
  _wa.copy(_a);
  _wb.copy(_b);
  mesh.localToWorld(_wa);
  mesh.localToWorld(_wb);

  // Prefer world +X for the requested left-to-right travel. If a segment is
  // almost perpendicular to X, use +Z as the stable plan-space fallback.
  const dx = _wb.x - _wa.x;
  const dz = _wb.z - _wa.z;
  const shouldSwap = Math.abs(dx) >= Math.abs(dz) * 0.2 ? dx < 0 : dz < 0;
  if (!shouldSwap) return values;
  return [values[3], values[4], values[5], values[0], values[1], values[2]];
}

function railGeometryForMesh(mesh, angle) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, angle);
  const pos = edges.attributes.position;
  if (!pos || pos.count < 2) {
    edges.dispose();
    return { geometry:null, segments:0, segmentData:[] };
  }

  mesh.updateWorldMatrix(true, false);
  const lengthAxis = longestAxisOf(mesh);
  const kept = [];
  const segmentData = [];

  for (let i = 0; i + 1 < pos.count; i += 2) {
    const dx = pos.getX(i + 1) - pos.getX(i);
    const dy = pos.getY(i + 1) - pos.getY(i);
    const dz = pos.getZ(i + 1) - pos.getZ(i);
    const d = [Math.abs(dx), Math.abs(dy), Math.abs(dz)];
    const along = d[lengthAxis];
    const across = Math.max(d[(lengthAxis + 1) % 3], d[(lengthAxis + 2) % 3]);
    if (along < across * 0.65) continue;

    const values = orientSegmentLeftToRight(mesh, [
      pos.getX(i), pos.getY(i), pos.getZ(i),
      pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)
    ]);

    kept.push(...values);
    segmentData.push(values);
  }

  edges.dispose();
  if (!kept.length) return { geometry:null, segments:0, segmentData:[] };

  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(new Float32Array(kept));
  return { geometry, segments:kept.length / 6, segmentData };
}

function makePulseGeometry(segmentData) {
  const positions = new Float32Array(Math.max(1, segmentData.length) * 6);
  for (let i = 0; i < segmentData.length; i++) positions.set(segmentData[i], i * 6);
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  return geometry;
}

function pulseBuffer(geometry) {
  return geometry?.attributes?.instanceStart?.data || null;
}

function lerpSegment(out, offset, segment, t0, t1) {
  const ax = segment[0], ay = segment[1], az = segment[2];
  const bx = segment[3], by = segment[4], bz = segment[5];
  out[offset]     = THREE.MathUtils.lerp(ax, bx, t0);
  out[offset + 1] = THREE.MathUtils.lerp(ay, by, t0);
  out[offset + 2] = THREE.MathUtils.lerp(az, bz, t0);
  out[offset + 3] = THREE.MathUtils.lerp(ax, bx, t1);
  out[offset + 4] = THREE.MathUtils.lerp(ay, by, t1);
  out[offset + 5] = THREE.MathUtils.lerp(az, bz, t1);
}

function updatePulseGeometry(geometry, segmentData, head, width) {
  const buffer = pulseBuffer(geometry);
  const array = buffer?.array;
  if (!array || !segmentData.length) return;

  const half = Math.max(0.001, width * 0.5);
  const t0 = THREE.MathUtils.clamp(head - half, 0, 1);
  const t1 = THREE.MathUtils.clamp(head + half, 0, 1);

  for (let i = 0; i < segmentData.length; i++) {
    lerpSegment(array, i * 6, segmentData[i], t0, t1);
  }
  buffer.needsUpdate = true;
}

function clearLayers() {
  for (const entry of entries) {
    for (const line of [entry.pulseSoft, entry.pulseCore, entry.outer, entry.inner, entry.edge]) {
      line?.removeFromParent?.();
      line?.geometry?.dispose?.();
    }
  }
  entries.length = 0;
  totalRailSegments = 0;
}

function pathAngle() {
  const value = Number(document.getElementById('pathEdgeAngle')?.value);
  return Number.isFinite(value) ? value : DEFAULT_PATH_EDGE_ANGLE;
}

function hideCompetingDirectLines(source) {
  for (const child of source.children) {
    if (!child?.isLineSegments2 || child.userData?.adamPathRailLayer) continue;
    child.visible = false;
  }
}

function assignPulseOrder() {
  const sortable = entries.map(entry => {
    _box.setFromObject(entry.source);
    _box.getCenter(_centre);
    return { entry, x:_centre.x, z:_centre.z };
  });

  // Grouping by plan-space Z then X gives neighbouring parallel ribbons a
  // predictable sequential phase instead of depending on GLB traversal order.
  sortable.sort((a, b) => Math.abs(a.z - b.z) > 0.01 ? a.z - b.z : a.x - b.x);
  sortable.forEach((item, index) => { item.entry.pulseOrder = index; });
}

function rebuild() {
  const angle = pathAngle();
  clearLayers();

  for (const retainedEntry of retained) {
    const source = retainedEntry.mesh;
    if (!source?.parent || !source.geometry?.attributes?.position) continue;
    enforceSourceDepth(source);
    const result = railGeometryForMesh(source, angle);
    if (!result.geometry) continue;

    const outerMat = retainedEntry.spurFix ? spurOuterGlowMaterial : outerGlowMaterial;
    const innerMat = retainedEntry.spurFix ? spurInnerGlowMaterial : innerGlowMaterial;
    const pulseCoreMat = retainedEntry.spurFix ? spurPulseCoreMaterial : pulseCoreMaterial;
    const pulseSoftMat = retainedEntry.spurFix ? spurPulseSoftMaterial : pulseSoftMaterial;

    const outer = new LineSegments2(result.geometry, outerMat);
    const inner = new LineSegments2(result.geometry.clone(), innerMat);
    const edge = new LineSegments2(result.geometry.clone(), edgeMaterial);
    const pulseSoft = new LineSegments2(makePulseGeometry(result.segmentData), pulseSoftMat);
    const pulseCore = new LineSegments2(makePulseGeometry(result.segmentData), pulseCoreMat);

    for (const line of [outer, inner, edge, pulseSoft, pulseCore]) {
      line.userData.adamPathRailLayer = true;
      line.userData.adamPathRailSource = retainedEntry.originalPath;
      line.userData.adamTargetSpurFix = retainedEntry.spurFix;
      line.frustumCulled = false;
    }
    pulseSoft.userData.adamPathPulseLayer = 'soft';
    pulseCore.userData.adamPathPulseLayer = 'core';

    outer.renderOrder = 2;
    inner.renderOrder = 3;
    pulseSoft.renderOrder = 3.2;
    pulseCore.renderOrder = 3.4;
    edge.renderOrder = 4;

    source.add(outer, inner, pulseSoft, pulseCore, edge);
    if (retainedEntry.spurFix) hideCompetingDirectLines(source);

    entries.push({
      source, outer, inner, edge, pulseSoft, pulseCore,
      segmentData:result.segmentData,
      segments:result.segments,
      pulseOrder:entries.length,
      spurFix:retainedEntry.spurFix,
      originalPath:retainedEntry.originalPath
    });
    totalRailSegments += result.segments;
  }

  assignPulseOrder();
  pulseStartSeconds = performance.now() * 0.001;
  applyStyle();
  updatePulse(performance.now() * 0.001);
  updateStatus();
}

function setResolution() {
  const root = document.querySelector('[data-scene3d]');
  const r = root?.getBoundingClientRect?.();
  const w = Math.max(1, Math.round(r?.width || 1));
  const h = Math.max(1, Math.round(r?.height || 1));
  for (const material of [
    edgeMaterial,
    innerGlowMaterial, outerGlowMaterial,
    spurInnerGlowMaterial, spurOuterGlowMaterial,
    pulseCoreMaterial, pulseSoftMaterial,
    spurPulseCoreMaterial, spurPulseSoftMaterial
  ]) {
    material.resolution.set(w, h);
  }
}

function syncGlowMaterial(material, opacity, width) {
  material.depthTest = true;
  material.depthWrite = false;
  material.color.set(style.glowColor);
  material.opacity = THREE.MathUtils.clamp(opacity, 0, 1);
  material.linewidth = Math.max(0.1, width);
}

function syncPulseMaterials() {
  // Soft layer is longer, wider and lower-opacity; core is shorter/brighter.
  // Together they read as a travelling glow wave rather than a hard dash.
  syncGlowMaterial(pulseSoftMaterial, style.pulseStrength * 0.34, Math.max(style.haloWidth, style.glowWidth * 1.6));
  syncGlowMaterial(spurPulseSoftMaterial, style.pulseStrength * 0.34, Math.max(style.haloWidth, style.glowWidth * 1.6));
  syncGlowMaterial(pulseCoreMaterial, style.pulseStrength, style.glowWidth * 1.20);
  syncGlowMaterial(spurPulseCoreMaterial, style.pulseStrength, style.glowWidth * 1.20);
}

function globalToggleOn(id) {
  const button = document.getElementById(id);
  return button ? button.classList.contains('on') : true;
}

function applyStyle() {
  edgeMaterial.depthTest = true;
  edgeMaterial.depthWrite = false;
  edgeMaterial.color.set(style.edgeColor);
  edgeMaterial.opacity = THREE.MathUtils.clamp(style.edgeOpacity, 0, 1);
  edgeMaterial.linewidth = Math.max(0.1, style.edgeWidth);

  syncGlowMaterial(innerGlowMaterial, style.glowOpacity, style.glowWidth);
  syncGlowMaterial(spurInnerGlowMaterial, style.glowOpacity, style.glowWidth);
  syncGlowMaterial(outerGlowMaterial, style.haloOpacity, style.haloWidth);
  syncGlowMaterial(spurOuterGlowMaterial, style.haloOpacity, style.haloWidth);
  syncPulseMaterials();
  setResolution();

  const edgesVisible = style.edgesVisible && globalToggleOn('tEdges');
  const glowVisible = style.glowVisible && globalToggleOn('tGlow');
  const pulseVisible = glowVisible && style.pulseEnabled && style.pulseStrength > 0;

  for (const entry of entries) {
    enforceSourceDepth(entry.source);
    if (entry.spurFix) hideCompetingDirectLines(entry.source);
    entry.edge.visible = edgesVisible;
    entry.inner.visible = glowVisible;
    entry.outer.visible = glowVisible;
    entry.pulseSoft.visible = pulseVisible;
    entry.pulseCore.visible = pulseVisible;
  }
}

function fract(value) {
  return value - Math.floor(value);
}

function updatePulse(nowSeconds = performance.now() * 0.001) {
  pulseFrames++;
  if (!style.pulseEnabled || !style.glowVisible || !globalToggleOn('tGlow')) return;

  const elapsed = nowSeconds - pulseStartSeconds;
  const speed = Math.max(0, style.pulseSpeed);
  const softWidth = THREE.MathUtils.clamp(style.pulseWidth, 0.01, 0.95);
  const coreWidth = Math.max(0.012, softWidth * 0.42);

  for (const entry of entries) {
    const phase = entry.pulseOrder * style.pulseStagger;
    const head = fract(elapsed * speed - phase);
    updatePulseGeometry(entry.pulseSoft.geometry, entry.segmentData, head, softWidth);
    updatePulseGeometry(entry.pulseCore.geometry, entry.segmentData, head, coreWidth);
  }
}

function updateStatus() {
  const status = document.getElementById('pathRibbonStatus');
  if (!status) return;
  const fixed = entries.filter(entry => entry.spurFix).length;
  const pulse = style.pulseEnabled ? `pulse ${style.pulseSpeed.toFixed(2)}/s` : 'pulse off';
  status.textContent = `${entries.length}/${retained.length} ribbons · ${fixed}/${SPUR_FIX_PATHS.size} targeted spurs · ${pathAngle()}° · ${pulse}`;
}

function bindRange(id, key, digits = 2, suffix = '') {
  const input = document.getElementById(id);
  const value = document.getElementById(`${id}V`);
  if (!input) return;
  input.value = String(style[key]);
  const paint = () => {
    if (value) value.textContent = `${Number(input.value).toFixed(digits)}${suffix}`;
  };
  input.addEventListener('input', () => {
    style[key] = Number(input.value);
    paint();
    applyStyle();
    updatePulse(performance.now() * 0.001);
    updateStatus();
  });
  paint();
}

function bindColor(id, key) {
  const input = document.getElementById(id);
  if (!input) return;
  input.value = style[key];
  input.addEventListener('input', () => {
    style[key] = input.value;
    applyStyle();
  });
}

function ensurePulseControls() {
  if (document.getElementById('pathPulseSpeed')) return;
  const copyButton = document.getElementById('copyPathStyleBtn');
  if (!copyButton?.parentNode) return;

  const fragment = document.createDocumentFragment();
  const holder = document.createElement('div');
  holder.innerHTML = `
    <div class="row tog"><button id="tPathPulse" class="on">Pulse wave</button></div>
    <div class="ctl"><label>Pulse speed (sweeps/sec)<span id="pathPulseSpeedV" data-v>0.24</span></label><input id="pathPulseSpeed" type="range" min="0.02" max="1.00" step="0.01" value="0.24"></div>
    <div class="ctl"><label>Pulse width<span id="pathPulseWidthV" data-v>0.22</span></label><input id="pathPulseWidth" type="range" min="0.04" max="0.70" step="0.01" value="0.22"></div>
    <div class="ctl"><label>Pulse strength<span id="pathPulseStrengthV" data-v>0.160</span></label><input id="pathPulseStrength" type="range" min="0" max="0.50" step="0.005" value="0.16"></div>
    <div class="ctl"><label>Strip wave stagger<span id="pathPulseStaggerV" data-v>0.09</span></label><input id="pathPulseStagger" type="range" min="0" max="0.50" step="0.01" value="0.09"></div>
  `;
  while (holder.firstChild) fragment.appendChild(holder.firstChild);
  copyButton.parentNode.insertBefore(fragment, copyButton);
}

function bindControls() {
  ensurePulseControls();

  const angleInput = document.getElementById('pathEdgeAngle');
  const angleValue = document.getElementById('pathEdgeAngleV');
  if (angleInput) {
    const paint = () => { if (angleValue) angleValue.textContent = `${Number(angleInput.value).toFixed(0)}°`; };
    angleInput.addEventListener('input', () => { paint(); rebuild(); });
    paint();
  }

  bindColor('pathEdgeColor', 'edgeColor');
  bindRange('pathEdgeOpacity', 'edgeOpacity');
  bindRange('pathEdgeWidth', 'edgeWidth');
  bindColor('pathGlowColor', 'glowColor');
  bindRange('pathGlowOpacity', 'glowOpacity', 3);
  bindRange('pathGlowWidth', 'glowWidth');
  bindRange('pathHaloOpacity', 'haloOpacity', 3);
  bindRange('pathHaloWidth', 'haloWidth');

  bindRange('pathPulseSpeed', 'pulseSpeed', 2);
  bindRange('pathPulseWidth', 'pulseWidth', 2);
  bindRange('pathPulseStrength', 'pulseStrength', 3);
  bindRange('pathPulseStagger', 'pulseStagger', 2);

  const edgeToggle = document.getElementById('tPathEdges');
  const glowToggle = document.getElementById('tPathGlow');
  const pulseToggle = document.getElementById('tPathPulse');

  edgeToggle?.classList.add('on');
  glowToggle?.classList.add('on');
  pulseToggle?.classList.toggle('on', style.pulseEnabled);

  edgeToggle?.addEventListener('click', () => {
    style.edgesVisible = !style.edgesVisible;
    edgeToggle.classList.toggle('on', style.edgesVisible);
    applyStyle();
  });
  glowToggle?.addEventListener('click', () => {
    style.glowVisible = !style.glowVisible;
    glowToggle.classList.toggle('on', style.glowVisible);
    applyStyle();
  });
  pulseToggle?.addEventListener('click', () => {
    style.pulseEnabled = !style.pulseEnabled;
    pulseToggle.classList.toggle('on', style.pulseEnabled);
    pulseStartSeconds = performance.now() * 0.001;
    applyStyle();
    updateStatus();
  });

  document.getElementById('copyPathStyleBtn')?.addEventListener('click', async () => {
    const out = `const STRIP_STYLE = ${JSON.stringify(style, null, 2)};`;
    try { await navigator.clipboard.writeText(out); }
    catch { console.info(out); }
  });

  for (const id of ['tEdges', 'tGlow', 'resetBtn']) {
    document.getElementById(id)?.addEventListener('click', () => requestAnimationFrame(applyStyle));
  }

  const root = document.querySelector('[data-scene3d]');
  if (root && 'ResizeObserver' in window) new ResizeObserver(setResolution).observe(root);
}

function initialize() {
  if (initialized) return;
  initialized = true;
  bindControls();
  rebuild();
}

let waitFrames = 0;
function waitForControls() {
  const ready = document.getElementById('pathEdgeColor') && document.getElementById('tEdges') && document.getElementById('tGlow');
  if (ready) return initialize();
  if (waitFrames++ < 240) requestAnimationFrame(waitForControls);
  else console.warn('[ADAM path rails] strip controls never became ready.');
}

// Use the proven explicit renderer bridge so pulse geometry is updated directly
// before the native render. This avoids a separate animation loop drifting one
// frame behind the scene.
function beforeRender() {
  if (!initialized) return;
  updatePulse(performance.now() * 0.001);
}
window.__ADAM_BEFORE_RENDER_HOOKS = window.__ADAM_BEFORE_RENDER_HOOKS || [];
window.__ADAM_BEFORE_RENDER_HOOKS.push(beforeRender);

window.__ADAM_PATH_RIBBON_STYLE = style;
window.__ADAM_PATH_RIBBON_REFS = retained;
window.__ADAM_PATH_RAIL_LAYERS = entries;
window.__ADAM_REBUILD_PATH_RAILS = rebuild;
window.__ADAM_SPUR_FIX_PATHS = SPUR_FIX_PATHS;
window.__ADAM_PATH_PULSE = {
  version:2,
  style,
  get frames(){ return pulseFrames; },
  get entries(){ return entries; },
  restart(){ pulseStartSeconds = performance.now() * 0.001; }
};
