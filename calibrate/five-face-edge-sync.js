import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/*
  ADAM calibrator — persistent moved-mesh edge + glow.

  IMPORTANT: this is the same retained-object approach that fixed the earlier
  moved/re-parented meshes, but applied to the ENTIRE original cluster tree.

  Some of the long thin plan/strip meshes are moved or re-parented by the Spline
  motion layer. Looking for them later via their current GLB path is therefore
  unreliable: once their hierarchy changes they no longer match
  `Scene_1/Main_Group/clusters/...`, so a path-based glow pass can simply miss
  them even though the geometry is visible.

  We solve that at the source:
    1. intercept the single GLB load BEFORE app-v2 / spline-motion runs;
    2. retain every real mesh object that originally lived under the clusters;
    3. after app-v2 and the normal rim helper have built their native lines,
       inspect those RETAINED object references rather than rediscovering paths;
    4. only where a retained mesh is still missing an edge and/or glow, attach
       the missing line layers directly to that exact mesh object;
    5. because the lines are children of the retained object they follow every
       later move, rotation and re-parent operation automatically.

  The large site base is not inside Main_Group/clusters and is not captured.
  The four historical villa no-glow exclusions remain respected.
*/

const ORIGINAL_CLUSTER_PREFIX = 'Scene_1/Main_Group/clusters/';

const NO_GLOW_ORIGINAL_PATHS = new Set([
  'Scene_1/Main_Group/clusters/cluster_3/villa/Rectangle_2_4',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_2/Rectangle_2_2',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance_3/Rectangle_2_1',
  'Scene_1/Main_Group/clusters/cluster_3/villa_Instance/Rectangle_2_3'
]);

// These five remain useful as a diagnostic subset because they were the first
// thin architectural meshes that exposed the re-parent/path problem.
const LEGACY_EXACT_PATHS = [
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_2_5',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_10',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_3_2',
  'Scene_1/Main_Group/clusters/cluster_1/floor',
  'Scene_1/Main_Group/clusters/cluster_1/b10/Rectangle_9'
];
const LEGACY_EXACT_SET = new Set(LEGACY_EXACT_PATHS);

const OUTER_WIDTH_MULTIPLIER = 2.2;
const OUTER_OPACITY_MULTIPLIER = 0.32;

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

  root?.traverse?.(object => {
    if (!object?.isMesh || object.isLineSegments2 || !object.geometry?.attributes?.position) return;
    const originalPath = pathOf(object);
    if (!originalPath.startsWith(ORIGINAL_CLUSTER_PREFIX)) return;

    if (LEGACY_EXACT_SET.has(originalPath)) legacyFound.add(originalPath);
    captured.push({ originalPath, mesh:object });
  });

  capturedClusterMeshes = captured;
  captureDone = true;

  console.info(
    `[ADAM retained cluster glow] captured ${captured.length} original cluster mesh object(s) ` +
    `before Spline motion; legacy exact targets ${legacyFound.size}/${LEGACY_EXACT_PATHS.length}`
  );

  const missingLegacy = LEGACY_EXACT_PATHS.filter(path => !legacyFound.has(path));
  if (missingLegacy.length) console.warn('[ADAM retained cluster glow] legacy capture missing:', missingLegacy);
}

// This module is intentionally loaded before glow-bootstrap. The hook sees the
// pristine GLB hierarchy, retains object references, then restores GLTFLoader.
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

// The retained strips can be effectively coplanar with other plan geometry.
// Disable depth testing for only these fallback glow lines so a correctly-built
// glow cannot disappear behind the surface it is meant to outline.
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

function addLine(mesh, geometry, material, target, marker, renderOrder, instanceMatrix = null) {
  const line = new LineSegments2(geometry.clone(), material);
  line.userData[marker] = true;
  line.frustumCulled = false;
  line.renderOrder = renderOrder;

  if (instanceMatrix) {
    line.matrixAutoUpdate = false;
    line.matrix.copy(instanceMatrix);
    line.userData.adamRetainedBaseMatrix = instanceMatrix.clone();
  }

  mesh.add(line);
  target.push(line);
}

