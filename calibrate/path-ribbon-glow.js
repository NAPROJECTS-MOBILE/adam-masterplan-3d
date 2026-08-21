import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/*
  ADAM path-ribbon edge + glow
  ----------------------------
  The working main ribbon treatment stays unchanged.

  Ten directly-identified spur meshes need a tiny world-up rail lift so their
  fat glow fragments do not lose the depth test against the coplanar site plate.
  This is intentionally applied ONLY to those exact GLB paths.
*/

const PATH_PREFIX = 'Scene_1/Main_Group/paths/';
const DEFAULT_PATH_EDGE_ANGLE = 10;
const INNER_GLOW_SCALE = 0.28;
const OUTER_GLOW_SCALE = 0.50;
const INNER_GLOW_MIN = 1.5;
const INNER_GLOW_MAX = 2.5;
const OUTER_GLOW_MIN = 2.4;
const OUTER_GLOW_MAX = 4.0;
const SPUR_WORLD_LIFT = 0.003;

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

const edgeMaterial = new LineMaterial({
  transparent:true,
  depthTest:true,
  depthWrite:false,
  blending:THREE.NormalBlending
});
edgeMaterial.toneMapped = false;

const innerGlowMaterial = new LineMaterial({
  transparent:true,
  depthTest:true,
  depthWrite:false,
  blending:THREE.NormalBlending
});
innerGlowMaterial.toneMapped = false;

const outerGlowMaterial = new LineMaterial({
  transparent:true,
  depthTest:true,
  depthWrite:false,
  blending:THREE.NormalBlending
});
outerGlowMaterial.toneMapped = false;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

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

    retained.push({
      mesh:object,
      originalPath:path,
      spurFix:isTargetSpur
    });
    if (isTargetSpur) foundSpurs.add(path);
  });

  console.info(
    `[ADAM path rails] captured ${retained.length} ribbon mesh(es); ` +
    `target spurs ${foundSpurs.size}/${SPUR_FIX_PATHS.size}.`
  );
}

// Capture exact references before app-v2 classifies/reparents anything.
const originalLoadAsync = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function adamCapturePathRails(...args) {
  try {
    const gltf = await originalLoadAsync.apply(this, args);
    capture(gltf?.scene);
    setTimeout(() => waitForAppControls(), 0);
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
  const input = document.getElementById('pathEdgeAngle');
  const value = Number(input?.value);
  return Number.isFinite(value) ? value : DEFAULT_PATH_EDGE_ANGLE;
}

// Convert a tiny world-Y lift into the source mesh's local coordinates so the
// fix remains correct for rotated/scaled clone nodes while staying parented to
// the real ribbon mesh and following all existing motion.
function localOffsetForWorldLift(source, amount) {
  source.updateWorldMatrix(true, false);
  const inverse = source.matrixWorld.clone().invert();
  const a = new THREE.Vector3(0, 0, 0).applyMatrix4(inverse);
  const b = new THREE.Vector3(0, amount, 0).applyMatrix4(inverse);
  return b.sub(a);
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

    const outer = new LineSegments2(result.geometry, outerGlowMaterial);
    const inner = new LineSegments2(result.geometry.clone(), innerGlowMaterial);
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

    if (retainedEntry.spurFix) {
      const localLift = localOffsetForWorldLift(source, SPUR_WORLD_LIFT);
      outer.position.copy(localLift);
      inner.position.copy(localLift);
      edge.position.copy(localLift);
      hideCompetingDirectLines(source);
    }

    entries.push({
      source,
      outer,
      inner,
      edge,
      segments:result.segments,
      spurFix:retainedEntry.spurFix,
      originalPath:retainedEntry.originalPath
    });
    totalRailSegments += result.segments;
  }

  syncFromCalibrator();
  updateStatus();

  const fixed = entries.filter(entry => entry.spurFix).length;
  console.info(
    `[ADAM path rails] ${entries.length}/${retained.length} ribbons · ` +
    `${totalRailSegments} longitudinal segments · ${fixed} targeted spur fixes.`
  );
}

function wrapFor(hostId, key) {
  const host = document.getElementById(hostId);
  if (!host) return null;
  return [...host.children].find(child => child?._key === key) || null;
}

