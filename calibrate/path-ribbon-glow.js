import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/*
  ADAM path-ribbon glow
  ---------------------
  The foreground hairlines are real ribbon meshes under:

    Scene_1/Main_Group/paths/**

  They must NOT go through the building EdgesGeometry pipeline: doing that puts
  two nearly-coincident long edges plus short end-cap edges around each ribbon,
  which is what produced the bright white/lime blobs at the ribbon ends.

  Instead we keep the paths as their original flat meshes and, only AFTER app-v2
  has finished classifying the GLB, attach three mesh copies to each exact ribbon:
    - broad outer halo
    - tighter inner glow
    - a subtle dark core overlay

  The halo copies share the ribbon geometry and are expanded about the geometry
  bounding-box centre, primarily across the ribbon width. That gives one
  continuous glow band along the full path with no edge-segment accumulation at
  the ends. No renderer monkeypatch is used; this module only intercepts the GLB
  load long enough to retain exact object references, then restores GLTFLoader.
*/

const PATH_PREFIX = 'Scene_1/Main_Group/paths/';
const retained = [];
const entries = [];
let overallSpan = 40;
let initialized = false;

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
  root?.updateWorldMatrix?.(true, true);
  root?.traverse?.(object => {
    if (!object?.isMesh || !object.geometry?.attributes?.position) return;
    const path = pathOf(object);
    if (!path.startsWith(PATH_PREFIX)) return;
    retained.push({ mesh:object, originalPath:path });
  });
  console.info(`[ADAM path ribbons] captured ${retained.length} Main_Group/paths mesh(es) before app-v2 classification.`);
}

// Capture exact GLB mesh references, but DO NOT attach child meshes here.
// app-v2 traverses the model immediately after load; attaching glow meshes at
// this point would make app-v2 classify the glow copies as model content too.
const originalLoadAsync = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function adamCapturePathRibbons(...args) {
  try {
    const gltf = await originalLoadAsync.apply(this, args);
    capture(gltf?.scene);
    setTimeout(() => waitForAppControls(), 0);
    return gltf;
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoadAsync;
  }
};

const outerMaterial = new THREE.MeshBasicMaterial({
  color:0x86bf40,
  transparent:true,
  opacity:0.04,
  depthTest:true,
  depthWrite:false,
  side:THREE.DoubleSide,
  blending:THREE.NormalBlending,
  polygonOffset:true,
  polygonOffsetFactor:-1,
  polygonOffsetUnits:-1,
  toneMapped:false
});

const innerMaterial = new THREE.MeshBasicMaterial({
  color:0x86bf40,
  transparent:true,
  opacity:0.10,
  depthTest:true,
  depthWrite:false,
  side:THREE.DoubleSide,
  blending:THREE.NormalBlending,
  polygonOffset:true,
  polygonOffsetFactor:-2,
  polygonOffsetUnits:-2,
  toneMapped:false
});

const coreMaterial = new THREE.MeshBasicMaterial({
  color:0x242424,
  transparent:true,
  opacity:0.20,
  depthTest:true,
  depthWrite:false,
  side:THREE.DoubleSide,
  blending:THREE.NormalBlending,
  polygonOffset:true,
  polygonOffsetFactor:-3,
  polygonOffsetUnits:-3,
  toneMapped:false
});

function component(v, axis) {
  return axis === 0 ? v.x : axis === 1 ? v.y : v.z;
}

function setComponent(v, axis, value) {
  if (axis === 0) v.x = value;
  else if (axis === 1) v.y = value;
  else v.z = value;
}

function geometryInfo(mesh) {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  if (!box) return null;

  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const axes = [0,1,2].sort((a,b) => component(size,a) - component(size,b));

  // Smallest local dimension is thickness, middle is ribbon width, largest is
  // path length. This remains valid even if the object itself is rotated.
  return {
    centre,
    size,
    thicknessAxis:axes[0],
    widthAxis:axes[1],
    lengthAxis:axes[2]
  };
}