function addMissingLayers(entry, geometry, needEdge, needGlow, instanceMatrix = null) {
  if (needEdge) {
    // Use the marker already understood by rim-glow-filter so our fallback edge
    // is never mistaken for one of app-v2's native template lines.
    addLine(
      entry.mesh,
      geometry,
      edgeMaterial,
      persistentEdges,
      'adamSupplementalRimEdge',
      8,
      instanceMatrix
    );
  }

  if (needGlow) {
    addLine(
      entry.mesh,
      geometry,
      innerGlowMaterial,
      persistentInnerGlow,
      'adamSupplementalRimGlow',
      10,
      instanceMatrix
    );
    addLine(
      entry.mesh,
      geometry,
      outerGlowMaterial,
      persistentOuterGlow,
      'adamSupplementalOuterGlow',
      9,
      instanceMatrix
    );
  }
}

function rebuild(angle) {
  clearPersistent();
  if (!captureDone || !capturedClusterMeshes.length) return;

  let missingEdgeMeshes = 0;
  let missingGlowMeshes = 0;
  let skippedNoGlow = 0;
  let lineInstances = 0;

  for (const entry of capturedClusterMeshes) {
    const mesh = entry.mesh;
    if (!mesh?.parent || !mesh.geometry?.attributes?.position) continue;

    const needEdge = !hasEdge(mesh);
    const glowAllowed = !NO_GLOW_ORIGINAL_PATHS.has(entry.originalPath);
    const needGlow = glowAllowed && !hasGlow(mesh);
    if (!glowAllowed) skippedNoGlow++;
    if (!needEdge && !needGlow) continue;

    if (needEdge) missingEdgeMeshes++;
    if (needGlow) missingGlowMeshes++;

    const geometry = makeGeometry(mesh, angle);
    if (!geometry) continue;

    if (mesh.isInstancedMesh) {
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        addMissingLayers(entry, geometry, needEdge, needGlow, matrix.clone());
        lineInstances++;
      }
    } else {
      addMissingLayers(entry, geometry, needEdge, needGlow);
      lineInstances++;
    }

    geometry.dispose();
  }

  built = true;
  buildSummary = {
    captured:capturedClusterMeshes.length,
    missingEdgeMeshes,
    missingGlowMeshes,
    skippedNoGlow,
    edgeLines:persistentEdges.length,
    innerGlowLines:persistentInnerGlow.length,
    outerGlowLines:persistentOuterGlow.length,
    lineInstances
  };

  console.info(
    `[ADAM retained cluster glow] fallback built from retained refs: ` +
    `${missingEdgeMeshes} mesh(es) missing edge, ${missingGlowMeshes} mesh(es) missing glow; ` +
    `${persistentEdges.length} edge / ${persistentInnerGlow.length} inner / ` +
    `${persistentOuterGlow.length} outer line layer(s)`
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

  // app-v2 and rim-glow-filter have already had a chance to build their normal
  // lines before this render wrapper runs. Rebuild only our truly missing set.
  if (!built || edge.angle !== lastAngle) {
    lastAngle = edge.angle;
    rebuild(edge.angle);
  }

  edgeMaterial.color.set(edge.color);
  edgeMaterial.opacity = THREE.MathUtils.clamp(edge.opacity, 0, 1);
  edgeMaterial.linewidth = Math.max(0.01, edge.width);

  // Match the normal calibrator glow controls exactly for the tight core. The
  // second line is simply a broader low-alpha halo derived from that same style.
  const baseGlowOpacity = THREE.MathUtils.clamp(glow.opacity * glow.strength, 0, 1);
  innerGlowMaterial.color.set(glow.color);
  innerGlowMaterial.opacity = baseGlowOpacity;
  innerGlowMaterial.linewidth = Math.max(0.1, glow.width);

  outerGlowMaterial.color.set(glow.color);
  outerGlowMaterial.opacity = THREE.MathUtils.clamp(baseGlowOpacity * OUTER_OPACITY_MULTIPLIER, 0, 1);
  outerGlowMaterial.linewidth = Math.max(glow.width + 2, glow.width * OUTER_WIDTH_MULTIPLIER);

  const size = canvasSize();
  edgeMaterial.resolution.set(size.width, size.height);
  innerGlowMaterial.resolution.set(size.width, size.height);
  outerGlowMaterial.resolution.set(size.width, size.height);

  const edgeVisible = toggleVisible('tEdges');
  const glowVisible = toggleVisible('tGlow');

  for (const line of persistentEdges) line.visible = edgeVisible;
  for (const line of persistentInnerGlow) {
    line.visible = glowVisible;
    applyExpansion(line, glow.expansion, 1);
  }
  for (const line of persistentOuterGlow) {
    line.visible = glowVisible;
    applyExpansion(line, glow.expansion, 1.8);
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
