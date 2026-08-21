import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/*
  ADAM calibrator — persistent moved-mesh edge + glow.

  This keeps the successful retained-object technique from the earlier moved
  mesh fixes, but corrects one important mistake in the previous attempt:

  the generic rim helper had already attached an additive line to many flat
  strip meshes. `hasGlow(mesh)` therefore returned true even when that line was
  effectively invisible / wrong for the near-coplanar plan geometry, so the
  retained fallback skipped exactly the meshes we were trying to rescue.

  New rule:
    - every mesh that was ORIGINALY FLAT (< 0.1 world-space height) in the
      untouched GLB gets its own explicit retained edge + visible additive glow,
      regardless of whether another helper claims a glow child already exists;
    - non-flat architecture still only receives genuinely missing layers;
    - the explicit flat glow uses depthTest:false and a stronger tight core plus
      broad halo so it stays visible over the plan surface;
    - all layers are children of the retained original mesh object, so they move,
      rotate and re-parent with Spline motion exactly as the mesh does.

  The site base is outside Main_Group/clusters and is never captured.
*/

const ORIGINAL_CLUSTER_PREFIX = 'Scene_1/Main_Group/clusters/';
const FLAT_THRESHOLD = 0.1;

const NO_GLOW_ORIGINAL_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_3/villa/Rectangle_2_4',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_2/Rectangle_2_2',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_3/Rectangle_2_1',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance/Rectangle_2_3'
]);

const LEGACY_EXACT_PATHS = [
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_2_5',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_10',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_3_2',
  'Scene_1/Main_Group/clusters/cluster_1/floor',
  'Scene_1/Main_Group/clusters/cluster_1/b10/Rectangle_9'
];
const LEGACY_EXACT_SET = new Set(LEGACY_EXACT_PATHS);

const FLAT_INNER_OPACITY_MULTIPLIER = 3.5;
const FLAT_OUTER_OPACITY_MULTIPLIER = 1.15;
const FLAT_INNER_WIDTH_MULTIPLIER = 1.15;
const FLAT_OUTER_WIDTH_MULTIPLIER = 2.45;
const NORMAL_OUTER_OPACITY_MULTIPLIER = 0.32;
const NORMAL_OUTER_WIDTH_MULTIPLIER = 2.2;

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

let capturedClusterMeshes = [];
let captureDone = false;

function captureClusterMeshes(root) {
  const captured = [];
  const legacyFound = new Set();
  let flatCount = 0;

  root?.updateWorldMatrix?.(true, true);
  root?.traverse?.(object => {
    if (!object?.isMesh || object.isLineSegments2 || !object.geometry?.attributes?.position) return;

    const originalPath = pathOf(object);
    if (!originalPath.startsWith(ORIGINAL_CLUSTER_PREFIX)) return;

    const box = new THREE.Box3().setFromObject(object);
    const worldSize = box.getSize(new THREE.Vector3());
    const originalWorldHeight = Math.abs(worldSize.y);
    const isOriginalFlat = originalWorldHeight < FLAT_THRESHOLD;

    if (isOriginalFlat) flatCount++;
    if (LEGACY_EXACT_SET.has(originalPath)) legacyFound.add(originalPath);

    captured.push({
      originalPath,
      mesh:object,
      originalWorldHeight,
      isOriginalFlat
    });
  });

  capturedClusterMeshes = captured;
  captureDone = true;

  console.info(
    `[ADAM retained flat glow] captured ${captured.length} original cluster mesh object(s), ` +
    `${flatCount} classified flat before Spline motion; legacy exact ${legacyFound.size}/${LEGACY_EXACT_PATHS.length}`
  );

  const missingLegacy = LEGACY_EXACT_PATHS.filter(path => !legacyFound.has(path));
  if (missingLegacy.length) console.warn('[ADAM retained flat glow] legacy capture missing:', missingLegacy);
}

// Loaded before glow-bootstrap, so this sees the pristine hierarchy. Keep object
// references, then restore GLTFLoader immediately.
const originalLoadAsync = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function adamCaptureOriginalClusterMeshes(...args) {
  try {
    const gltf = await originalLoadAsync.apply(this, args);
    captureClusterMeshes(gltf?.scene);
    return gltf;
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoadAsync;
  }
};

function colorValue(hostSelector, index, fallback) {
  const wrap = document.querySelectorAll(`${hostSelector} .ctl`)[index];
  return wrap?.querySelector('input[type="color"]')?.value || fallback;
}
function rangeValue(hostSelector, index, fallback) {
  const wrap = document.querySelectorAll(`${hostSelector} .ctl`)[index];
  const value = Number(wrap?.querySelector('input[type="range"]')?.value);
  return Number.isFinite(value) ? value : fallback;
}