function buildLayers() {
  if (initialized) return;
  initialized = true;

  const overall = new THREE.Box3();
  let any = false;
  for (const retainedEntry of retained) {
    const mesh = retainedEntry.mesh;
    if (!mesh?.parent || !mesh.geometry?.attributes?.position) continue;
    overall.expandByObject(mesh);
    any = true;
  }
  if (any) {
    const size = overall.getSize(new THREE.Vector3());
    overallSpan = Math.max(size.x, size.y, size.z, 1);
  }

  for (const retainedEntry of retained) {
    const source = retainedEntry.mesh;
    if (!source?.parent || !source.geometry?.attributes?.position) continue;
    const info = geometryInfo(source);
    if (!info) continue;

    const outer = new THREE.Mesh(source.geometry, outerMaterial);
    const inner = new THREE.Mesh(source.geometry, innerMaterial);
    const core = new THREE.Mesh(source.geometry, coreMaterial);

    outer.name = `${source.name || 'path'}__adam_path_outer_glow`;
    inner.name = `${source.name || 'path'}__adam_path_inner_glow`;
    core.name = `${source.name || 'path'}__adam_path_core`;

    for (const layer of [outer, inner, core]) {
      layer.userData.adamPathRibbonLayer = true;
      layer.userData.adamPathRibbonSource = retainedEntry.originalPath;
      layer.frustumCulled = false;
    }

    outer.renderOrder = 90;
    inner.renderOrder = 91;
    core.renderOrder = 92;

    source.add(outer, inner, core);
    entries.push({ source, outer, inner, core, ...info });
  }

  bindControlListeners();
  syncFromCalibrator();

  console.info(
    `[ADAM path ribbons] built mesh glow for ${entries.length} ribbon mesh(es); ` +
    `overall span ${overallSpan.toFixed(2)} world units.`
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
  const number = Number(input.value);
  return Number.isFinite(number) ? number : fallback;
}

function scaleAroundGeometryCentre(entry, layer, widthPadWorld, lengthPadWorld) {
  const worldScale = new THREE.Vector3();
  entry.source.getWorldScale(worldScale);

  const factors = new THREE.Vector3(1,1,1);
  const localWidth = Math.max(component(entry.size, entry.widthAxis), 1e-7);
  const localLength = Math.max(component(entry.size, entry.lengthAxis), 1e-7);
  const widthWorldScale = Math.max(Math.abs(component(worldScale, entry.widthAxis)), 1e-7);
  const lengthWorldScale = Math.max(Math.abs(component(worldScale, entry.lengthAxis)), 1e-7);

  const localWidthPad = widthPadWorld / widthWorldScale;
  const localLengthPad = lengthPadWorld / lengthWorldScale;

  setComponent(factors, entry.widthAxis, 1 + (2 * localWidthPad / localWidth));
  setComponent(factors, entry.lengthAxis, 1 + (2 * localLengthPad / localLength));

  layer.scale.copy(factors);
  layer.position.set(
    entry.centre.x * (1 - factors.x),
    entry.centre.y * (1 - factors.y),
    entry.centre.z * (1 - factors.z)
  );
  layer.updateMatrix();
}

function syncFromCalibrator() {
  if (!entries.length) return;

  const edgeColor = readControl('edgeCtls', 'edge', '#242424');
  const edgeOpacity = readControl('edgeCtls', 'edgeOpacity', 0.14);
  const glowColor = readControl('glowCtls', 'glow', '#86bf40');
  const glowOpacity = readControl('glowCtls', 'glowOpacity', 0.06);
  const glowWidth = readControl('glowCtls', 'glowWidth', 7);
  const glowStrength = readControl('glowCtls', 'glowStrength', 0.55);
  const glowExpansion = readControl('glowCtls', 'glowExpansion', 0.0015);

  coreMaterial.color.set(edgeColor);
  coreMaterial.opacity = THREE.MathUtils.clamp(edgeOpacity * 1.5, 0, 0.75);

  innerMaterial.color.set(glowColor);
  outerMaterial.color.set(glowColor);

  // Normal alpha blending is intentional here. The background/site plate is
  // almost white, and this produces a visible continuous green tint without the
  // additive endpoint accumulation that the edge-line solution produced.
  const combined = THREE.MathUtils.clamp(glowOpacity * glowStrength, 0, 1);
  innerMaterial.opacity = THREE.MathUtils.clamp(combined * 3.0, 0, 0.65);
  outerMaterial.opacity = THREE.MathUtils.clamp(combined * 1.15, 0, 0.30);

  // Convert the px-style glow width control into a stable world-space ribbon
  // padding based on the overall path bundle span. Expansion slightly boosts it.
  const widthScale = Math.max(0.05, glowWidth / 7);
  const expansionBoost = 1 + Math.max(0, glowExpansion) * 60;
  const innerPad = overallSpan * 0.00115 * widthScale * expansionBoost;
  const outerPad = innerPad * 2.35;

  for (const entry of entries) {
    scaleAroundGeometryCentre(entry, entry.inner, innerPad, innerPad * 0.16);
    scaleAroundGeometryCentre(entry, entry.outer, outerPad, outerPad * 0.12);
    entry.core.scale.set(1,1,1);
    entry.core.position.set(0,0,0);
  }

  const glowButton = document.getElementById('tGlow');
  const edgesButton = document.getElementById('tEdges');
  const glowVisible = glowButton ? glowButton.classList.contains('on') : true;
  const edgeVisible = edgesButton ? edgesButton.classList.contains('on') : true;

  for (const entry of entries) {
    entry.inner.visible = glowVisible && innerMaterial.opacity > 0;
    entry.outer.visible = glowVisible && outerMaterial.opacity > 0;
    entry.core.visible = edgeVisible && coreMaterial.opacity > 0;
  }
}

function bindControlListeners() {
  const edgeHost = document.getElementById('edgeCtls');
  const glowHost = document.getElementById('glowCtls');
  edgeHost?.addEventListener('input', syncFromCalibrator);
  glowHost?.addEventListener('input', syncFromCalibrator);

  for (const id of ['tEdges', 'tGlow', 'resetBtn']) {
    document.getElementById(id)?.addEventListener('click', () => requestAnimationFrame(syncFromCalibrator));
  }

  const presetRow = document.getElementById('presetRow');
  presetRow?.addEventListener('click', () => requestAnimationFrame(syncFromCalibrator));
}

let waitFrames = 0;
function waitForAppControls() {
  if (initialized) return;
  const edgeReady = document.getElementById('edgeCtls')?.children?.length;
  const glowReady = document.getElementById('glowCtls')?.children?.length;

  if (edgeReady && glowReady) {
    buildLayers();
    return;
  }

  if (waitFrames++ < 180) requestAnimationFrame(waitForAppControls);
  else console.warn('[ADAM path ribbons] app-v2 controls never became ready; ribbon glow not initialized.');
}

window.__ADAM_PATH_RIBBON_REFS = retained;
window.__ADAM_PATH_RIBBON_LAYERS = entries;
window.__ADAM_SYNC_PATH_RIBBON_GLOW = syncFromCalibrator;
