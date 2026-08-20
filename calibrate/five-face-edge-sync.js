import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/*
  ADAM calibrator — persistent exact edge + glow sync for the five thin meshes.

  These are the awkward meshes we fixed previously by retaining the ACTUAL GLB
  mesh objects before spline-motion re-parents/moves them. Looking them up again
  later by hierarchy path is unreliable because their path can change after the
  movement system takes ownership of them.

  This module deliberately repeats that proven approach:
    1. hook GLTFLoader before app-v2 loads;
    2. capture the exact five mesh object references from the untouched GLB;
    3. keep those references after motion/re-parenting;
    4. attach a persistent edge + tight additive glow + soft outer halo directly
       to each retained mesh, so all three layers move with the mesh;
    5. sync the layers live to the normal Edges and Glow calibrator controls.

  Glow uses depthTest:false on these near-coplanar strips. Their previous glow
  could be geometrically present but hidden by the ground/strip depth surface.
  The edge remains depth-tested; the glow sits visibly above the plan like the
  original Spline treatment.
*/

const TARGET_PATHS = [
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_2_5',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_10',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_3_2',
  'Scene_1/Main_Group/clusters/cluster_1/floor',
  'Scene_1/Main_Group/clusters/cluster_1/b10/Rectangle_9'
];
const TARGET_SET = new Set(TARGET_PATHS);

const OUTER_WIDTH_MULTIPLIER = 2.4;
const OUTER_OPACITY_MULTIPLIER = 0.38;
const INNER_OPACITY_MULTIPLIER = 1.6;

