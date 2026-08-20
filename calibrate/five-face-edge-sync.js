import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/*
  ADAM calibrator — persistent edge-only sync for the five thin architectural
  meshes that are styled as normal building faces but intentionally remain out
  of the native solid/glow classification.

  Critical detail: capture the exact mesh OBJECTS as soon as GLTFLoader returns
  the GLB, before app-v2/spline motion can re-parent anything. Edge generation
  then uses those retained references permanently; it never tries to rediscover
  the targets later from a mutated scene hierarchy.
*/

const TARGET_PATHS = [
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_2_5',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_10',
  'Scene_1/Main_Group/clusters/cluster_2/Rectangle_3_2',
  'Scene_1/Main_Group/clusters/cluster_1/floor',
  'Scene_1/Main_Group/clusters/cluster_1/b10/Rectangle_9'
];
const TARGET_SET = new Set(TARGET_PATHS);

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

  console.info(`[ADAM five-face edges v3] captured ${capturedTargets.length}/${TARGET_PATHS.length} exact GLB targets before motion`);
  const missing = TARGET_PATHS.filter(path => !found.has(path));
  if (missing.length) console.warn('[ADAM five-face edges v3] capture missing:', missing);
}

// This module is loaded before glow-bootstrap imports app-v2.js. Hook the GLTF
// load once, retain the original mesh objects, then restore GLTFLoader so no
// other model loads are affected.
const originalLoadAsync = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function adamCaptureFiveFaceTargets(...args) {
  try {
    const gltf = await originalLoadAsync.apply(this, args);
    captureExactTargets(gltf?.scene);
    return gltf;
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoadAsync;
  }
};

function edgeControls() {
  const wraps = [...document.querySelectorAll('#edgeCtls .ctl')];
  const input = i => wraps[i]?.querySelector('input');
  const color = input(0)?.value || '#d6e296';
  const opacity = Number(input(1)?.value);
  const width = Number(input(2)?.value);
  const angle = Number(input(3)?.value);
  return {
    color,
    opacity: Number.isFinite(opacity) ? opacity : 0.52,
    width: Number.isFinite(width) ? width : 1,
    angle: Number.isFinite(angle) ? angle : 30
  };
}

function edgesVisible() {
  const button = document.getElementById('tEdges');
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

const material = new LineMaterial({
  transparent:true,
  depthTest:true,
  depthWrite:false
});
material.toneMapped = false;

let lines = [];
let lastAngle = null;
let lastCapturedIdentity = null;

function clearLines() {
  for (const line of lines) {
    line.removeFromParent();
    line.geometry?.dispose?.();
  }
  lines = [];
}

function addLine(mesh, geometry, instanceMatrix = null) {
  const line = new LineSegments2(geometry.clone(), material);
  line.userData.adamFiveFaceEdge = true;
  line.frustumCulled = false;
  line.renderOrder = 3;

  if (instanceMatrix) {
    line.matrixAutoUpdate = false;
    line.matrix.copy(instanceMatrix);
  }

  mesh.add(line);
  lines.push(line);
}

function rebuild(angle) {
  clearLines();
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
        addLine(mesh, geometry, matrix.clone());
      }
    } else {
      addLine(mesh, geometry);
    }

    geometry.dispose();
  }

  console.info(`[ADAM five-face edges v3] created ${lines.length} edge layer(s) from ${capturedTargets.length} retained target(s)`);
}

function sync() {
  if (!captureDone) return;

  const controls = edgeControls();
  const identity = capturedTargets.map(t => t.mesh?.uuid || '').join('|');
  if (identity !== lastCapturedIdentity || controls.angle !== lastAngle || !lines.length) {
    lastCapturedIdentity = identity;
    lastAngle = controls.angle;
    rebuild(controls.angle);
  }

  material.color.set(controls.color);
  material.opacity = THREE.MathUtils.clamp(controls.opacity, 0, 1);
  material.linewidth = Math.max(0.01, controls.width);
  material.transparent = true;
  material.needsUpdate = true;

  const size = canvasSize();
  material.resolution.set(size.width, size.height);

  const visible = edgesVisible();
  for (const line of lines) line.visible = visible;
}

const previousRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function render(scene, camera) {
  sync();
  return previousRender.call(this, scene, camera);
};

window.__ADAM_FIVE_FACE_EDGE_TARGETS = TARGET_PATHS;
window.__ADAM_FIVE_FACE_EDGE_CAPTURED = () => capturedTargets;
window.__ADAM_FIVE_FACE_EDGES = () => lines;