function edgeControls() {
  return {
    color:colorValue('#edgeCtls', 0, '#242424'),
    opacity:rangeValue('#edgeCtls', 1, 0.14),
    width:rangeValue('#edgeCtls', 2, 1),
    angle:rangeValue('#edgeCtls', 3, 30)
  };
}
function glowControls() {
  return {
    color:colorValue('#glowCtls', 0, '#86bf40'),
    opacity:rangeValue('#glowCtls', 1, 0.06),
    width:rangeValue('#glowCtls', 2, 7),
    strength:rangeValue('#glowCtls', 3, 0.55),
    expansion:rangeValue('#glowCtls', 4, 0.0015)
  };
}

function toggleVisible(id) {
  const button = document.getElementById(id);
  return !button || button.classList.contains('on');
}

function canvasSize() {
  const canvas = document.querySelector('[data-scene3d-canvas]');
  if (!canvas) return { width:1, height:1 };
  const rect = canvas.getBoundingClientRect();
  return {
    width:Math.max(1, Math.round(rect.width)),
    height:Math.max(1, Math.round(rect.height))
  };
}

function makeGeometry(mesh, angle) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, angle);
  const position = edges.attributes.position;
  if (!position || position.count < 2) {
    edges.dispose();
    return null;
  }

  const positions = new Float32Array(position.count * 3);
  positions.set(position.array);
  edges.dispose();

  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  return geometry;
}

function isAdditiveLine(object) {
  return !!object?.isLineSegments2 && object.material?.blending === THREE.AdditiveBlending;
}
function isEdgeLine(object) {
  return !!object?.isLineSegments2 && !isAdditiveLine(object);
}
function hasGlow(mesh) {
  return mesh.children.some(isAdditiveLine);
}
function hasEdge(mesh) {
  return mesh.children.some(isEdgeLine);
}

const edgeMaterial = new LineMaterial({
  transparent:true,
  depthTest:true,
  depthWrite:false
});
edgeMaterial.toneMapped = false;

const innerGlowMaterial = new LineMaterial({
  transparent:true,
  depthTest:false,
  depthWrite:false,
  blending:THREE.AdditiveBlending
});
innerGlowMaterial.toneMapped = false;

const outerGlowMaterial = new LineMaterial({
  transparent:true,
  depthTest:false,
  depthWrite:false,
  blending:THREE.AdditiveBlending
});
outerGlowMaterial.toneMapped = false;

const persistentEdges = [];
const persistentInnerGlow = [];
const persistentOuterGlow = [];
let lastAngle = null;
let built = false;
let buildSummary = null;

function clearLines(lines) {
  for (const line of lines) {
    line.removeFromParent();
    line.geometry?.dispose?.();
  }
  lines.length = 0;
}

function clearPersistent() {
  clearLines(persistentEdges);
  clearLines(persistentInnerGlow);
  clearLines(persistentOuterGlow);
}

function addLine(entry, geometry, material, target, marker, renderOrder, instanceMatrix = null) {
  const line = new LineSegments2(geometry.clone(), material);
  line.userData[marker] = true;
  line.userData.adamRetainedFlat = entry.isOriginalFlat;
  line.userData.adamOriginalPath = entry.originalPath;
  line.frustumCulled = false;
  line.renderOrder = renderOrder;

  if (instanceMatrix) {
    line.matrixAutoUpdate = false;
    line.matrix.copy(instanceMatrix);
    line.userData.adamRetainedBaseMatrix = instanceMatrix.clone();
  }

  entry.mesh.add(line);
  target.push(line);
}

function addLayers(entry, geometry, needEdge, needGlow, instanceMatrix = null) {
  if (needEdge) {
    addLine(
      entry, geometry, edgeMaterial, persistentEdges,
      'adamSupplementalRimEdge', 20, instanceMatrix
    );
  }

  if (needGlow) {
    addLine(
      entry, geometry, innerGlowMaterial, persistentInnerGlow,
      'adamSupplementalRimGlow', 22, instanceMatrix
    );
    addLine(
      entry, geometry, outerGlowMaterial, persistentOuterGlow,
      'adamSupplementalOuterGlow', 21, instanceMatrix
    );
  }
}

