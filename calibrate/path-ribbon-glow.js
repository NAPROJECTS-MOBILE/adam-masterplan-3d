import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/* ADAM path-ribbon renderer. Main ribbon geometry remains unchanged. */

const PATH_PREFIX = 'Scene_1/Main_Group/paths/';
const DEFAULT_PATH_EDGE_ANGLE = 10;

// Independent strip style, restored to the calibrator. These defaults reproduce
// the current path appearance, so simply loading this revision should not change
// the look until a strip control is moved.
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
  glowVisible:true
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

function railGeometryForMesh(mesh, angle) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, angle);
  const pos = edges.attributes.position;
  if (!pos || pos.count < 2) {
    edges.dispose();
    return { geometry:null, segments:0 };
  }
  const lengthAxis = longestAxisOf(mesh);
  const kept = [];
  for (let i = 0; i + 1 < pos.count; i += 2) {
    const dx = pos.getX(i + 1) - pos.getX(i);
    const dy = pos.getY(i + 1) - pos.getY(i);
    const dz = pos.getZ(i + 1) - pos.getZ(i);
    const d = [Math.abs(dx), Math.abs(dy), Math.abs(dz)];
    const along = d[lengthAxis];
    const across = Math.max(d[(lengthAxis + 1) % 3], d[(lengthAxis + 2) % 3]);
    if (along < across * 0.65) continue;
    kept.push(
      pos.getX(i), pos.getY(i), pos.getZ(i),
      pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)
    );
  }
  edges.dispose();
  if (!kept.length) return { geometry:null, segments:0 };
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(new Float32Array(kept));
  return { geometry, segments:kept.length / 6 };
}

function clearLayers() {
  for (const entry of entries) {
    for (const line of [entry.outer, entry.inner, entry.edge]) {
      line.removeFromParent();
      line.geometry?.dispose?.();
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
    const outer = new LineSegments2(result.geometry, outerMat);
    const inner = new LineSegments2(result.geometry.clone(), innerMat);
    const edge = new LineSegments2(result.geometry.clone(), edgeMaterial);

    for (const line of [outer, inner, edge]) {
      line.userData.adamPathRailLayer = true;
      line.userData.adamPathRailSource = retainedEntry.originalPath;
      line.userData.adamTargetSpurFix = retainedEntry.spurFix;
      line.frustumCulled = false;
    }
    outer.renderOrder = 2;
    inner.renderOrder = 3;
    edge.renderOrder = 4;
    source.add(outer, inner, edge);
    if (retainedEntry.spurFix) hideCompetingDirectLines(source);

    entries.push({
      source, outer, inner, edge,
      segments:result.segments,
      spurFix:retainedEntry.spurFix,
      originalPath:retainedEntry.originalPath
    });
    totalRailSegments += result.segments;
  }
  applyStyle();
  updateStatus();
}

function setResolution() {
  const root = document.querySelector('[data-scene3d]');
  const r = root?.getBoundingClientRect?.();
  const w = Math.max(1, Math.round(r?.width || 1));
  const h = Math.max(1, Math.round(r?.height || 1));
  for (const material of [edgeMaterial, innerGlowMaterial, outerGlowMaterial, spurInnerGlowMaterial, spurOuterGlowMaterial]) {
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
  setResolution();

  const edgesVisible = style.edgesVisible && globalToggleOn('tEdges');
  const glowVisible = style.glowVisible && globalToggleOn('tGlow');
  for (const entry of entries) {
    enforceSourceDepth(entry.source);
    if (entry.spurFix) hideCompetingDirectLines(entry.source);
    entry.edge.visible = edgesVisible;
    entry.inner.visible = glowVisible;
    entry.outer.visible = glowVisible;
  }
}

function updateStatus() {
  const status = document.getElementById('pathRibbonStatus');
  if (!status) return;
  const fixed = entries.filter(entry => entry.spurFix).length;
  status.textContent = `${entries.length}/${retained.length} ribbons · ${fixed}/${SPUR_FIX_PATHS.size} targeted spurs · ${pathAngle()}°`;
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

function bindControls() {
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

  const edgeToggle = document.getElementById('tPathEdges');
  const glowToggle = document.getElementById('tPathGlow');
  edgeToggle?.classList.add('on');
  glowToggle?.classList.add('on');
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

window.__ADAM_PATH_RIBBON_STYLE = style;
window.__ADAM_PATH_RIBBON_REFS = retained;
window.__ADAM_PATH_RAIL_LAYERS = entries;
window.__ADAM_REBUILD_PATH_RAILS = rebuild;
window.__ADAM_SPUR_FIX_PATHS = SPUR_FIX_PATHS;