function pathOf(object) {
  const parts = [];
  let node = object;
  while (node) {
    if (node.name) parts.push(node.name);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

let capturedTargets = [];
let captureDone = false;

function captureExactTargets(root) {
  const found = new Map();
  root?.traverse?.(object => {
    if (!object?.isMesh || !object.geometry?.attributes?.position) return;
    const path = pathOf(object);
    if (TARGET_SET.has(path)) found.set(path, object);
  });

  capturedTargets = TARGET_PATHS
    .map(path => ({ path, mesh: found.get(path) || null }))
    .filter(entry => entry.mesh);
  captureDone = true;

  console.info(
    `[ADAM exact strip edge+glow] captured ${capturedTargets.length}/${TARGET_PATHS.length} ` +
    'mesh objects before spline motion/re-parenting'
  );
  const missing = TARGET_PATHS.filter(path => !found.has(path));
  if (missing.length) console.warn('[ADAM exact strip edge+glow] capture missing:', missing);
}

// Install the capture before glow-bootstrap imports app-v2. Restore the loader
// immediately after this one model load; only retained object references remain.
const originalLoadAsync = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function adamCaptureExactStripTargets(...args) {
  try {
    const gltf = await originalLoadAsync.apply(this, args);
    captureExactTargets(gltf?.scene);
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
    color: colorValue('#edgeCtls', 0, '#242424'),
    opacity: rangeValue('#edgeCtls', 1, 0.14),
    width: rangeValue('#edgeCtls', 2, 1),
    angle: rangeValue('#edgeCtls', 3, 30)
  };
}
function glowControls() {
  return {
    color: colorValue('#glowCtls', 0, '#86bf40'),
    opacity: rangeValue('#glowCtls', 1, 0.06),
    width: rangeValue('#glowCtls', 2, 7),
    strength: rangeValue('#glowCtls', 3, 0.55),
    expansion: rangeValue('#glowCtls', 4, 0.0015)
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
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height))
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

let edgeLines = [];
let innerGlowLines = [];
let outerGlowLines = [];
let lastAngle = null;
let lastCapturedIdentity = null;

function clearLines(lines) {
  for (const line of lines) {
    line.removeFromParent();
    line.geometry?.dispose?.();
  }
  lines.length = 0;
}

function addLine(mesh, geometry, material, target, marker, renderOrder, instanceMatrix = null) {
  const line = new LineSegments2(geometry.clone(), material);
  line.userData[marker] = true;
  line.frustumCulled = false;
  line.renderOrder = renderOrder;

  if (instanceMatrix) {
    line.matrixAutoUpdate = false;
    line.matrix.copy(instanceMatrix);
    line.userData.adamExactBaseMatrix = instanceMatrix.clone();
  }

  mesh.add(line);
  target.push(line);
}

function addTriplet(mesh, geometry, instanceMatrix = null) {
  // Deliberately leave the tight exact glow looking like a native additive glow
  // to the generic rim helper, so it will not create yet another missing layer.
  addLine(mesh, geometry, edgeMaterial, edgeLines, 'adamExactStripEdge', 4, instanceMatrix);
  addLine(mesh, geometry, innerGlowMaterial, innerGlowLines, 'adamExactStripGlow', 3, instanceMatrix);
  // Mark outer halo with the generic helper's known marker so it is never used
  // as a native template by rim-glow-filter.js.
  addLine(mesh, geometry, outerGlowMaterial, outerGlowLines, 'adamSupplementalOuterGlow', 2, instanceMatrix);
}

function rebuild(angle) {
  clearLines(edgeLines);
  clearLines(innerGlowLines);
  clearLines(outerGlowLines);
  if (!captureDone || !capturedTargets.length) return;

  for (const target of capturedTargets) {
    const mesh = target.mesh;
    if (!mesh?.parent || !mesh.geometry?.attributes?.position) continue;

    const geometry = makeGeometry(mesh, angle);
    if (!geometry) continue;

    if (mesh.isInstancedMesh) {
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        addTriplet(mesh, geometry, matrix.clone());
      }
    } else {
      addTriplet(mesh, geometry);
    }

    geometry.dispose();
  }

  console.info(
    `[ADAM exact strip edge+glow] built ${edgeLines.length} edge + ` +
    `${innerGlowLines.length} inner glow + ${outerGlowLines.length} outer halo layer(s)`
  );
}

function applyExpansion(line, expansion, multiplier = 1) {
  const scale = 1 + Math.max(0, expansion) * multiplier;
  const base = line.userData.adamExactBaseMatrix;
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
  const identity = capturedTargets.map(t => t.mesh?.uuid || '').join('|');

  if (identity !== lastCapturedIdentity || edge.angle !== lastAngle || !edgeLines.length) {
    lastCapturedIdentity = identity;
    lastAngle = edge.angle;
    rebuild(edge.angle);
  }

  edgeMaterial.color.set(edge.color);
  edgeMaterial.opacity = THREE.MathUtils.clamp(edge.opacity, 0, 1);
  edgeMaterial.linewidth = Math.max(0.01, edge.width);

  const baseGlowOpacity = THREE.MathUtils.clamp(glow.opacity * glow.strength, 0, 1);
  innerGlowMaterial.color.set(glow.color);
  innerGlowMaterial.opacity = THREE.MathUtils.clamp(baseGlowOpacity * INNER_OPACITY_MULTIPLIER, 0, 1);
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

  for (const line of edgeLines) line.visible = edgeVisible;
  for (const line of innerGlowLines) {
    line.visible = glowVisible;
    applyExpansion(line, glow.expansion, 1);
  }
  for (const line of outerGlowLines) {
    line.visible = glowVisible;
    applyExpansion(line, glow.expansion, 1.8);
  }
}

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function render(scene, camera) {
  sync();
  return previousRender.call(this, scene, camera);
};

window.__ADAM_FIVE_FACE_EDGE_TARGETS = TARGET_PATHS;
window.__ADAM_FIVE_FACE_EDGE_CAPTURED = () => capturedTargets;
window.__ADAM_FIVE_FACE_EDGES = () => edgeLines;
window.__ADAM_FIVE_FACE_INNER_GLOW = () => innerGlowLines;
window.__ADAM_FIVE_FACE_OUTER_GLOW = () => outerGlowLines;