function rebuild(angle) {
  clearPersistent();
  if (!captureDone || !capturedClusterMeshes.length) return;

  let forcedFlatMeshes = 0;
  let missingEdgeMeshes = 0;
  let missingGlowMeshes = 0;
  let skippedNoGlow = 0;

  for (const entry of capturedClusterMeshes) {
    const mesh = entry.mesh;
    if (!mesh?.parent || !mesh.geometry?.attributes?.position) continue;

    const glowAllowed = !NO_GLOW_ORIGINAL_PATHS.has(entry.originalPath);

    // THIS is the key correction: originally-flat meshes are forced even if
    // another helper has already added a nominal edge/glow child. Those generic
    // children were causing our prior `hasGlow()` check to skip these strips.
    const forceFlat = entry.isOriginalFlat;
    const needEdge = forceFlat || !hasEdge(mesh);
    const needGlow = glowAllowed && (forceFlat || !hasGlow(mesh));

    if (!glowAllowed) skippedNoGlow++;
    if (!needEdge && !needGlow) continue;
    if (forceFlat) forcedFlatMeshes++;
    if (!forceFlat && needEdge) missingEdgeMeshes++;
    if (!forceFlat && needGlow) missingGlowMeshes++;

    const geometry = makeGeometry(mesh, angle);
    if (!geometry) continue;

    if (mesh.isInstancedMesh) {
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        addLayers(entry, geometry, needEdge, needGlow, matrix.clone());
      }
    } else {
      addLayers(entry, geometry, needEdge, needGlow);
    }

    geometry.dispose();
  }

  built = true;
  buildSummary = {
    captured:capturedClusterMeshes.length,
    flatCaptured:capturedClusterMeshes.filter(entry => entry.isOriginalFlat).length,
    forcedFlatMeshes,
    missingEdgeMeshes,
    missingGlowMeshes,
    skippedNoGlow,
    edgeLines:persistentEdges.length,
    innerGlowLines:persistentInnerGlow.length,
    outerGlowLines:persistentOuterGlow.length
  };

  console.info(
    `[ADAM retained flat glow] FORCED ${forcedFlatMeshes} originally-flat mesh(es); ` +
    `${persistentEdges.length} edge / ${persistentInnerGlow.length} inner / ` +
    `${persistentOuterGlow.length} outer retained layer(s)`
  );
}

function applyExpansion(line, expansion, multiplier = 1) {
  const scale = 1 + Math.max(0, expansion) * multiplier;
  const base = line.userData.adamRetainedBaseMatrix;
  if (base && !line.matrixAutoUpdate) {
    line.matrix.copy(base).multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
    line.matrixWorldNeedsUpdate = true;
  } else {
    line.scale.setScalar(scale);
  }
}

function sync() {
  if (!captureDone) return;

  const edge = edgeControls();
  const glow = glowControls();

  if (!built || edge.angle !== lastAngle) {
    lastAngle = edge.angle;
    rebuild(edge.angle);
  }

  edgeMaterial.color.set(edge.color);
  edgeMaterial.opacity = THREE.MathUtils.clamp(edge.opacity, 0, 1);
  edgeMaterial.linewidth = Math.max(0.01, edge.width);

  const baseGlowOpacity = THREE.MathUtils.clamp(glow.opacity * glow.strength, 0, 1);
  innerGlowMaterial.color.set(glow.color);
  outerGlowMaterial.color.set(glow.color);

  const size = canvasSize();
  edgeMaterial.resolution.set(size.width, size.height);
  innerGlowMaterial.resolution.set(size.width, size.height);
  outerGlowMaterial.resolution.set(size.width, size.height);

  const edgeVisible = toggleVisible('tEdges');
  const glowVisible = toggleVisible('tGlow');

  for (const line of persistentEdges) line.visible = edgeVisible;

  for (const line of persistentInnerGlow) {
    const isFlat = !!line.userData.adamRetainedFlat;
    innerGlowMaterial.opacity = THREE.MathUtils.clamp(
      baseGlowOpacity * (isFlat ? FLAT_INNER_OPACITY_MULTIPLIER : 1), 0, 1
    );
    innerGlowMaterial.linewidth = Math.max(
      0.1,
      glow.width * (isFlat ? FLAT_INNER_WIDTH_MULTIPLIER : 1)
    );
    line.visible = glowVisible;
    applyExpansion(line, glow.expansion, isFlat ? 1.35 : 1);
  }

  for (const line of persistentOuterGlow) {
    const isFlat = !!line.userData.adamRetainedFlat;
    outerGlowMaterial.opacity = THREE.MathUtils.clamp(
      baseGlowOpacity * (isFlat ? FLAT_OUTER_OPACITY_MULTIPLIER : NORMAL_OUTER_OPACITY_MULTIPLIER), 0, 1
    );
    outerGlowMaterial.linewidth = Math.max(
      glow.width + 2,
      glow.width * (isFlat ? FLAT_OUTER_WIDTH_MULTIPLIER : NORMAL_OUTER_WIDTH_MULTIPLIER)
    );
    line.visible = glowVisible;
    applyExpansion(line, glow.expansion, isFlat ? 2.2 : 1.8);
  }
}

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function render(scene, camera) {
  sync();
  return previousRender.call(this, scene, camera);
};

window.__ADAM_RETAINED_CLUSTER_MESHES = () => capturedClusterMeshes;
window.__ADAM_RETAINED_CLUSTER_GLOW_SUMMARY = () => buildSummary;
window.__ADAM_RETAINED_CLUSTER_EDGES = () => persistentEdges;
window.__ADAM_RETAINED_CLUSTER_INNER_GLOW = () => persistentInnerGlow;
window.__ADAM_RETAINED_CLUSTER_OUTER_GLOW = () => persistentOuterGlow;