function readControl(hostId, key, fallback) {
  const wrap = wrapFor(hostId, key);
  const input = wrap?._input;
  if (!input) return fallback;
  if (wrap._isColor) return input.value || fallback;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function setResolution() {
  const root = document.querySelector('[data-scene3d]');
  const r = root?.getBoundingClientRect?.();
  const w = Math.max(1, Math.round(r?.width || 1));
  const h = Math.max(1, Math.round(r?.height || 1));
  edgeMaterial.resolution.set(w, h);
  innerGlowMaterial.resolution.set(w, h);
  outerGlowMaterial.resolution.set(w, h);
}

function syncFromCalibrator() {
  if (!entries.length) return;

  const edgeColor = readControl('edgeCtls', 'edge', '#242424');
  const edgeOpacity = readControl('edgeCtls', 'edgeOpacity', 0.14);
  const edgeWidth = readControl('edgeCtls', 'edgeWidth', 1.0);
  const glowColor = readControl('glowCtls', 'glow', '#86bf40');
  const glowOpacity = readControl('glowCtls', 'glowOpacity', 0.06);
  const glowWidth = readControl('glowCtls', 'glowWidth', 7.0);
  const glowStrength = readControl('glowCtls', 'glowStrength', 0.55);

  edgeMaterial.depthTest = true;
  edgeMaterial.depthWrite = false;
  edgeMaterial.color.set(edgeColor);
  edgeMaterial.opacity = THREE.MathUtils.clamp(edgeOpacity, 0, 1);
  edgeMaterial.linewidth = Math.max(0.2, edgeWidth);

  const combined = THREE.MathUtils.clamp(glowOpacity * glowStrength, 0, 1);
  innerGlowMaterial.depthTest = true;
  innerGlowMaterial.depthWrite = false;
  innerGlowMaterial.color.set(glowColor);
  innerGlowMaterial.opacity = THREE.MathUtils.clamp(combined * 2.3, 0, 0.55);
  innerGlowMaterial.linewidth = clamp(glowWidth * INNER_GLOW_SCALE, INNER_GLOW_MIN, INNER_GLOW_MAX);

  outerGlowMaterial.depthTest = true;
  outerGlowMaterial.depthWrite = false;
  outerGlowMaterial.color.set(glowColor);
  outerGlowMaterial.opacity = THREE.MathUtils.clamp(combined * 0.9, 0, 0.24);
  outerGlowMaterial.linewidth = clamp(glowWidth * OUTER_GLOW_SCALE, OUTER_GLOW_MIN, OUTER_GLOW_MAX);

  setResolution();

  const glowButton = document.getElementById('tGlow');
  const edgeButton = document.getElementById('tEdges');
  const glowVisible = glowButton ? glowButton.classList.contains('on') : true;
  const edgeVisible = edgeButton ? edgeButton.classList.contains('on') : true;

  for (const entry of entries) {
    enforceSourceDepth(entry.source);
    if (entry.spurFix) hideCompetingDirectLines(entry.source);
    entry.outer.visible = glowVisible;
    entry.inner.visible = glowVisible;
    entry.edge.visible = edgeVisible;
  }
}

function updateStatus() {
  const status = document.getElementById('pathRibbonStatus');
  if (!status) return;
  const fixed = entries.filter(entry => entry.spurFix).length;
  status.textContent = `${entries.length}/${retained.length} ribbons · ${fixed}/${SPUR_FIX_PATHS.size} targeted spurs · ${pathAngle()}°`;
}

function bindControls() {
  const angleInput = document.getElementById('pathEdgeAngle');
  const angleValue = document.getElementById('pathEdgeAngleV');
  if (angleInput) {
    const paint = () => {
      if (angleValue) angleValue.textContent = `${Number(angleInput.value).toFixed(0)}°`;
    };
    angleInput.addEventListener('input', () => {
      paint();
      rebuild();
    });
    paint();
  }

  document.getElementById('edgeCtls')?.addEventListener('input', syncFromCalibrator);
  document.getElementById('glowCtls')?.addEventListener('input', syncFromCalibrator);
  document.getElementById('presetRow')?.addEventListener('click', () => requestAnimationFrame(syncFromCalibrator));

  for (const id of ['tEdges', 'tGlow', 'resetBtn']) {
    document.getElementById(id)?.addEventListener('click', () => requestAnimationFrame(syncFromCalibrator));
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
function waitForAppControls() {
  if (initialized) return;
  const edgeReady = document.getElementById('edgeCtls')?.children?.length;
  const glowReady = document.getElementById('glowCtls')?.children?.length;
  if (edgeReady && glowReady) {
    initialize();
    return;
  }
  if (waitFrames++ < 180) requestAnimationFrame(waitForAppControls);
  else console.warn('[ADAM path rails] app-v2 controls never became ready.');
}

window.__ADAM_PATH_RIBBON_REFS = retained;
window.__ADAM_PATH_RAIL_LAYERS = entries;
window.__ADAM_REBUILD_PATH_RAILS = rebuild;
window.__ADAM_SPUR_FIX_PATHS = SPUR_FIX_PATHS;
