import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/*
  ADAM path-ribbon edge + glow
  ----------------------------
  The foreground rails are real ribbon meshes under:

    Scene_1/Main_Group/paths/**

  Their rounded profile has shallow dihedral angles. At the building default of
  30 degrees, EdgesGeometry discards the lengthwise rails and leaves mainly the
  true boundary/end-cap segments — exactly the bright terminal dots we saw.

  The path ribbons therefore get their OWN EdgesGeometry threshold (default 10°)
  while staying out of app-v2's building `solids` population. We additionally
  filter the generated edges to keep segments running predominantly along the
  ribbon's longest local axis. That removes the short end-cap/cross-profile
  segments completely, so glow cannot accumulate into dots at ribbon ends.

  Colours/opacity/width still follow the normal Edge and Glow calibrator values;
  only the path edge angle is independent.
*/

const PATH_PREFIX = 'Scene_1/Main_Group/paths/';
const DEFAULT_PATH_EDGE_ANGLE = 10;
const retained = [];
const entries = [];
let builtAngle = null;
let initialized = false;
let totalRailSegments = 0;

const edgeMaterial = new LineMaterial({
  transparent:true,
  depthTest:false,
  depthWrite:false,
  blending:THREE.NormalBlending
});
edgeMaterial.toneMapped = false;

const innerGlowMaterial = new LineMaterial({
  transparent:true,
  depthTest:false,
  depthWrite:false,
  blending:THREE.NormalBlending
});
innerGlowMaterial.toneMapped = false;

const outerGlowMaterial = new LineMaterial({
  transparent:true,
  depthTest:false,
  depthWrite:false,
  blending:THREE.NormalBlending
});
outerGlowMaterial.toneMapped = false;

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

function capture(root) {
  retained.length = 0;
  root?.traverse?.(object => {
    if (!object?.isMesh || !object.geometry?.attributes?.position) return;
    const path = pathOf(object);
    if (!path.startsWith(PATH_PREFIX)) return;
    retained.push({ mesh:object, originalPath:path });
  });
  console.info(`[ADAM path rails] captured ${retained.length} Main_Group/paths mesh(es).`);
}

// Capture exact mesh references before app-v2 classifies/recentres the model.
// Do not attach line children until app-v2 has finished its own traversal.
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

function component(v, axis) {
  return axis === 0 ? v.x : axis === 1 ? v.y : v.z;
}

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

    // Keep longitudinal rail segments; reject end caps / cross-profile strokes.
    // A mild ratio allows shallow bends while still eliminating near-perpendicular
    // terminal segments.
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

function rebuild() {
  const angle = pathAngle();
  clearLayers();

  for (const retainedEntry of retained) {
    const source = retainedEntry.mesh;
    if (!source?.parent || !source.geometry?.attributes?.position) continue;

    const result = railGeometryForMesh(source, angle);
    if (!result.geometry) continue;

    const outer = new LineSegments2(result.geometry, outerGlowMaterial);
    const inner = new LineSegments2(result.geometry.clone(), innerGlowMaterial);
    const edge = new LineSegments2(result.geometry.clone(), edgeMaterial);

    for (const line of [outer, inner, edge]) {
      line.userData.adamPathRailLayer = true;
      line.userData.adamPathRailSource = retainedEntry.originalPath;
      line.frustumCulled = false;
    }

    outer.renderOrder = 90;
    inner.renderOrder = 91;
    edge.renderOrder = 92;

    source.add(outer, inner, edge);
    entries.push({ source, outer, inner, edge, segments:result.segments });
    totalRailSegments += result.segments;
  }

  builtAngle = angle;
  syncFromCalibrator();
  updateStatus();

  console.info(
    `[ADAM path rails] angle ${angle}° · ${entries.length}/${retained.length} ribbons · ` +
    `${totalRailSegments} longitudinal segments.`
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

  edgeMaterial.color.set(edgeColor);
  edgeMaterial.opacity = THREE.MathUtils.clamp(edgeOpacity, 0, 1);
  edgeMaterial.linewidth = Math.max(0.2, edgeWidth);

  const combined = THREE.MathUtils.clamp(glowOpacity * glowStrength, 0, 1);
  innerGlowMaterial.color.set(glowColor);
  innerGlowMaterial.opacity = THREE.MathUtils.clamp(combined * 2.3, 0, 0.55);
  innerGlowMaterial.linewidth = Math.max(1, glowWidth);

  outerGlowMaterial.color.set(glowColor);
  outerGlowMaterial.opacity = THREE.MathUtils.clamp(combined * 0.9, 0, 0.24);
  outerGlowMaterial.linewidth = Math.max(1.5, glowWidth * 1.9);

  setResolution();

  const glowButton = document.getElementById('tGlow');
  const edgeButton = document.getElementById('tEdges');
  const glowVisible = glowButton ? glowButton.classList.contains('on') : true;
  const edgeVisible = edgeButton ? edgeButton.classList.contains('on') : true;

  for (const entry of entries) {
    entry.outer.visible = glowVisible;
    entry.inner.visible = glowVisible;
    entry.edge.visible = edgeVisible;
  }
}

function updateStatus() {
  const status = document.getElementById('pathRibbonStatus');
  if (status) {
    status.textContent = `${entries.length}/${retained.length} ribbons · ${totalRailSegments} rail segments · ${pathAngle()}°`;
  }
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
